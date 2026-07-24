# Bad image

- Inject: `kubectl apply -f deploy/kind/scenarios/bad-image/fault.yaml`.
- Wait: `kubectl -n kdiag-bad-image wait pod -l app=bad-image --for=jsonpath='{.status.containerStatuses[0].state.waiting.reason}'=ImagePullBackOff --timeout=180s`.
- Expected symptom/root cause: Pod unavailable; structured waiting reason is `ErrImagePull` then `ImagePullBackOff`.
- Required evidence: container waiting reason and image reference; Event text is supplemental only.
- Forbidden conclusions: CrashLoopBackOff or OOMKilled.
- Repair: replace the image with an existing reviewed image.
- Recovery verification: Deployment Available and container Ready.
- Cleanup: `kubectl delete namespace kdiag-bad-image`.

