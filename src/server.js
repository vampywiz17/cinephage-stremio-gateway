import http from 'node:http';
import { CinephageClient, CinephageError } from './cinephage.js';
import { MediaLibrary } from './library.js';
import { PathMapper } from './path-mapper.js';
import { StreamTokenService } from './token.js';
import { serveMedia } from './media-server.js';
import { isStrmPath, readStrmTarget } from './strm.js';
import { VERSION } from './version.js';

const ADDON_ID = 'community.cinephage.stremio.gateway';
const ADDON_NAME = 'Cinephage Stremio Gateway';

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  res.end(JSON.stringify(body));
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(html);
}

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function routeMatch(pathname, expression) {
  const match = expression.exec(pathname);
  return match ? match.slice(1).map(decode) : null;
}

function parseExtra(segment, url) {
  const result = Object.fromEntries(url.searchParams);
  if (segment) {
    for (const part of segment.split('&')) {
      const separator = part.indexOf('=');
      if (separator > 0) result[decode(part.slice(0, separator))] = decode(part.slice(separator + 1));
    }
  }
  return result;
}

function manifest() {
  const extra = [
    { name: 'skip', isRequired: false },
    { name: 'search', isRequired: false }
  ];
  return {
    id: ADDON_ID,
    version: VERSION,
    name: ADDON_NAME,
    description: 'Exposes playable media from your Cinephage library through the Stremio Addon Protocol.',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb:'],
    catalogs: [
      { type: 'movie', id: 'cinephage-movies', name: 'Cinephage Movies', extra, pageSize: 50 },
      { type: 'series', id: 'cinephage-series', name: 'Cinephage Series', extra, pageSize: 50 }
    ],
    behaviorHints: { configurable: false, configurationRequired: false }
  };
}

function publicBaseUrl(config, req) {
  if (config.publicUrl) return config.publicUrl;
  const forwardedProto = req.headers['x-forwarded-proto']?.split(',')[0]?.trim();
  const protocol = forwardedProto || (req.socket.encrypted ? 'https' : 'http');
  const forwardedHost = req.headers['x-forwarded-host']?.split(',')[0]?.trim();
  const host = forwardedHost || req.headers.host;
  return `${protocol}://${host}`;
}

function addonAuthorized(config, url) {
  if (!config.addonToken) return true;
  return url.searchParams.get('token') === config.addonToken;
}

function addonPath(config, pathname, url) {
  if (!config.addonToken) return pathname;
  const prefix = `/${encodeURIComponent(config.addonToken)}`;
  if (pathname === prefix) return '/';
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  return addonAuthorized(config, url) ? pathname : null;
}

function manifestPath(config) {
  return config.addonToken
    ? '/&lt;ADDON_TOKEN&gt;/manifest.json'
    : '/manifest.json';
}

