import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createApp } from '../src/server.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test('exposes only downloaded titles and streams files with byte ranges', async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'cinephage-bridge-'));
  const movieFolder = path.join(temporaryRoot, 'Present (2025)');
  const seriesFolder = path.join(temporaryRoot, 'Present Show');
  await mkdir(movieFolder);
  await mkdir(seriesFolder);
  await writeFile(path.join(movieFolder, 'Present.mkv'), Buffer.from('0123456789'));
  await writeFile(path.join(seriesFolder, 'S01E01.mkv'), Buffer.from('abcdefghij'));

  const cinephage = http.createServer((req, res) => {
    assert.equal(req.headers['x-api-key'], 'test-key');
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/library/movies') {
      return res.end(
        JSON.stringify({
          movies: [
            {
              id: 'movie-present',
              tmdbId: 100,
              imdbId: 'tt0000100',
              title: 'Present',
              year: 2025,
              rootFolderPath: '/cinephage/movies',
              path: 'Present (2025)',
              hasFile: true,
              files: [
                {
                  id: 'file-1',
                  relativePath: 'Present.mkv',
                  size: 20335782489,
                  quality: {
                    resolution: '2160p',
                    source: 'webdl',
                    codec: 'h265',
                    hdr: 'dolby-vision'
                  },
                  mediaInfo: {
                    videoCodec: 'HEVC',
                    videoProfile: 'Main 10',
                    videoBitDepth: 10,
                    videoHdrFormat: 'Dolby Vision HDR10',
                    runtime: 6494,
                    audioCodec: 'DD+',
                    audioChannels: 6,
                    audioLanguages: ['hun', 'eng'],
                    subtitleLanguages: ['hun', 'hun', 'eng']
                  },
                  releaseGroup: 'PTHD'
                }
              ]
            },
            {
              id: 'movie-missing',
              tmdbId: 101,
              imdbId: 'tt0000101',
              title: 'Missing',
              rootFolderPath: '/cinephage/movies',
              path: 'Missing (2025)',
              hasFile: false,
              files: []
            },
            {
              id: 'movie-strm',
              tmdbId: 102,
              imdbId: 'tt0000102',
              title: 'Placeholder',
              rootFolderPath: '/cinephage/movies',
              path: 'Placeholder (2025)',
              hasFile: true,
              files: [{ id: 'file-strm', relativePath: 'Placeholder.strm', size: 100 }]
            }
          ]
        })
      );
    }
    if (req.url === '/api/library/series') {
      return res.end(
        JSON.stringify({
          series: [
            {
              id: 'series-present',
              tmdbId: 199,
              imdbId: 'tt0000199',
              title: 'Present Show',
              rootFolderPath: '/cinephage/tv',
              path: 'Present Show',
              episodeFileCount: 1
            },
            { id: 'series-empty', tmdbId: 200, title: 'Empty series', episodeFileCount: 0 }
          ]
        })
      );
    }
    if (req.url === '/api/library/series/series-present') {
      return res.end(
        JSON.stringify({
          series: {
            id: 'series-present',
            tmdbId: 199,
            imdbId: 'tt0000199',
            title: 'Present Show',
            rootFolderPath: '/cinephage/tv',
            path: 'Present Show',
            seasons: [
              {
                seasonNumber: 1,
                episodes: [
                  {
                    id: 'episode-1',
                    title: 'Downloaded',
                    seasonNumber: 1,
                    episodeNumber: 1,
                    file: { id: 'episode-file-1', relativePath: 'S01E01.mkv', size: 10 }
                  },
                  {
                    id: 'episode-2',
                    title: 'Missing',
                    seasonNumber: 1,
                    episodeNumber: 2,
                    file: null
                  }
                ]
              }
            ]
          }
        })
      );
    }
    res.statusCode = 404;
    res.end('{}');
  });
  const cinephageUrl = await listen(cinephage);

  const bridge = createApp(
    {
      cinephageUrl,
      apiKey: 'test-key',
      secret: 's'.repeat(32),
      pathMappings: [
        { source: '/cinephage/movies', target: temporaryRoot },
        { source: '/cinephage/tv', target: temporaryRoot }
      ],
      publicUrl: '',
      addonToken: '',
      libraryCacheTtlMs: 1000,
      seriesCacheTtlMs: 1000,
      streamTokenTtlSeconds: 60,
      cinephageTimeoutMs: 1000,
      logLevel: 'error'
    },
    silentLogger
  );
  const bridgeUrl = await listen(bridge);

  t.after(async () => {
    await close(bridge);
    await close(cinephage);
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  const addonManifest = await fetch(`${bridgeUrl}/manifest.json`).then((r) => r.json());
  assert.equal(addonManifest.id, 'community.cinephage.stremio.gateway');
  assert.equal(addonManifest.name, 'Cinephage Stremio Gateway');

  const movieCatalog = await fetch(`${bridgeUrl}/catalog/movie/cinephage-movies.json`).then((r) => r.json());
  assert.deepEqual(movieCatalog.metas.map((item) => item.name), ['Present']);

  const seriesCatalog = await fetch(`${bridgeUrl}/catalog/series/cinephage-series.json`).then((r) => r.json());
  assert.deepEqual(seriesCatalog.metas.map((item) => item.name), ['Present Show']);

  const streamResponse = await fetch(`${bridgeUrl}/stream/movie/tt0000100.json`).then((r) => r.json());
  assert.equal(streamResponse.streams.length, 1);
  assert.equal(
    streamResponse.streams[0].description,
    [
      'Present.mkv',
      'Direct Play • 2160p • WEB-DL • HEVC Main 10 • Dolby Vision, HDR10',
      '25.1 Mbps • Audio: DD+ 5.1 HUN/ENG • Subtitles: HUN/ENG • 18.9 GB • PTHD'
    ].join('\n')
  );
  assert.equal(streamResponse.streams[0].title, streamResponse.streams[0].description);

  const ranged = await fetch(streamResponse.streams[0].url, { headers: { range: 'bytes=2-5' } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await ranged.text(), '2345');

  const seriesMeta = await fetch(`${bridgeUrl}/meta/series/tt0000199.json`).then((r) => r.json());
  assert.deepEqual(seriesMeta.meta.videos.map((video) => video.id), ['tt0000199:1:1']);
  assert.ok(seriesMeta.meta.videos.every((video) => !Number.isNaN(Date.parse(video.released))));

  const episodeStreams = await fetch(`${bridgeUrl}/stream/series/tt0000199:1:1.json`).then((r) => r.json());
  assert.equal(episodeStreams.streams.length, 1);
  const missingEpisodeStreams = await fetch(`${bridgeUrl}/stream/series/tt0000199:1:2.json`).then((r) => r.json());
  assert.deepEqual(missingEpisodeStreams.streams, []);
});

test('supports Stremio path tokens and legacy query tokens', async (t) => {
  const addonToken = 'shared token';
  const bridge = createApp(
    {
      cinephageUrl: 'http://127.0.0.1:1',
      apiKey: 'test-key',
      secret: 's'.repeat(32),
      pathMappings: [{ source: '/cinephage', target: os.tmpdir() }],
      publicUrl: '',
      addonToken,
      libraryCacheTtlMs: 1000,
      seriesCacheTtlMs: 1000,
      streamTokenTtlSeconds: 60,
      cinephageTimeoutMs: 1000,
      logLevel: 'error'
    },
    silentLogger
  );
  const bridgeUrl = await listen(bridge);
  t.after(() => close(bridge));

  assert.equal((await fetch(`${bridgeUrl}/manifest.json`)).status, 401);

  const pathManifest = await fetch(
    `${bridgeUrl}/${encodeURIComponent(addonToken)}/manifest.json`
  );
  assert.equal(pathManifest.status, 200);
  assert.equal((await pathManifest.json()).id, 'community.cinephage.stremio.gateway');

  const queryManifest = await fetch(
    `${bridgeUrl}/manifest.json?token=${encodeURIComponent(addonToken)}`
  );
  assert.equal(queryManifest.status, 200);

  const landingPage = await fetch(bridgeUrl).then((response) => response.text());
  assert.doesNotMatch(landingPage, /shared(?:%20| )token/);
  assert.match(landingPage, /&lt;ADDON_TOKEN&gt;\/manifest\.json/);
  assert.match(landingPage, /Replace &lt;ADDON_TOKEN&gt;/);
});
