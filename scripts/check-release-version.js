import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = packageJson.version;
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

if (!semver.test(version)) {
  throw new Error(`package.json contains an invalid semantic version: ${version}`);
}

const compose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');
const expectedDefault = `\${BRIDGE_VERSION:-${version}}`;
const occurrences = compose.split(expectedDefault).length - 1;
if (occurrences < 2) {
  throw new Error(
    `docker-compose.yml must use ${expectedDefault} for both the image tag and build argument`
  );
}

const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
if (!envExample.includes(`BRIDGE_VERSION=${version}`)) {
  throw new Error(`.env.example must set BRIDGE_VERSION=${version}`);
}

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
if (!changelog.includes(`## [${version}]`)) {
  throw new Error(`CHANGELOG.md does not contain a ${version} release section`);
}

const requestedTag = process.argv[2];
if (requestedTag && requestedTag !== `v${version}`) {
  throw new Error(`Release tag ${requestedTag} does not match package version v${version}`);
}

console.log(`Version ${version} is consistent${requestedTag ? ` with tag ${requestedTag}` : ''}.`);
