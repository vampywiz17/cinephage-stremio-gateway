import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
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
  const movieBytes = Buffer.from('0123456789');
  const episodeBytes = Buffer.from('abcdefghij');
  const movieStrmTarget =
    'https://cinephage.example/api/streaming/session/movie/102/master.m3u8?api_key=secret';
  const episodeStrmTarget = 'https://nzbdav.example/stream/episode-3.mkv?token=secret';
  let rejectStreamingAuth = false;
  const libraryFiles = new Map([
    ['movie/file-1', { body: movieBytes, contentType: 'video/x-matroska' }],
    [
      'movie/file-strm',
      { body: Buffer.from(`${movieStrmTarget}\n`), contentType: 'application/octet-stream' }
    ],
    [
      'movie/file-strm-invalid',
      { body: Buffer.from('file:///media/movie.mkv'), contentType: 'application/octet-stream' }
    ],
    ['episode/episode-file-1', { body: episodeBytes, contentType: 'video/x-matroska' }],
    [
      'episode/episode-file-3',
      { body: Buffer.from(episodeStrmTarget), contentType: 'application/octet-stream' }
    ]
  ]);

  const cinephage = http.createServer((req, res) => {
    assert.equal(req.headers['x-api-key'], 'test-key');
    const streamMatch = /^\/api\/streaming\/library\/(movie|episode)\/([^/?]+)$/.exec(req.url);
    if (streamMatch) {
      if (rejectStreamingAuth) {
        res.statusCode = 401;
        return res.end('Unauthorized');
      }
      const file = libraryFiles.get(`${streamMatch[1]}/${decodeURIComponent(streamMatch[2])}`);
      if (!file) {
        res.statusCode = 404;
        return res.end('Not found');
      }

      res.setHeader('content-type', file.contentType);
      res.setHeader('accept-ranges', 'bytes');
      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match || Number(match[1]) >= file.body.length) {
          res.statusCode = 416;
          res.setHeader('content-range', `bytes */${file.body.length}`);
          return res.end();
        }
        const start = Number(match[1]);
        const end = match[2] ? Math.min(Number(match[2]), file.body.length - 1) : file.body.length - 1;
        const body = file.body.subarray(start, end + 1);
        res.statusCode = 206;
        res.setHeader('content-range', `bytes ${start}-${end}/${file.body.length}`);
        res.setHeader('content-length', String(body.length));
        return req.method === 'HEAD' ? res.end() : res.end(body);
      }

      res.setHeader('content-length', String(file.body.length));
      return req.method === 'HEAD' ? res.end() : res.end(file.body);
    }

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
              hasFile: false,
              files: []
            },
            {
              id: 'movie-strm',
              tmdbId: 102,
              imdbId: 'tt0000102',
              title: 'Placeholder',
              hasFile: true,
              files: [{ id: 'file-strm', relativePath: 'Placeholder.strm', size: 100 }]
            },
            {
              id: 'movie-strm-invalid',
              tmdbId: 103,
              imdbId: 'tt0000103',
              title: 'Invalid link',
              hasFile: true,
              files: [{ id: 'file-strm-invalid', relativePath: 'Invalid.strm', size: 23 }]
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
                  },
                  {
                    id: 'episode-3',
                    title: 'Linked stream',
                    seasonNumber: 1,
                    episodeNumber: 3,
                    file: { id: 'episode-file-3', relativePath: 'S01E03.strm', size: 60 }
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
      streamingApiKey: 'test-key',
      secret: 's'.repeat(32),
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
  });

  const addonManifest = await fetch(`${bridgeUrl}/manifest.json`).then((r) => r.json());
  assert.equal(addonManifest.id, 'community.cinephage.stremio.gateway');
  assert.equal(addonManifest.name, 'Cinephage Stremio Gateway');

  const movieCatalog = await fetch(`${bridgeUrl}/catalog/movie/cinephage-movies.json`).then((r) => r.json());
  assert.deepEqual(movieCatalog.metas.map((item) => item.name), [
    'Present',
    'Placeholder',
    'Invalid link'
  ]);

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
  assert.doesNotMatch(streamResponse.streams[0].url, /test-key|api_key|x-api-key/i);

  const head = await fetch(streamResponse.streams[0].url, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(movieBytes.length));
  assert.equal(head.headers.get('accept-ranges'), 'bytes');
  assert.equal(await head.text(), '');

  const full = await fetch(streamResponse.streams[0].url);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'video/x-matroska');
  assert.match(full.headers.get('content-disposition'), /Present\.mkv/);
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), movieBytes);

  const ranged = await fetch(streamResponse.streams[0].url, { headers: { range: 'bytes=2-5' } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await ranged.text(), '2345');

  const invalidRange = await fetch(streamResponse.streams[0].url, {
    headers: { range: 'bytes=100-200' }
  });
  assert.equal(invalidRange.status, 416);
  assert.equal(invalidRange.headers.get('content-range'), 'bytes */10');

  const strmResponse = await fetch(`${bridgeUrl}/stream/movie/tt0000102.json`).then((r) => r.json());
  assert.equal(strmResponse.streams.length, 1);
  assert.equal(strmResponse.streams[0].description, 'Placeholder.strm\nSTRM');
  assert.equal(strmResponse.streams[0].behaviorHints.filename, undefined);
  assert.equal(strmResponse.streams[0].behaviorHints.videoSize, undefined);
  const strmRedirect = await fetch(strmResponse.streams[0].url, { redirect: 'manual' });
  assert.equal(strmRedirect.status, 307);
  assert.equal(strmRedirect.headers.get('location'), movieStrmTarget);
  const invalidStrmResponse = await fetch(`${bridgeUrl}/stream/movie/tt0000103.json`).then((r) =>
    r.json()
  );
  assert.deepEqual(invalidStrmResponse.streams, []);

  const seriesMeta = await fetch(`${bridgeUrl}/meta/series/tt0000199.json`).then((r) => r.json());
  assert.deepEqual(seriesMeta.meta.videos.map((video) => video.id), [
    'tt0000199:1:1',
    'tt0000199:1:2',
    'tt0000199:1:3'
  ]);
  assert.ok(seriesMeta.meta.videos.every((video) => !Number.isNaN(Date.parse(video.released))));

  const episodeStreams = await fetch(`${bridgeUrl}/stream/series/tt0000199:1:1.json`).then((r) => r.json());
  assert.equal(episodeStreams.streams.length, 1);
  const episodeRange = await fetch(episodeStreams.streams[0].url, {
    headers: { range: 'bytes=1-3' }
  });
  assert.equal(episodeRange.status, 206);
  assert.equal(episodeRange.headers.get('content-range'), 'bytes 1-3/10');
  assert.equal(await episodeRange.text(), 'bcd');
  const missingEpisodeStreams = await fetch(`${bridgeUrl}/stream/series/tt0000199:1:2.json`).then((r) => r.json());
  assert.deepEqual(missingEpisodeStreams.streams, []);
  const strmEpisodeStreams = await fetch(`${bridgeUrl}/stream/series/tt0000199:1:3.json`).then((r) =>
    r.json()
  );
  assert.equal(strmEpisodeStreams.streams.length, 1);
  const episodeRedirect = await fetch(strmEpisodeStreams.streams[0].url, { redirect: 'manual' });
  assert.equal(episodeRedirect.status, 307);
  assert.equal(episodeRedirect.headers.get('location'), episodeStrmTarget);

  libraryFiles.delete('movie/file-1');
  const disappearedFile = await fetch(streamResponse.streams[0].url);
  assert.equal(disappearedFile.status, 404);
  assert.deepEqual(await disappearedFile.json(), { error: 'Media is no longer available' });

  libraryFiles.set('movie/file-1', { body: movieBytes, contentType: 'video/x-matroska' });
  rejectStreamingAuth = true;
  const rejectedStream = await fetch(streamResponse.streams[0].url);
  assert.equal(rejectedStream.status, 503);
  assert.deepEqual(await rejectedStream.json(), {
    error: 'Cinephage streaming authentication failed'
  });
});

test('supports Stremio path tokens and legacy query tokens', async (t) => {
  const addonToken = 'shared token';
  const bridge = createApp(
    {
      cinephageUrl: 'http://127.0.0.1:1',
      streamingApiKey: 'test-key',
      secret: 's'.repeat(32),
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
