# Changelog

All notable changes are documented here. The format follows Keep a Changelog.

## [Unreleased]

## [0.3.0] - 2026-07-24

### Added

- Trusted server-side Observation construction from informer-backed Pod,
  Service, EndpointSlice, Event, Node, and PVC state.
- Plain-language diagnosis reports that separate confirmed issues, suspected
  issues, healthy checks, and unverified checks.
- Persisted diagnosis history, filterable task API, replayable SSE event IDs,
  and health-enriched local topology API.
- Interactive React Flow health topology with fault-chain focus and
  upstream/downstream depth controls.
- Refreshable resource and network diagnosis report URLs plus Markdown and
  JSON report export.

### Changed

- Resource and network diagnosis now show a conclusion, impact, blocking
  point, troubleshooting chain, safe remediation, and verification before
  technical Evidence or raw JSON.
- Network snapshots are built by the API from live inventory instead of being
  trusted from the browser.
- Network steps distinguish PASSED, FAILED, UNKNOWN, and SKIPPED; downstream
  checks after a blocking failure are explicitly marked as not executed.
- Cluster overview uses real healthy, warning, critical, and unknown counts.

### Security

- Browser-supplied observations and topology snapshots are no longer trusted
  as diagnosis facts.
- Active probes remain disabled by default and KDiag remains read-only.

## [0.2.1] - 2026-07-24

### Added

- Live Kubernetes-backed selectors for diagnosis resources, network sources,
  target Services and ports, topology centers, namespaces, and replay
  Incidents. Resource names are no longer typed manually.
- Functional policy and alert, report center, resource topology, and system
  settings workspaces, all driven by live API data and explicit coverage
  states.
- Client-side construction of the network diagnosis snapshot from current
  informer inventory while retaining the active-probe-off safety default.

### Changed

- Incident namespace filtering now uses values observed from the system.
- Live selector queries refresh every 15 seconds and expose loading, error, and
  empty states.

## [0.2.0] - 2026-07-24

### Added

- Automatic Kubernetes connection through in-cluster credentials with local
  kubeconfig fallback.
- Informer-backed live inventory for 20 common cluster, workload, network,
  storage, configuration, policy, and Event resource kinds.
- Filterable cluster panorama Web workspace with resource health, relations,
  details, related Events, and a sanitized raw-object view.
- Live inventory and cluster-overview REST endpoints.

### Security

- The inventory ClusterRole never grants access to Secrets.
- Secret payloads and sensitive metadata annotations have defense-in-depth
  redaction tests.

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
