# PVC Pending

- Inject: `kubectl apply -f deploy/kind/scenarios/pvc-pending/fault.yaml`.
- Wait: PVC remains in phase `Pending`.
- Expected symptom/root cause: no StorageClass named `unavailable-kdiag-class` can provision the claim.
- Required evidence: PVC phase, storageClassName, and absence of a matching StorageClass; Event text is supplemental.
- Forbidden conclusions: node disk pressure or application failure without evidence.
- Repair: select an existing StorageClass or create an approved provisioner configuration.
- Recovery verification: PVC phase becomes `Bound`.
- Cleanup: `kubectl delete namespace kdiag-pvc`.

