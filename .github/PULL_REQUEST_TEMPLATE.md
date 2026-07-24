## Summary

Describe the user-visible outcome and why it is needed.

## Evidence and explainability

- [ ] Rule changes include positive, negative, and missing-evidence tests.
- [ ] Structured Kubernetes state is preferred over Event text.
- [ ] Missing data is not presented as healthy.

## Verification

- [ ] `make fmt lint test build`
- [ ] Helm/YAML changes were linted.
- [ ] No Secret, token, kubeconfig, certificate, or `.env` was added.

## Security

Describe RBAC, probe, input-validation, data-retention, or supply-chain impact.

