# NetworkPolicy block

- Inject: `kubectl apply -f deploy/kind/scenarios/network-policy/fault.yaml`.
- Wait: both Pods Ready and EndpointSlice Ready; use a kind CNI that enforces NetworkPolicy.
- Expected symptom/root cause: frontend-to-payment TCP is denied by ingress policy.
- Required evidence: selected source/destination labels, policy selector, ingress peers, and port.
- Forbidden conclusions: no Endpoint or targetPort mismatch. Do not claim enforcement without CNI traffic confirmation.
- Repair: add the minimal allowed `app=frontend` peer.
- Recovery verification: static analysis permits and an authorized TCP/HTTP probe succeeds.
- Cleanup: `kubectl delete namespace kdiag-policy`.

