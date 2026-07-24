# ADR 0002: Deterministic, versioned diagnosis rules

Status: accepted.

The first engine executes versioned rules in a DAG. Rules declare applicability,
preconditions, checks, evidence, hypotheses, remediation, and verification.
Structured Kubernetes state outranks Event text. Rules return
`NEEDS_MORE_EVIDENCE` instead of guessing. This makes diagnoses testable,
replayable, and suitable for later comparison with learned ranking.

