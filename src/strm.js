import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_STRM_BYTES = 16 * 1024;

export function isStrmPath(filename) {
  return path.extname(String(filename)).toLowerCase() === '.strm';
}

export async function readStrmTarget(filename) {
  const stat = await fs.stat(filename);
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_STRM_BYTES) {
    throw new Error('STRM file must be a non-empty text file no larger than 16 KB');
  }

  const content = await fs.readFile(filename, 'utf8');
  const line = content
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
