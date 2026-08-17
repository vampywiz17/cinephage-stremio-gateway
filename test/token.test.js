import test from 'node:test';
import assert from 'node:assert/strict';
import { StreamTokenService } from '../src/token.js';

test('round-trips signed stream claims', () => {
  const service = new StreamTokenService('x'.repeat(32), 60, () => 1_000_000);
  const token = service.create({ type: 'movie', mediaId: 'tt123', fileId: 'file-1' });
  assert.deepEqual(service.verify(token), {
    type: 'movie',
    mediaId: 'tt123',
    fileId: 'file-1',
    exp: 1060
  });
});

test('rejects tampered and expired tokens', () => {
  const valid = new StreamTokenService('x'.repeat(32), 1, () => 1_000_000);
  const token = valid.create({ type: 'movie', mediaId: 'tt123', fileId: 'file-1' });
  assert.throws(() => valid.verify(`${token}x`), /Invalid/);
  const expired = new StreamTokenService('x'.repeat(32), 1, () => 1_002_000);
  assert.throws(() => expired.verify(token), /Expired/);
});
