import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CinephageError } from './cinephage.js';

const UPSTREAM_HEADERS = Object.freeze([
  'accept-ranges',
  'content-length',
  'content-range',
  'content-type'
]);

function jsonError(res, status, message) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify({ error: message }));
}

function responseHeaders(upstream, filename) {
  const headers = {
    'cache-control': 'private, no-store'
  };
  for (const name of UPSTREAM_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  if (filename) {
    headers['content-disposition'] = `inline; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
  return headers;
}

export async function proxyLibraryFile(req, res, { client, type, fileId, filename, logger }) {
  const controller = new AbortController();
  const abortUpstream = () => controller.abort();
  req.once('aborted', abortUpstream);
  res.once('close', abortUpstream);

  try {
    const upstream = await client.openLibraryFile({
      type,
      fileId,
      method: req.method,
      range: req.headers.range,
      controller
    });

    if (upstream.status === 401 || upstream.status === 403) {
      await upstream.body?.cancel();
      logger.error('Cinephage rejected the API key for a library stream', {
        type,
        fileId,
        upstreamStatus: upstream.status
      });
      return jsonError(res, 503, 'Cinephage streaming authentication failed');
    }
    if (upstream.status === 404) {
      await upstream.body?.cancel();
      return jsonError(res, 404, 'Media is no longer available');
    }
    if (![200, 206, 416].includes(upstream.status)) {
      await upstream.body?.cancel();
      logger.warn('Unexpected Cinephage library stream response', {
        type,
        fileId,
        upstreamStatus: upstream.status
      });
      return jsonError(res, 502, 'Cinephage could not stream this media');
    }

    res.writeHead(upstream.status, responseHeaders(upstream, filename));
    if (req.method === 'HEAD' || !upstream.body) return res.end();

    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (controller.signal.aborted && (req.aborted || res.destroyed)) return;
    const failure = error instanceof Error ? error : new Error(String(error));
    const status = error instanceof CinephageError ? error.status : 502;
    logger.error('Cinephage library stream proxy failed', {
      type,
      fileId,
      status,
      error: failure.message
    });
    if (!res.headersSent) jsonError(res, status, failure.message);
    else res.destroy(failure);
  } finally {
    req.off('aborted', abortUpstream);
    res.off('close', abortUpstream);
  }
}
