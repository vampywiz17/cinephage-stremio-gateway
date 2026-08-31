# Cinephage Stremio Gateway

[![CI](https://github.com/vampywiz17/cinephage-stremio-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/vampywiz17/cinephage-stremio-gateway/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/vampywiz17/cinephage-stremio-gateway)](https://github.com/vampywiz17/cinephage-stremio-gateway/releases)
[![Container](https://img.shields.io/badge/ghcr.io-container-blue)](https://github.com/vampywiz17/cinephage-stremio-gateway/pkgs/container/cinephage-stremio-gateway)

A small, read-only bridge that exposes media files and stream links managed by
[Cinephage](https://github.com/MoldyTaint/Cinephage) through the standard
[Stremio Addon Protocol](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md).
It is designed for both [Stremio](https://www.stremio.com/) and Stremio-compatible clients such
as [NuvioTV](https://github.com/NuvioMedia/NuvioTV).

The bridge does not modify either upstream project. Cinephage remains the source of truth for
library metadata and serves registered library files through its authenticated streaming API.

> Upgrading from `cinephage-nuvio-bridge`: change the image, service, and container name to
> `cinephage-stremio-gateway`. The addon must also be reinstalled because its manifest ID changed.

## What it does

- Provides standard Stremio `manifest`, `catalog`, `meta`, and `stream` resources.
- Shows only movies for which Cinephage reports `hasFile: true` and at least one playable file
  record, including HTTP(S) `.strm` links.
- Shows only series for which Cinephage reports at least one downloaded episode file.
- Re-checks the Cinephage record and streaming API before playback.
- Proxies Cinephage library streams with HTTP byte ranges (`206 Partial Content`) and seeking
  support.
- Resolves HTTP(S) `.strm` files fetched through Cinephage with a `307 Temporary Redirect`;
  stream data is not proxied through the bridge.
- Uses expiring HMAC-signed media URLs and never exposes the gateway's configured Cinephage API
  key.
- Runs without a database, transcoder, npm dependencies, or build step.

## Important limitations

- This is a direct-play bridge. It does not transcode unsupported video/audio formats.
- Version 0.6.0 requires Cinephage's local-library streaming API with the movie and episode
  `GET`/`HEAD` endpoints under `/api/streaming/library/`. Both Cinephage Main and Media Streaming
  API Keys are supported; the narrower Media Streaming API Key is recommended.
- A `.strm` target must be reachable from the device running the client. Docker-only hostnames and
  non-HTTP(S) targets are not supported.
- Stremio requires HTTPS for remote addons, except when the addon is served from `127.0.0.1`.
  NuvioTV may allow plain HTTP on a trusted LAN, depending on the platform.
- Cinephage's library API is not currently a formally versioned public API. The bridge uses a
  small adapter and validates response shapes, but a future upstream API change may require an
  update.
- Only use the bridge for media you are authorized to access.

## Quick start with Docker Compose

The supported deployment method is Docker. The included Compose file builds the checked-out
version locally; release images are published to GHCR for `linux/amd64` and `linux/arm64`.

1. Create a Cinephage API key.
2. Copy `.env.example` to `.env` and set at least:

   ```env
   CINEPHAGE_URL=http://cinephage:3000
   CINEPHAGE_STREAMING_API_KEY=your-cinephage-media-streaming-api-key
   # Alternatively: CINEPHAGE_API_KEY=your-cinephage-main-api-key
   BRIDGE_SECRET=generate-a-random-secret-with-at-least-32-characters
   PUBLIC_URL=http://192.168.1.20:8090
   ```

3. Ensure the bridge and Cinephage share a Docker network. The example expects an existing
   network called `cinephage`:

   ```bash
   docker network create cinephage
   docker compose up -d --build
   ```

   Compose uses `pull_policy: build`, builds the image locally, and tags it as
   `ghcr.io/vampywiz17/cinephage-stremio-gateway:0.6.0`. Set `BRIDGE_VERSION` if you are building a
   different checked-out release.

4. Install the manifest URL in Stremio or NuvioTV:

   ```text
   http://192.168.1.20:8090/manifest.json
   ```

For Stremio, or for any access outside a trusted LAN, place the bridge behind an HTTPS reverse
proxy and set `PUBLIC_URL` to the external HTTPS origin. Stremio accepts plain HTTP only from
`127.0.0.1`.

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `CINEPHAGE_URL` | yes | — | Base URL of the Cinephage server. |
| `CINEPHAGE_API_KEY` | one key required | — | Cinephage **Main API Key**. Takes priority when both key variables are set. |
| `CINEPHAGE_STREAMING_API_KEY` | one key required | — | Cinephage **Media Streaming API Key**. Recommended because it has narrower permissions. |
| `BRIDGE_SECRET` | yes | — | At least 32 characters; signs expiring stream URLs. |
| `PORT` | no | `8090` | HTTP listen port. |
| `PUBLIC_URL` | recommended | inferred | Origin placed in stream URLs. Set this behind a proxy. |
| `ADDON_TOKEN` | no | empty | Optional shared token required on addon API requests. |
| `LIBRARY_CACHE_TTL_SECONDS` | no | `30` | Movie and series-list cache lifetime. |
| `SERIES_CACHE_TTL_SECONDS` | no | `30` | Series-detail cache lifetime. |
| `STREAM_TOKEN_TTL_SECONDS` | no | `21600` | Signed media URL lifetime. |
| `CINEPHAGE_TIMEOUT_SECONDS` | no | `15` | Metadata and stream response-header timeout; active media transfers are not time-limited. |
| `LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, or `error`. |

Configure only one of the two API-key variables; there is no benefit to providing both. If both
are set, `CINEPHAGE_API_KEY` takes priority.

`BRIDGE_VERSION` is a Docker Compose interpolation variable rather than an application environment
variable. Its default must match the version in `package.json`.

### Optional addon token

If `ADDON_TOKEN` is configured, use the path-based manifest URL recommended for Stremio addons:

```text
https://media.example.com/your-token/manifest.json
```

The token path is preserved when Stremio or NuvioTV requests catalog, meta, and stream resources.
For compatibility with existing NuvioTV installations, the legacy
`/manifest.json?token=your-token` form is also accepted. New installations should use the
path-based form. Generated media URLs use their own expiring signature and do not contain the
addon token.

## Stremio resources

```text
GET /manifest.json
GET /catalog/movie/cinephage-movies.json
GET /catalog/series/cinephage-series.json
GET /catalog/{type}/{catalog}/skip=50.json
GET /catalog/{type}/{catalog}/search=query.json
GET /meta/movie/{imdb-or-tmdb-id}.json
GET /meta/series/{imdb-or-tmdb-id}.json
GET /stream/movie/{imdb-or-tmdb-id}.json
GET /stream/series/{id}:{season}:{episode}.json
GET|HEAD /media/{signed-token}
GET /health
```

IMDb IDs are preferred. When Cinephage has no IMDb ID, the bridge uses `tmdb:<id>`.

Stream responses include a client-friendly technical description when Cinephage provides media
information. It can contain resolution, source, video codec and profile, HDR format, calculated
overall bitrate, audio codec/channels/languages, embedded subtitle languages, release group, and
file size. The description is derived from the Cinephage API; the bridge does not scan media files.

## Reverse proxy example (Caddy)

```caddyfile
media.example.com {
    reverse_proxy cinephage-stremio-gateway:8090
}
```

Set:

```env
PUBLIC_URL=https://media.example.com
```

The proxy must not buffer complete media responses and must pass `Range` headers.

Stremio installation URLs can also use the `stremio://` scheme. The bridge landing page at `/`
provides an install link using that scheme.

## Development

Node.js 22 or newer is required. There are no package dependencies.

```bash
npm test
npm run check
npm start
```

## Versioning and container releases

The project follows [Semantic Versioning](https://semver.org/). The authoritative application
version is the `version` field in `package.json`; the Stremio manifest and health endpoint read it
at runtime.

To prepare a release:

1. Update `package.json` and both `BRIDGE_VERSION` defaults in `docker-compose.yml`.
2. Run `npm test` and `npm run check`.
3. Merge the change to `main`.
4. Create and push the matching tag, for example:

   ```bash
   git tag -a v0.6.0 -m "v0.6.0"
   git push origin v0.6.0
   ```

Every push to `main` publishes a multi-platform `edge` image. A release tag additionally verifies
the version, creates `linux/amd64` and `linux/arm64` images, publishes them to
`ghcr.io/vampywiz17/cinephage-stremio-gateway`, attaches semantic tags (`0.6.0`, `0.6`, `0`, and
`latest` for stable releases), generates provenance and an SBOM, and creates a GitHub Release.

Pull requests whose branch belongs to this repository publish an `linux/amd64` review image after
CI succeeds. Its tag is `pr-<number>`, for example
`ghcr.io/vampywiz17/cinephage-stremio-gateway:pr-3`. Forked pull requests never receive package write
permission and therefore skip this job.

To use a published image instead of building locally, remove the `build:` block from Compose or
run it from a deployment-specific override file.

## How availability is determined

The bridge deliberately distinguishes library metadata from downloaded media:

- Movie: `hasFile === true` and at least one media or `.strm` file record.
- Series catalog: `episodeFileCount > 0`.
- Series playback: the requested episode must contain a `file` record.
- Stream response and media request: the same Cinephage file ID must still resolve through the
  authenticated Cinephage streaming API.
- `.strm` playback: the API response must be at most 16 KB and its first non-empty line must be a
  valid HTTP(S) URL. Its text-file size is not exposed as the video size.

Consequently, monitored or metadata-only titles are not exposed as playable streams. The short
cache TTL avoids repeatedly loading large libraries while still reflecting additions and removals
quickly.

## License

[MIT](LICENSE)
