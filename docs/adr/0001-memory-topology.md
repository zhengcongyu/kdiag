# ADR 0001: Use an in-memory topology graph

Status: accepted.

KDiag v0.1 keeps Kubernetes resource relationships in a concurrency-safe
in-memory adjacency graph keyed by resource UID. This matches informer update
semantics, keeps traversal cheap, and avoids introducing a graph database before
query and scale requirements are known. Incident snapshots persist the relevant
subgraph so historical explanations do not depend on live graph state.

