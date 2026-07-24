#!/usr/bin/env bash
set -euo pipefail
kubectl delete namespace kdiag-missing-config --ignore-not-found

