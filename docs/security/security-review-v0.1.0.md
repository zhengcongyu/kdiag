# Security review for the v0.1.0 candidate

Review date: 2026-07-24

## Executive summary

The codebase has secure defaults for Kubernetes access, containers, probes,
HTTP input handling, database queries, and CI permissions. Automated source,
dependency, and secret scans pass after dependency remediation. One high-impact
product limitation remains: the API does not yet implement authentication or
per-user authorization. KDiag must therefore be deployed only on a trusted
private network behind an authenticated ingress or service mesh. This is a
release blocker for an Internet-facing or shared production installation.

Outstanding findings: 1 high, 1 medium, 1 low. Resolved findings: 3.

## Outstanding findings

### KDIAG-AUTH-001 — API has no built-in authentication

- Severity: High
- Location: `internal/api/server.go`, `(*Server).Handler`
- Evidence: all diagnosis, replay, resource, and incident routes are registered
  without an authentication or authorization middleware.
- Impact: any principal that can reach the API can read diagnostic metadata,
  start or cancel diagnosis tasks, and request a replay.
- Recommended fix: add pluggable OIDC authentication and authorization checks
  scoped by cluster and namespace before calling the repository or task engine.
- Current mitigation: expose the service only through an authenticated ingress
  or service mesh, restrict network access with NetworkPolicy, and never expose
  the API directly to the public Internet.

### KDIAG-CI-001 — third-party GitHub Actions use mutable version tags

- Severity: Medium
- Location: `.github/workflows/*.yml`
- Evidence: third-party actions are referenced by major or release tags instead
  of immutable commit SHAs.
- Impact: a compromised upstream tag could change code executed in CI.
- Recommended fix: pin each action to a reviewed full commit SHA and use
  Dependabot to propose controlled updates.
- Current mitigation: workflows use minimal job permissions, release writes are
  limited to tag-triggered jobs, and Dependabot monitors Actions updates.

### KDIAG-TEST-001 — race test was not executed locally

- Severity: Low
- Location: `.github/workflows/ci.yml`, Go test job
- Evidence: the Windows development environment has no C compiler, while the Go
  race detector requires cgo. The workflow runs the race test on Linux.
- Impact: a concurrency defect could remain undetected until CI runs.
- Recommended fix: require the Linux CI race job before merging or tagging.
- Current mitigation: task state, event subscriptions, and cancellation maps
  use mutexes or atomics, and ordinary unit tests pass locally.

## Resolved findings

### KDIAG-DEP-001 — reachable dependency vulnerabilities

- Original severity: High
- Evidence: `govulncheck` initially reported GO-2026-5970 through
  `golang.org/x/text` and GO-2026-5004 through `github.com/jackc/pgx/v5`.
- Resolution: upgraded `golang.org/x/text` to v0.39.0 and `pgx/v5` to v5.9.2.
  A subsequent `govulncheck ./...` reported zero reachable vulnerabilities.

### KDIAG-PROBE-001 — probe target validation needed an exact allowlist

- Original severity: High
- Location: `internal/network/probe.go`, `GuardedRunner`
- Resolution: probes remain disabled by default and now require a structured
  action, supported protocol, bounded timeout, concurrency token, DNS-safe
  cluster-local host, valid port, and an exact target present in the task's
  allowlist. No arbitrary shell command is accepted.

### KDIAG-SECRET-001 — database credentials in Helm values

- Original severity: Medium
- Location: `deploy/helm/kdiag/templates/deployments.yaml`
- Resolution: the chart now references an existing Kubernetes Secret by name
  and key; credentials are not embedded in values or command-line examples.

## Verification

- `go test ./...`: passed
- `go test -tags=integration ./internal/repository/...`: compiled and skipped
  the live PostgreSQL case because `KDIAG_TEST_DATABASE_URL` is not set
- `go vet ./...`: passed
- `gosec -exclude-generated ./cmd/... ./internal/... ./pkg/...`: passed
- `govulncheck ./...`: zero reachable vulnerabilities
- `pnpm audit --audit-level high`: no known vulnerabilities
- `gitleaks dir . --config .gitleaks.toml`: no leaks found

Docker image scanning remains pending because Docker is not installed in the
current environment. The release workflow includes Trivy and must pass before a
release is created.
