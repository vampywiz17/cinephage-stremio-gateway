const MAX_STRM_BYTES = 16 * 1024;

export function isStrmPath(filename) {
  return String(filename).replaceAll('\\', '/').toLowerCase().endsWith('.strm');
}

export function parseStrmTarget(content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(String(content));
  if (bytes.length <= 0 || bytes.length > MAX_STRM_BYTES) {
    throw new Error('STRM content must be non-empty and no larger than 16 KB');
  }

  const line = bytes
    .toString('utf8')
    .split(/\r?\n/)
    .map((value) => value.trim().replace(/^\uFEFF/, ''))
    .find(Boolean);
  if (!line) throw new Error('STRM file does not contain a target URL');

  let target;
  try {
    target = new URL(line);
  } catch {
    throw new Error('STRM file does not contain a valid target URL');
  }
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('STRM target must use HTTP or HTTPS');
  }
  return target.href;
}

export async function readStrmTarget(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_STRM_BYTES) {
    throw new Error('STRM content is larger than 16 KB');
  }
  if (!response.body) throw new Error('STRM response does not contain a body');

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_STRM_BYTES) {
        throw new Error('STRM content is larger than 16 KB');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return parseStrmTarget(Buffer.concat(chunks, total));
}
