# Missing ConfigMap key

- Inject: `kubectl apply -f deploy/kind/scenarios/missing-configmap-key/fault.yaml`.
- Wait: Pod waiting reason becomes `CreateContainerConfigError`.
- Expected symptom/root cause: container never starts because `app-config` lacks key `missing`.
- Required evidence: structured waiting reason plus ConfigMap key reference; Event text may confirm the missing key.
- Forbidden conclusions: image pull failure or application crash.
- Repair: add the reviewed key or change the reference to `present`.
- Recovery verification: Pod Running and Ready.
- Cleanup: `kubectl delete namespace kdiag-missing-config`.

