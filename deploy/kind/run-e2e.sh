#!/usr/bin/env bash
set -euo pipefail

scenario="${1:-targetport}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "$scenario" != "targetport" ]]; then
  echo "Only the targetport scenario has an automated v0.1 E2E runner." >&2
  exit 2
fi

namespace="kdiag-targetport"
cleanup() {
  kubectl delete namespace "$namespace" --ignore-not-found --wait=false >/dev/null
}
trap cleanup EXIT

kubectl apply -f "$root/deploy/kind/scenarios/targetport/fault.yaml"
kubectl -n "$namespace" wait --for=condition=Available deployment/payment --timeout=120s
kubectl -n "$namespace" wait --for=jsonpath='{.endpoints[0].conditions.ready}'=true endpointslice \
  -l kubernetes.io/service-name=payment --timeout=120s

if kubectl -n "$namespace" run client-failing --rm -i --restart=Never --image=curlimages/curl:8.12.1 \
  --command -- curl --fail --max-time 4 http://payment:80/; then
  echo "Expected Service request to fail while targetPort is wrong." >&2
  exit 1
fi

go test ./internal/network -run TestTargetPortMismatchIsPreciselyLocated -count=1
kubectl apply -f "$root/deploy/kind/scenarios/targetport/fix.yaml"
kubectl -n "$namespace" rollout status deployment/payment --timeout=120s
kubectl -n "$namespace" run client-recovered --rm -i --restart=Never --image=curlimages/curl:8.12.1 \
  --command -- curl --fail --max-time 10 http://payment:80/
echo "targetPort fault, diagnosis fixture, repair, and recovery were verified."

