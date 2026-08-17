import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseByteRange } from './range.js';

const CONTENT_TYPES = Object.freeze({
  '.mkv': 'video/x-matroska',
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg'
});

function contentType(filename) {
  return CONTENT_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

function baseHeaders(filename, stat) {
  return {
    'accept-ranges': 'bytes',
    'content-type': contentType(filename),
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(path.basename(filename))}`,
    'cache-control': 'private, no-store',
    'last-modified': stat.mtime.toUTCString(),
    etag: `\"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}\"`
  };
}

export async function serveMedia(req, res, filename) {
  let stat;
  try {
    stat = await fsp.stat(filename);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Media file not found' }));
      return;
    }
    throw error;
  }
  if (!stat.isFile()) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Media file not found' }));
    return;
  }

  const headers = baseHeaders(filename, stat);
  const range = parseByteRange(req.headers.range, stat.size);
  if (range?.invalid) {
    res.writeHead(416, { ...headers, 'content-range': `bytes */${stat.size}` });
    res.end();
    return;
  }

  if (range) {
    res.writeHead(206, {
      ...headers,
      'content-length': String(range.length),
      'content-range': `bytes ${range.start}-${range.end}/${stat.size}`
    });
    if (req.method === 'HEAD') return res.end();
    return pipeFile(res, filename, { start: range.start, end: range.end });
  }

  res.writeHead(200, { ...headers, 'content-length': String(stat.size) });
  if (req.method === 'HEAD') return res.end();
  return pipeFile(res, filename);
}

function pipeFile(res, filename, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filename, options);
    stream.on('error', reject);
    res.on('close', resolve);
    res.on('finish', resolve);
    stream.pipe(res);
  });
}
