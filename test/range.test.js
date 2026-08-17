import test from 'node:test';
import assert from 'node:assert/strict';
import { parseByteRange } from '../src/range.js';

test('parses bounded byte ranges', () => {
  assert.deepEqual(parseByteRange('bytes=10-19', 100), { start: 10, end: 19, length: 10 });
});

test('clamps ranges to the file size', () => {
  assert.deepEqual(parseByteRange('bytes=90-999', 100), { start: 90, end: 99, length: 10 });
});

test('parses suffix ranges', () => {
  assert.deepEqual(parseByteRange('bytes=-5', 100), { start: 95, end: 99, length: 5 });
});

test('rejects invalid or multiple ranges', () => {
  assert.deepEqual(parseByteRange('bytes=100-101', 100), { invalid: true });
  assert.deepEqual(parseByteRange('bytes=0-1,4-5', 100), { invalid: true });
});