export function createApp(config, logger) {
  const client = new CinephageClient(config, logger);
  const library = new MediaLibrary(client);
  const mapper = new PathMapper(config.pathMappings);
  const tokens = new StreamTokenService(config.secret, config.streamTokenTtlSeconds);

  async function resolveClaimsFile(claims) {
    const resolved =
      claims.type === 'movie'
        ? await library.resolveMovieFile(claims.mediaId, claims.fileId)
        : claims.type === 'series'
          ? await library.resolveEpisodeFile(claims.mediaId, claims.fileId)
          : null;
    if (!resolved) return null;
    const filename = mapper.resolve(
      resolved.item.rootFolderPath,
      resolved.item.path,
      resolved.file.relativePath
    );
    return await mapper.verify(filename);
  }

  async function fileAvailable(item, file) {
    try {
      const filename = mapper.resolve(item.rootFolderPath, item.path, file.relativePath);
      const verified = await mapper.verify(filename);
      if (isStrmPath(verified)) await readStrmTarget(verified);
      return true;
    } catch (error) {
      logger.warn('Cinephage file record is not available on the mounted volume', {
        fileId: file.id,
        relativePath: file.relativePath,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  async function handler(req, res) {
    const started = performance.now();
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = url.pathname.replace(/\/{2,}/g, '/');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, HEAD, OPTIONS');
    res.setHeader('access-control-allow-headers', 'Range, Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    try {
      if (pathname === '/health') {
        return sendJson(res, 200, { status: 'ok', version: VERSION });
      }

      if (pathname === '/') {
        const base = publicBaseUrl(config, req);
        const addonManifestPath = manifestPath(config);
        const manifestUrl = `${base}${addonManifestPath}`;
        const installUrl = manifestUrl.replace(/^https?:\/\//, 'stremio://');
        const installLink = config.addonToken
          ? '<p>Replace &lt;ADDON_TOKEN&gt; with the configured token before installing.</p>'
          : `<p><a href="${installUrl}">Install in Stremio</a></p>`;
        return sendHtml(
          res,
          200,
          `<!doctype html><html><head><meta charset="utf-8"><title>${ADDON_NAME}</title></head><body><h1>${ADDON_NAME}</h1><p>Install this Stremio-compatible addon in Stremio or NuvioTV:</p><code>${manifestUrl}</code>${installLink}</body></html>`
        );
      }

      const mediaRoute = routeMatch(pathname, /^\/media\/([^/]+)$/);
      if (mediaRoute && ['GET', 'HEAD'].includes(req.method)) {
        let claims;
        try {
          claims = tokens.verify(mediaRoute[0]);
        } catch (error) {
          return sendJson(res, 401, { error: error.message });
        }
        let filename;
        try {
          filename = await resolveClaimsFile(claims);
        } catch (error) {
          logger.warn('Signed media URL no longer resolves to an available file', {
            error: error instanceof Error ? error.message : String(error)
          });
          return sendJson(res, 404, { error: 'Media is no longer available' });
        }
        if (!filename) return sendJson(res, 404, { error: 'Media is no longer available' });
        if (isStrmPath(filename)) {
          let target;
          try {
            target = await readStrmTarget(filename);
          } catch (error) {
            logger.warn('Signed STRM URL no longer resolves to a playable target', {
              error: error instanceof Error ? error.message : String(error)
            });
            return sendJson(res, 404, { error: 'Media is no longer available' });
          }
          res.writeHead(307, {
            location: target,
            'cache-control': 'private, no-store',
            'referrer-policy': 'no-referrer'
          });
          return res.end();
        }
        return await serveMedia(req, res, filename);
      }

      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      pathname = addonPath(config, pathname, url);
      if (!pathname) return sendJson(res, 401, { error: 'Invalid addon token' });

      if (pathname === '/manifest.json') return sendJson(res, 200, manifest());

      const catalogRoute = routeMatch(
        pathname,
        /^\/catalog\/(movie|series)\/(cinephage-movies|cinephage-series)(?:\/([^/]+))?\.json$/
      );
      if (catalogRoute) {
        const [type, catalogId, extraSegment] = catalogRoute;
        if (
          (type === 'movie' && catalogId !== 'cinephage-movies') ||
          (type === 'series' && catalogId !== 'cinephage-series')
        ) {
          return sendJson(res, 404, { metas: [] });
        }
        const extra = parseExtra(extraSegment, url);
        const skip = Math.max(0, Number.parseInt(extra.skip || '0', 10) || 0);
        const metas = await library.catalog(type, { skip, search: extra.search || '' });
        return sendJson(res, 200, { metas }, { 'cache-control': 'public, max-age=30' });
      }

      const metaRoute = routeMatch(pathname, /^\/meta\/(movie|series)\/(.+)\.json$/);
      if (metaRoute) {
        const [type, id] = metaRoute;
        const meta = type === 'movie' ? await library.movieMeta(id) : await library.seriesMeta(id);
        return meta
          ? sendJson(res, 200, { meta }, { 'cache-control': 'public, max-age=300' })
          : sendJson(res, 404, { error: 'Meta not found' });
      }

      const streamRoute = routeMatch(pathname, /^\/stream\/(movie|series)\/(.+)\.json$/);
      if (streamRoute) {
        const [type, id] = streamRoute;
        const base = publicBaseUrl(config, req);
        const makeUrl = (claims) => `${base}/media/${tokens.create(claims)}`;
        const streams =
          type === 'movie'
            ? await library.movieStreams(id, makeUrl, fileAvailable)
            : await library.episodeStreams(id, makeUrl, fileAvailable);
        return sendJson(res, 200, { streams }, { 'cache-control': 'no-store' });
      }

      return sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      const status = error instanceof CinephageError ? error.status : 500;
      logger.error('Request failed', {
        method: req.method,
        path: pathname,
        status,
        error: error instanceof Error ? error.message : String(error)
      });
      if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'Internal server error' : error.message });
      else res.destroy(error);
    } finally {
      logger.debug('Request completed', {
        method: req.method,
        path: pathname,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - started)
      });
    }
  }

  return http.createServer(handler);
}
