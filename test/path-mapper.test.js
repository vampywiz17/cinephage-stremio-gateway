import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { PathMapper } from '../src/path-mapper.js';

test('maps Cinephage paths into the mounted volume', () => {
  const mapper = new PathMapper([{ source: '/movies', target: path.resolve('/media/movies') }]);
  assert.equal(
    mapper.resolve('/movies', 'Example (2025)', 'Example.mkv'),
    path.resolve('/media/movies/Example (2025)/Example.mkv')
  );
});

test('supports Windows paths reported by Cinephage', () => {
  const mapper = new PathMapper([
    { source: 'D:/Movies', target: path.resolve('/media/movies') }
  ]);
  assert.equal(
    mapper.resolve('D:\\Movies', 'Example', 'Example.mkv'),
    path.resolve('/media/movies/Example/Example.mkv')
  );
});

test('rejects path traversal', () => {
  const mapper = new PathMapper([{ source: '/movies', target: path.resolve('/media/movies') }]);
  assert.throws(() => mapper.resolve('/movies', '..', '../secret'), /escapes/);
});
