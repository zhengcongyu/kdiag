# Security policy

## Supported versions

Security fixes are provided for the latest tagged minor release. Before the
first stable release, only the latest `v0.x` release is supported.

## Reporting a vulnerability

Use GitHub private vulnerability reporting:
`https://github.com/zhengcongyu/kdiag/security/advisories/new`.

Do not open a public issue and do not include live kubeconfigs, tokens, Secret
contents, certificates, or production credentials. Include affected version,
impact, sanitized reproduction, and suggested mitigation. The maintainer will
acknowledge a valid report as soon as practical and coordinate disclosure.

## Security model

KDiag uses read-only Kubernetes RBAC and never reads Secret bodies. Active
probes are disabled by default, typed (DNS/TCP/HTTP only), time-bounded,
concurrency-limited, target-allowlisted, cancellable, and separately deployable.
KDiag v0.1 never mutates production resources.

The v0.1 API has no built-in user authentication or tenant authorization.
Production operators must restrict it with network policy and an authenticated
reverse proxy or identity-aware ingress.

