# Changelog

All notable changes are documented here. The format follows Keep a Changelog.

## [Unreleased]

## [0.1.2] - 2026-07-24

### Fixed

- Mount a writable runtime-only volume at `/etc/nginx/conf.d` so the Web
  container can render its upstream configuration while retaining a read-only
  root filesystem.
- Use version-matched image tags in the Helm Chart.
- Use tag-specific release notes in the release workflow.

## [0.1.1] - 2026-07-24

### Security

- Updated security-sensitive Go dependencies and build tooling.
- Cleared Go, frontend, container, and secret-scanning release gates.

## [0.1.0] - 2026-07-24

### Added

- Initial explainable Kubernetes diagnostics MVP.
