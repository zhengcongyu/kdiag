package incident

import (
	"testing"
	"time"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

func TestReadinessFailuresAggregateToServiceIncident(t *testing.T) {
	now := time.Now().UTC()
	service := model.ResourceRef{Cluster: "c1", UID: "svc1", Kind: "Service", Namespace: "prod", Name: "payment"}
	pod1 := model.ResourceRef{Cluster: "c1", UID: "p1", Kind: "Pod", Namespace: "prod", Name: "payment-a"}
	pod2 := model.ResourceRef{Cluster: "c1", UID: "p2", Kind: "Pod", Namespace: "prod", Name: "payment-b"}
	graph := model.GraphSnapshot{
		Nodes: []model.ResourceRef{service, pod1, pod2},
		Edges: []model.GraphEdge{
			{From: service, To: pod1, Relation: "selects"},
			{From: service, To: pod2, Relation: "selects"},
		},
	}
	findings := []model.Finding{
		{ID: "f1", Resource: pod1, Code: "PodNotReady", Summary: "readiness probe failed", Severity: "P1", ObservedAt: now},
		{ID: "f2", Resource: pod2, Code: "PodNotReady", Summary: "readiness probe failed", Severity: "P1", ObservedAt: now.Add(time.Second)},
	}
	signals := []model.Signal{
		{ID: "s1", Resource: pod1, Reason: "Unhealthy", LastSeen: now, Count: 400},
		{ID: "s2", Resource: pod2, Reason: "Unhealthy", LastSeen: now, Count: 380},
	}
	got := NewAggregator().Aggregate(signals, findings, graph)
	if len(got) != 1 {
		t.Fatalf("got %d incidents, want 1", len(got))
	}
	if got[0].Title != "Service currently has no healthy backend Pods" || len(got[0].SignalIDs) != 2 {
		t.Fatalf("unexpected incident: %#v", got[0])
	}
}
