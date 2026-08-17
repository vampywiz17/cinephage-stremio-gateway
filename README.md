# Cinephage Nuvio Bridge

[![CI](https://github.com/vampywiz17/cinephage-nuvio-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/vampywiz17/cinephage-nuvio-bridge/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/vampywiz17/cinephage-nuvio-bridge)](https://github.com/vampywiz17/cinephage-nuvio-bridge/releases)
[![Container](https://img.shields.io/badge/ghcr.io-container-blue)](https://github.com/vampywiz17/cinephage-nuvio-bridge/pkgs/container/cinephage-nuvio-bridge)

A small, read-only bridge that exposes media already downloaded by
[Cinephage](https://github.com/MoldyTaint/Cinephage) as a standard Stremio addon for
[NuvioTV](https://github.com/NuvioMedia/NuvioTV).

The bridge does not modify either upstream project. Cinephage remains the source of truth for
library metadata, while the bridge streams files from read-only mounted media volumes.

## What it does

- Provides Stremio `manifest`, `catalog`, `meta`, and `stream` resources.
- Shows only movies for which Cinephage reports `hasFile: true` and at least one downloaded file
  record (`.strm` placeholders are excluded).
- Shows only series for which Cinephage reports at least one downloaded episode file.
- Re-checks the Cinephage record and the mounted file before playback.
- Streams files directly with HTTP byte ranges (`206 Partial Content`) and seeking support.
- Uses expiring HMAC-signed media URLs and never exposes filesystem paths.
- Runs without a database, transcoder, npm dependencies, or build step.

## Important limitations

- This is a direct-play bridge. It does not transcode unsupported video/audio formats.
- The media folders must be mounted into the bridge container read-only.
- Cinephage's library API is not currently a formally versioned public API. The bridge uses a
  small adapter and validates response shapes, but a future upstream API change may require an
  update.
- Only use the bridge for media you are authorized to access.

## Quick start with Docker Compose

1. Create a Cinephage API key.
2. Copy `.env.example` to `.env` and set at least:

   ```env
   CINEPHAGE_URL=http://cinephage:3000
   CINEPHAGE_API_KEY=your-cinephage-api-key
   BRIDGE_SECRET=generate-a-random-secret-with-at-least-32-characters
   PUBLIC_URL=http://192.168.1.20:8090
   PATH_MAPPINGS={"/movies":"/media/movies","/tv":"/media/tv"}
   ```

3. Edit the volume sources in `docker-compose.yml`:

   ```yaml
   volumes:
     - /mnt/storage/movies:/media/movies:ro
     - /mnt/storage/tv:/media/tv:ro
   ```

4. Ensure the bridge and Cinephage share a Docker network. The example expects an existing
   network called `cinephage`:

   ```bash
   docker network create cinephage
   docker compose up -d --build
   ```

   Compose uses `pull_policy: build`, builds the image locally, and tags it as
   `ghcr.io/vampywiz17/cinephage-nuvio-bridge:0.2.0`. Set `BRIDGE_VERSION` if you are building a
   different checked-out release.

5. In NuvioTV, install:

   ```text
   http://192.168.1.20:8090/manifest.json
   ```

For access outside a trusted LAN, place the bridge behind an HTTPS reverse proxy and set
`PUBLIC_URL` to the external HTTPS origin.

## Path mappings

Cinephage returns paths as seen inside the Cinephage container. The bridge sees paths inside its
own container, so the prefixes must be translated.

Example Cinephage configuration:

```text
Movie root: /data/movies
TV root:    /data/tv
```

Bridge mounts:

```yaml
volumes:
  - /mnt/media/movies:/media/movies:ro
  - /mnt/media/tv:/media/tv:ro
```

Mapping:

```env
PATH_MAPPINGS={"/data/movies":"/media/movies","/data/tv":"/media/tv"}
```

Windows paths reported by a bare-metal Cinephage instance are also accepted:

```env
PATH_MAPPINGS={"D:/Movies":"/media/movies","D:/TV":"/media/tv"}
```

The longest matching source prefix wins. Every resolved path is checked to ensure it remains
inside one of the configured target roots.

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `CINEPHAGE_URL` | yes | — | Base URL of the Cinephage server. |
| `CINEPHAGE_API_KEY` | yes | — | Cinephage API key, stored only by the bridge. |
| `BRIDGE_SECRET` | yes | — | At least 32 characters; signs expiring stream URLs. |
| `PATH_MAPPINGS` | yes | — | JSON object or comma-separated `source=target` mappings. |
| `PORT` | no | `8090` | HTTP listen port. |
| `PUBLIC_URL` | recommended | inferred | Origin placed in stream URLs. Set this behind a proxy. |
| `ADDON_TOKEN` | no | empty | Optional shared token required on addon API requests. |
| `LIBRARY_CACHE_TTL_SECONDS` | no | `30` | Movie and series-list cache lifetime. |
| `SERIES_CACHE_TTL_SECONDS` | no | `30` | Series-detail cache lifetime. |
| `STREAM_TOKEN_TTL_SECONDS` | no | `21600` | Signed media URL lifetime. |
| `CINEPHAGE_TIMEOUT_SECONDS` | no | `15` | Upstream request timeout. |
| `LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, or `error`. |

`BRIDGE_VERSION` is a Docker Compose interpolation variable rather than an application environment
variable. Its default must match the version in `package.json`.

### Optional addon token

If `ADDON_TOKEN` is configured, install the manifest URL with the token:

```text
https://media.example.com/manifest.json?token=your-token
```

NuvioTV preserves the query string when requesting catalog, meta, and stream resources. Generated
media URLs use their own expiring signature and do not contain the addon token.

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

Stream responses include a Nuvio-friendly technical description when Cinephage provides media
information. It can contain resolution, source, video codec and profile, HDR format, calculated
overall bitrate, audio codec/channels/languages, embedded subtitle languages, release group, and
file size. The description is derived from the Cinephage API; the bridge does not scan media files.

## Reverse proxy example (Caddy)

```caddyfile
media.example.com {
    reverse_proxy cinephage-nuvio-bridge:8090
}
```

Set:

```env
PUBLIC_URL=https://media.example.com
```

The proxy must not buffer complete media responses and must pass `Range` headers.

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
   git tag -a v0.2.0 -m "v0.2.0"
   git push origin v0.2.0
   ```

Every push to `main` publishes a multi-platform `edge` image. A release tag additionally verifies
the version, creates `linux/amd64` and `linux/arm64` images, publishes them to
`ghcr.io/vampywiz17/cinephage-nuvio-bridge`, attaches semantic tags (`0.2.0`, `0.2`, `0`, and
`latest` for stable releases), generates provenance and an SBOM, and creates a GitHub Release.

To use a published image instead of building locally, remove the `build:` block from Compose or
run it from a deployment-specific override file.

## How availability is determined

The bridge deliberately distinguishes library metadata from downloaded media:

- Movie: `hasFile === true` and at least one non-`.strm` file record.
- Series catalog: `episodeFileCount > 0`.
- Series playback: the requested episode must contain a `file` record.
- Stream response and media request: the same Cinephage file ID must still resolve and the mapped
  path must still be a non-empty regular file on disk. Symlinks may not escape the mounted root.

Consequently, monitored or metadata-only titles are not exposed as playable streams. The short
cache TTL avoids repeatedly loading large libraries while still reflecting additions and removals
quickly.

## License

[MIT](LICENSE)
