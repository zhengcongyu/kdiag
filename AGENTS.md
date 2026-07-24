# KDiag contributor instructions

## Scope

These instructions apply to the whole repository.

## Engineering rules

- Keep diagnosis logic in the Go API; the CLI and Web are API clients.
- Prefer Kubernetes structured status and conditions over Event message text.
- Never treat missing evidence as proof that a component is healthy.
- Never read or render Secret data, accept arbitrary probe commands, or log credentials.
- Keep collectors informer-driven; periodic full scans are not the primary collection mechanism.
- Every rule change needs positive, negative, and insufficient-evidence tests.
- Use UTC for persisted timestamps and stable resource UIDs for graph identity.
- Update `docs/ROADMAP.md` when a milestone changes.
- Run `make fmt test build` before committing when the required tools are available.

## Repository boundaries

- `pkg/model`: stable domain and API models.
- `internal`: implementation details.
- `cmd`: API and CLI entry points only.
- `web`: React console.
- `deploy`: Docker, Helm, kind, and demo assets.

