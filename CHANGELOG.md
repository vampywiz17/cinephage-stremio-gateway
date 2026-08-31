# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-08-31

### Changed

- Media playback now uses Cinephage's authenticated local-library streaming API instead of
  opening media files inside the gateway container.
- Movie and episode streams proxy Cinephage `GET`, `HEAD`, and byte-range responses without
  buffering complete media files.
- `.strm` files are fetched and validated through the Cinephage API before redirecting clients.

### Removed

- Media directory mounts and Cinephage-to-gateway filesystem path mappings. The gateway no longer
  requires access to Cinephage's storage.

## [0.5.0] - 2026-08-24

### Added

- Playback for `.strm` files containing an HTTP(S) target, including Cinephage-generated,
  manually created, and compatible virtual-library links.
- Signed media URLs now resolve valid `.strm` files with a temporary redirect without proxying the
  target stream.

## [0.4.1] - 2026-08-19

### Fixed

- Series metadata now includes every episode known to Cinephage, not only episodes with a
  downloaded file. Stremio-compatible clients can retain the complete season list and resolve
  missing episode streams from other addons, while the bridge still exposes streams only for
  locally available files.

## [0.4.0] - 2026-08-18

### Added

- Same-repository pull requests publish a `linux/amd64` GHCR review image after CI succeeds.

### Changed

- Renamed the project to Cinephage Stremio Gateway: a standard Stremio Addon Protocol gateway
  compatible with both Stremio and NuvioTV.
- Renamed the Docker image, Compose service, and container to `cinephage-stremio-gateway`;
  versioned multi-platform images are published to GHCR for `linux/amd64` and `linux/arm64`.
- Changed the addon manifest ID to `community.cinephage.stremio.gateway` and the displayed addon
  name to `Cinephage Stremio Gateway`; existing installations must reinstall the addon.
- Added path-based addon token URLs for Stremio while preserving legacy query-token compatibility.
- Series episode metadata now always includes the Stremio-required `released` field.

## [0.2.0] - 2026-08-17

### Added

- Rich client stream descriptions generated from Cinephage quality and media information.
- Resolution, source, video codec/profile, HDR, calculated bitrate, audio layout/languages,
  subtitle languages, release group, and binary file size in stream responses.

### Changed

- Stream metadata is now supplied in both `title` and `description` for compatibility across
  Stremio clients.

## [0.1.0] - 2026-08-17

### Added

- Initial Cinephage library adapter and Stremio-compatible addon API.
- Downloaded-file filtering for movies, series, and episodes.
- Direct media streaming with byte ranges and expiring signed URLs.
- Automated tests and Docker build validation.
- Versioned multi-platform GHCR publishing with provenance, SBOM, and GitHub Releases.

[Unreleased]: https://github.com/vampywiz17/cinephage-stremio-gateway/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/vampywiz17/cinephage-stremio-gateway/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/vampywiz17/cinephage-stremio-gateway/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/vampywiz17/cinephage-stremio-gateway/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/vampywiz17/cinephage-stremio-gateway/compare/v0.2.0...v0.4.0
[0.2.0]: https://github.com/vampywiz17/cinephage-stremio-gateway/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/vampywiz17/cinephage-stremio-gateway/releases/tag/v0.1.0
