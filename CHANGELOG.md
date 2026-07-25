# Changelog

All notable changes are documented here. The format follows Keep a Changelog.

## [Unreleased]

## [0.4.2] - 2026-07-25

### Fixed

- Prevent a cached SPA HTML shell from referencing JavaScript assets removed by
  a later rollout and rendering a blank page.
- Return `404` for missing hashed assets instead of serving `index.html` with
  the wrong content type.

## [0.4.1] - 2026-07-25

### Fixed

- Preserve UTF-8 source text in the published GitHub tree and release artifacts.
- Keep the permission visibility, explicit resource states, and bilingual console
  from v0.4.0 unchanged.

## [0.4.0] - 2026-07-25

### Added

- Add effective Kubernetes `get/list/watch` permission checks for every collected resource kind.
- Add a Settings permission matrix and manually reviewed read-only RBAC manifest generator.
- Add persistent Chinese/English language switching for navigation, cluster health, settings, diagnosis, network paths, and troubleshooting reports.

### Changed

- Distinguish resources that are successfully observed but have no universal health condition from resources with missing evidence.
- Continue collecting authorized resource kinds when another kind is denied instead of failing the entire informer inventory.

## [0.3.4] - 2026-07-25

### Fixed

- Encode empty diagnosis collections as JSON arrays instead of `null`.
- Keep the report UI compatible with historical or memory-backed reports that
  still contain nullable issue, check, evidence, or capability collections.
- Prevent the diagnosis report from becoming a blank page while rendering a
  confirmed issue with no suspected issues.

## [0.3.3] - 2026-07-25

### Security

- Pin React Router DOM to the maintained v6 release line after a newly
  published high-severity advisory affected the available v7 release line.
- Keep `pnpm audit --audit-level high` green without suppressing advisories or
  lowering the workflow threshold.

## [0.3.2] - 2026-07-25

### Added

- Add structured troubleshooting guides to every diagnosis report, including
  problem location, common causes, ordered read-only `kubectl` commands,
  expected healthy output, and the next action when output is abnormal.
- Add rule-specific guidance for Pod lifecycle, image, probe, Service selector,
  EndpointSlice, targetPort, scheduling, PVC, Node, and NetworkPolicy failures.
- Add actionable error states for API connectivity, RBAC, missing reports, and
  server failures, including Request ID visibility and platform checks.
- Add one-click copying for safe read-only diagnostic commands.

### Security

- Generate commands only from trusted resource references and an allow-listed
  Kubernetes resource-kind mapping.
- Do not suggest `apply`, `patch`, `edit`, `delete`, `exec`, arbitrary shell
  commands, or automatic production changes.

## [0.3.1] - 2026-07-25

### Fixed

- Kept the targetPort fault lab backend healthy under a non-root,
  capability-free security context.
- Added an exact Service port to targetPort to declared container port
  comparison and read-only remediation diff.
- Used the real Service UID in network reports so live topology and Incident
  linkage are retained.

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
