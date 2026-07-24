# Service selector mismatch

- Inject: `kubectl apply -f deploy/kind/scenarios/service-selector/fault.yaml`.
- Wait: Deployment Available; Service EndpointSlice has no endpoints.
- Expected symptom/root cause: Service unavailable because selector `app=payments` does not match Pod label `app=payment`.
- Required evidence: evaluated selector and Pod labels; zero selected Pods.
- Forbidden conclusions: targetPort mismatch or NetworkPolicy denial.
- Repair: change selector to `app=payment`.
- Recovery verification: EndpointSlice contains a Ready endpoint and Service request succeeds.
- Cleanup: `kubectl delete namespace kdiag-selector`.

