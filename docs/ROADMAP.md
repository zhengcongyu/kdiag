# KDiag roadmap

Status legend: ✅ verified, 🟡 implemented but environment-limited verification, ⬜ planned.

## v0.5.0 — Explicit resource health and complete English UI

- [x] Remove the ambiguous collected/observed state from the API and console.
- [x] Give every inventory resource a healthy, warning, critical, or unknown result.
- [x] Evaluate declarative configuration resources without overstating runtime health.
- [x] Localize the complete primary workflow and resource health explanations.
- [x] Add regression coverage for English-only main content.

## v0.4.2 — Web rollout cache safety

- [x] Disable caching for the SPA HTML shell and client-side routes.
- [x] Cache content-hashed assets immutably and return 404 for missing assets.
- [x] Verify the response headers and a clean browser load after rollout.

## v0.4.1 — Release integrity hotfix

- [x] Preserve UTF-8 source text when publishing through the Git Data API.
- [x] Re-run Go, Web, Helm, and security checks from the corrected source tree.

## v0.4.0 — Permission visibility and bilingual console

- ✅ Verify effective read-only permissions for every configured resource kind.
- ✅ Generate a manual, reviewable RBAC manifest without automatic privilege escalation.
- ✅ Separate observed-without-universal-health from missing evidence.
- ✅ Continue partial inventory collection when individual resource kinds are denied.
- ✅ Add persistent Chinese and English console languages.

## v0.3.4 — Diagnosis report rendering reliability

- ✅ Return non-null arrays from newly generated reports.
- ✅ Render historical nullable report collections without a blank page.
- ✅ Cover the confirmed-issue/empty-suspected-issue case in frontend tests.

## v0.3.3 — Security compatibility patch

- ✅ Keep the actionable troubleshooting UI compatible with React Router v6.
- ✅ Restore a clean high-severity frontend dependency audit.

## v0.3.2 — Actionable troubleshooting guidance

- ✅ Explain the exact failing layer and common causes.
- ✅ Provide ordered, resource-scoped, read-only `kubectl` commands.
- ✅ Explain expected output and what to investigate when output is abnormal.
- ✅ Add guided API/RBAC/connectivity error states with Request ID support.
- ✅ Test that generated commands do not mutate resources or execute in Pods.

## v0.1.0 Explainable Diagnostics MVP

- ✅ Phase 1 — repository, architecture, project skeleton, CI
- ✅ Phase 2 — domain model, informer collector abstractions, topology graph
- ✅ Phase 3 — Event normalization, evidence deduplication, incident aggregation
- ✅ Phase 4 — deterministic rules and DAG diagnosis engine
- 🟡 Phase 5 — PostgreSQL migrations, repository, REST API, asynchronous SSE
- ✅ Phase 6 — React console
- ✅ Phase 7 — network path diagnosis
- 🟡 Phase 8 — kind fault lab and targetPort E2E
- 🟡 Phase 9 — Docker Compose, Helm, demo
- 🟡 Phase 10 — security review, final documentation, release

The yellow phases are blocked on runtime verification in an environment with Docker,
PostgreSQL, kind, kubectl, and GitHub authentication. The release tag must not be
created until these gates pass.

## Beyond v0.1

- ✅ Live-cluster controller — automatic in-cluster/kubeconfig connection,
  informer-backed inventory API, resource relationships, cluster-wide filters,
  detailed object inspector, and an iOS-inspired resource workspace.
- Multi-cluster credentials via external secret managers.
- Live API-backed workflow selectors and policy, report, topology, and settings
  workspaces are delivered in v0.2.1.
- ✅ v0.3.0 explainable experience — trusted automatic observation building,
  plain-language reports, per-check outcomes, diagnosis history, server-built
  network paths, and health-aware interactive topology.
- ⬜ Runtime Event-to-Incident controller with durable Signal/Finding storage
  and richer CNI policy semantics.
- CNI-specific flow evidence adapters.
- Signed rule bundles and rule authoring SDK.
- Retention policies and object storage references.
- Optional, separately privileged probe runner.
