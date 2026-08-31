import test from 'node:test';
import assert from 'node:assert/strict';
import { isStrmPath, parseStrmTarget, readStrmTarget } from '../src/strm.js';

test('recognizes STRM metadata paths without filesystem access', () => {
  assert.equal(isStrmPath('Season 01\\Episode.strm'), true);
  assert.equal(isStrmPath('movie.mkv'), false);
});

test('parses the first non-empty HTTP target from STRM content', () => {
  assert.equal(
    parseStrmTarget('\uFEFF\n https://media.example/movie.mkv?token=secret\nignored'),
    'https://media.example/movie.mkv?token=secret'
  );
  assert.throws(() => parseStrmTarget('file:///media/movie.mkv'), /HTTP or HTTPS/);
});

test('reads a bounded STRM response body', async () => {
  const response = new Response('https://media.example/episode.mkv\n', {
    headers: { 'content-length': '34' }
  });
  assert.equal(await readStrmTarget(response), 'https://media.example/episode.mkv');
});

test('rejects oversized STRM API responses before buffering them', async () => {
  const response = new Response('https://media.example/movie.mkv', {
    headers: { 'content-length': String(16 * 1024 + 1) }
  });
  await assert.rejects(() => readStrmTarget(response), /larger than 16 KB/);
});
