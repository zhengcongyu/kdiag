package inventory

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/zhengcongyu/kdiag/internal/collector"
	"github.com/zhengcongyu/kdiag/pkg/model"
)

func TestStoreSummarizesServiceEndpointsAndFilters(t *testing.T) {
	store := NewStore(Connection{Name: "test", Status: "connected"})
	service := resource("svc-1", "Service", "production", "payment", map[string]any{
		"selector":  map[string]any{"app": "payment"},
		"clusterIP": "10.96.0.10",
	}, nil)
	service.Labels = map[string]string{"tier": "backend"}
	endpoints := resource("slice-1", "EndpointSlice", "production", "payment-abc", map[string]any{
		"endpoints": []any{
			map[string]any{"conditions": map[string]any{"ready": false}},
		},
	}, nil)
	endpoints.Labels = map[string]string{"kubernetes.io/service-name": "payment"}
	pod := resource("pod-1", "Pod", "production", "payment-1", map[string]any{
		"nodeName": "worker-1",
	}, map[string]any{
		"phase":             "Running",
		"podIP":             "10.244.1.2",
		"containerStatuses": []any{map[string]any{"ready": true}},
	})
	pod.Labels = map[string]string{"app": "payment"}
	for _, item := range []model.Resource{service, endpoints, pod} {
		store.Apply(collector.Change{Type: collector.Added, Resource: item})
	}

	result := store.List(Query{Kind: "Service", Namespace: "production", Label: "tier=backend", Limit: 10})
	if result.Total != 1 {
		t.Fatalf("expected one service, got %d", result.Total)
	}
	if result.Items[0].State != StateCritical || result.Items[0].Ready != "0/1" {
		t.Fatalf("unexpected service summary: %#v", result.Items[0])
	}
	if len(result.Items[0].Relations) != 2 {
		t.Fatalf("expected EndpointSlice and Pod relations, got %#v", result.Items[0].Relations)
	}
}

func TestStoreDoesNotCallUnknownHealthy(t *testing.T) {
	store := NewStore(Connection{Name: "test", Status: "connected"})
	configMap := resource("cm-1", "ConfigMap", "default", "settings", map[string]any{}, nil)
	store.Apply(collector.Change{Type: collector.Added, Resource: configMap})
	result := store.List(Query{State: StateUnknown, Limit: 10})
	if result.Total != 1 || result.Items[0].StateText != "未评估" {
		t.Fatalf("unknown resource was not represented honestly: %#v", result)
	}
}

func resource(uid, kind, namespace, name string, spec, status map[string]any) model.Resource {
	specJSON, _ := json.Marshal(spec)
	statusJSON, _ := json.Marshal(status)
	return model.Resource{
		Ref:  model.ResourceRef{Cluster: "test", UID: uid, Kind: kind, Namespace: namespace, Name: name},
		Spec: specJSON, Status: statusJSON, Observed: time.Now().UTC(),
	}
}
