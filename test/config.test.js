import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('loadConfig validates the bridge secret', () => {
  assert.throws(
    () =>
      loadConfig({
        CINEPHAGE_URL: 'http://cinephage:3000',
        CINEPHAGE_STREAMING_API_KEY: 'key',
        BRIDGE_SECRET: 'short'
      }),
    /at least 32/
  );
});

test('loadConfig accepts the API-only configuration', () => {
  const config = loadConfig({
    CINEPHAGE_URL: 'http://cinephage:3000',
    CINEPHAGE_STREAMING_API_KEY: 'key',
    BRIDGE_SECRET: 's'.repeat(32)
  });

  assert.equal(config.cinephageUrl, 'http://cinephage:3000');
  assert.equal(config.streamingApiKey, 'key');
});
