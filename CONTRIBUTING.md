# Contributing to KDiag

Thank you for improving explainable Kubernetes diagnostics.

1. Open an issue for substantial behavior or security changes.
2. Create a focused branch and keep commits reviewable.
3. Add tests. Every diagnosis rule needs positive, negative, and
   insufficient-evidence cases.
4. Run `make fmt lint test build`; run `make e2e` for fault-lab changes.
5. Never include Secret values, kubeconfigs, tokens, certificates, or private
   production logs.
6. Submit a pull request using the repository template.

By contributing, you agree that your contribution is licensed under
Apache-2.0 and that you will follow the Code of Conduct.

