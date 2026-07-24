# KDiag roadmap

Status legend: ✅ verified, 🟡 implemented but environment-limited verification, ⬜ planned.

## v0.1.0 Explainable Diagnostics MVP

- ✅ Phase 1 — repository, architecture, project skeleton, CI
- ✅ Phase 2 — domain model, informer collector abstractions, topology graph
- ✅ Phase 3 — Event normalization, evidence deduplication, incident aggregation
- ⬜ Phase 4 — deterministic rules and DAG diagnosis engine
- ⬜ Phase 5 — PostgreSQL migrations, repository, REST API, asynchronous SSE
- ⬜ Phase 6 — React console
- ⬜ Phase 7 — network path diagnosis
- ⬜ Phase 8 — kind fault lab and targetPort E2E
- ⬜ Phase 9 — Docker Compose, Helm, demo
- ⬜ Phase 10 — security review, final documentation, release

## Beyond v0.1

- Multi-cluster credentials via external secret managers.
- CNI-specific flow evidence adapters.
- Signed rule bundles and rule authoring SDK.
- Retention policies and object storage references.
- Optional, separately privileged probe runner.
