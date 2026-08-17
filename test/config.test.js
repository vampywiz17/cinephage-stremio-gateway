import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadConfig, parsePathMappings } from '../src/config.js';

test('parsePathMappings accepts JSON and prefers the longest prefix', () => {
  const mappings = parsePathMappings('{"/media":"/mnt/all","/media/tv":"/mnt/tv"}');
  assert.equal(mappings[0].source, '/media/tv');
  assert.equal(mappings[0].target, path.resolve('/mnt/tv'));
});

test('loadConfig validates the bridge secret', () => {
  assert.throws(
    () =>
      loadConfig({
        CINEPHAGE_URL: 'http://cinephage:3000',
        CINEPHAGE_API_KEY: 'key',
        BRIDGE_SECRET: 'short',
        PATH_MAPPINGS: '/movies=/media/movies'
      }),
    /at least 32/
  );
});
