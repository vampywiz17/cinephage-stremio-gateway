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

test('loadConfig accepts a Media Streaming API Key', () => {
  const config = loadConfig({
    CINEPHAGE_URL: 'http://cinephage:3000',
    CINEPHAGE_STREAMING_API_KEY: 'streaming-key',
    BRIDGE_SECRET: 's'.repeat(32)
  });

  assert.equal(config.cinephageUrl, 'http://cinephage:3000');
  assert.equal(config.apiKey, 'streaming-key');
});

test('loadConfig accepts a Main API Key', () => {
  const config = loadConfig({
    CINEPHAGE_URL: 'http://cinephage:3000',
    CINEPHAGE_API_KEY: 'main-key',
    BRIDGE_SECRET: 's'.repeat(32)
  });

  assert.equal(config.apiKey, 'main-key');
});

test('loadConfig prefers the Main API Key when both are configured', () => {
  const config = loadConfig({
    CINEPHAGE_URL: 'http://cinephage:3000',
    CINEPHAGE_API_KEY: 'main-key',
    CINEPHAGE_STREAMING_API_KEY: 'streaming-key',
    BRIDGE_SECRET: 's'.repeat(32)
  });

  assert.equal(config.apiKey, 'main-key');
});

test('loadConfig requires at least one Cinephage API Key', () => {
  assert.throws(
    () =>
      loadConfig({
        CINEPHAGE_URL: 'http://cinephage:3000',
        BRIDGE_SECRET: 's'.repeat(32)
      }),
    /CINEPHAGE_API_KEY or CINEPHAGE_STREAMING_API_KEY is required/
  );
});
