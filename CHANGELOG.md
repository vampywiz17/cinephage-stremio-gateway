# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-08-17

### Added

- Playback for mounted `.strm` files containing an HTTP(S) target, including Cinephage-generated,
  manually created, and compatible virtual-library links.
- Signed media URLs now resolve valid `.strm` files with a temporary redirect without proxying the
  target stream.

## [0.2.0] - 2026-08-17

### Added

- Rich Nuvio stream descriptions generated from Cinephage quality and media information.
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
- Read-only Docker deployment with Cinephage-to-container path mappings.
- Automated tests and Docker build validation.
- Versioned multi-platform GHCR publishing with provenance, SBOM, and GitHub Releases.

[Unreleased]: https://github.com/vampywiz17/cinephage-nuvio-bridge/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/vampywiz17/cinephage-nuvio-bridge/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/vampywiz17/cinephage-nuvio-bridge/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/vampywiz17/cinephage-nuvio-bridge/releases/tag/v0.1.0
