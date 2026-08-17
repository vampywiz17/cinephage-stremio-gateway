import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION } from '../src/version.js';

test('exports the package version as the runtime version', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  );
  assert.equal(VERSION, packageJson.version);
  assert.match(VERSION, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
});
