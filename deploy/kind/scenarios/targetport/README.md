# targetPort mismatch

- Inject: `kubectl apply -f deploy/kind/scenarios/targetport/fault.yaml`
- Wait: Deployment `payment` is Available and its EndpointSlice has a Ready endpoint.
- Expected symptom: Pod-IP port 8080 works, but Service port 80 times out or refuses because it forwards to 9090.
- Expected root cause: `target_port_mismatch`.
- Required evidence: selector matches the Pod; Ready Endpoint count is non-zero; Service `targetPort=9090`; backend declares/listens on 8080.
- Forbidden conclusions: selector mismatch, no Endpoint, NetworkPolicy denial, or “network healthy”.
- Repair: `kubectl apply -f deploy/kind/scenarios/targetport/fix.yaml`.
- Recovery verification: a temporary curl Pod can fetch `http://payment:80/`; re-diagnosis no longer reports targetPort mismatch.
- Cleanup: `kubectl delete namespace kdiag-targetport`.
- Automated flow: `./deploy/kind/run-e2e.sh targetport`.

