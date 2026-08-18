# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Read-only Docker deployment with Cinephage-to-container path mappings.
- Automated tests and Docker build validation.
- Versioned multi-platform GHCR publishing with provenance, SBOM, and GitHub Releases.

[Unreleased]: https://github.com/vampywiz17/cinephage-stremio-gateway/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/vampywiz17/cinephage-stremio-gateway/compare/v0.2.0...v0.4.0
[0.2.0]: https://github.com/vampywiz17/cinephage-stremio-gateway/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/vampywiz17/cinephage-stremio-gateway/releases/tag/v0.1.0
