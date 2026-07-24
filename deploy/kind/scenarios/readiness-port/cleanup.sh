#!/usr/bin/env bash
set -euo pipefail
kubectl delete namespace kdiag-readiness --ignore-not-found

