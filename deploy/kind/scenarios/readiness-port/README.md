# Wrong readiness port

- Inject: `kubectl apply -f deploy/kind/scenarios/readiness-port/fault.yaml`.
- Wait: both Pods have Ready condition False for at least two probe periods.
- Expected symptom/root cause: Deployment has zero Available replicas; probe uses 8080 while the container serves 80.
- Required evidence: Pod Ready condition, probe spec, and repeated `Unhealthy` Signal aggregate count.
- Forbidden conclusions: application crash or Service selector mismatch.
- Repair: set readiness probe port to named port `http`.
- Recovery verification: both Pods Ready and Deployment Available.
- Cleanup: `kubectl delete namespace kdiag-readiness`.

