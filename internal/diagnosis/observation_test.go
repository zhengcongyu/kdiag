package diagnosis

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/zhengcongyu/kdiag/internal/collector"
	"github.com/zhengcongyu/kdiag/internal/inventory"
	"github.com/zhengcongyu/kdiag/pkg/model"
)

func TestObservationProviderBuildsStructuredPodEvidence(t *testing.T) {
	store := inventory.NewStore(inventory.Connection{Name: "test", Status: "connected"})
	pod := model.Resource{
		Ref: model.ResourceRef{Cluster: "test", UID: "pod-1", Kind: "Pod", Namespace: "default", Name: "payment"},
		Spec: json.RawMessage(`{"containers":[{"ports":[{"name":"http","containerPort":8080}]}]}`),
		Status: json.RawMessage(`{
			"phase":"Running",
			"conditions":[
				{"type":"Ready","status":"False"},
				{"type":"PodScheduled","status":"False","reason":"Unschedulable","message":"0/3 nodes are available: insufficient memory, untolerated taint"}
			],
			"containerStatuses":[{
				"ready":false,
				"state":{"waiting":{"reason":"CrashLoopBackOff"}},
				"lastState":{"terminated":{"reason":"OOMKilled","exitCode":137}}
			}]
		}`),
		Observed: time.Now().UTC(),
	}
	applyResource(store, pod)
	applyResource(store, model.Resource{
		Ref: model.ResourceRef{Cluster: "test", UID: "event-1", Kind: "Event", Namespace: "default", Name: "probe"},
		Raw: json.RawMessage(`{
			"reason":"Unhealthy",
			"message":"Readiness probe failed: connection refused",
			"involvedObject":{"uid":"pod-1"}
		}`),
		Observed: time.Now().UTC(),
	})
	got, err := NewObservationProvider(store).Build(pod.Ref)
	if err != nil {
		t.Fatal(err)
	}
	if got.ContainerWaitingReason == nil || *got.ContainerWaitingReason != "CrashLoopBackOff" {
		t.Fatalf("waiting reason was not extracted: %#v", got)
	}
	if got.ContainerTerminatedReason == nil || *got.ContainerTerminatedReason != "OOMKilled" {
		t.Fatalf("structured OOM reason was not extracted: %#v", got)
	}
	if got.ReadinessProbeFailed == nil || !*got.ReadinessProbeFailed ||
		got.InsufficientResources == nil || !*got.InsufficientResources ||
		got.TaintMismatch == nil || !*got.TaintMismatch {
		t.Fatalf("pod conditions were not translated: %#v", got)
	}
}

func TestObservationProviderBuildsServiceChainEvidence(t *testing.T) {
	store := inventory.NewStore(inventory.Connection{Name: "test", Status: "connected"})
	service := model.Resource{
		Ref: model.ResourceRef{Cluster: "test", UID: "svc-1", Kind: "Service", Namespace: "default", Name: "payment"},
		Spec: json.RawMessage(`{"selector":{"app":"payment"},"ports":[{"port":80,"targetPort":"http"}]}`),
		Observed: time.Now().UTC(),
	}
	applyResource(store, service)
	applyResource(store, model.Resource{
		Ref: model.ResourceRef{Cluster: "test", UID: "pod-1", Kind: "Pod", Namespace: "default", Name: "payment-a"},
		Labels: map[string]string{"app": "payment"},
		Spec: json.RawMessage(`{"containers":[{"ports":[{"name":"metrics","containerPort":9090}]}]}`),
		Status: json.RawMessage(`{"phase":"Running","conditions":[{"type":"Ready","status":"True"}]}`),
		Observed: time.Now().UTC(),
	})
	applyResource(store, model.Resource{
		Ref: model.ResourceRef{Cluster: "test", UID: "slice-1", Kind: "EndpointSlice", Namespace: "default", Name: "payment-x"},
		Labels: map[string]string{"kubernetes.io/service-name": "payment"},
		Spec: json.RawMessage(`{"endpoints":[{"addresses":["10.0.0.2"],"conditions":{"ready":true}}]}`),
		Observed: time.Now().UTC(),
	})
	got, err := NewObservationProvider(store).Build(service.Ref)
	if err != nil {
		t.Fatal(err)
	}
	if got.SelectorMatches == nil || !*got.SelectorMatches ||
		got.ReadyEndpoints == nil || *got.ReadyEndpoints != 1 ||
		got.TargetPortMatches == nil || *got.TargetPortMatches {
		t.Fatalf("service chain was not evaluated correctly: %#v", got)
	}
}

func TestObservationProviderBuildsPVCAndNodeEvidence(t *testing.T) {
	store := inventory.NewStore(inventory.Connection{Name: "test", Status: "connected"})
	pvc := model.Resource{
		Ref: model.ResourceRef{Cluster: "test", UID: "pvc-1", Kind: "PersistentVolumeClaim", Namespace: "default", Name: "data"},
		Status: json.RawMessage(`{"phase":"Pending"}`), Observed: time.Now().UTC(),
	}
	node := model.Resource{
		Ref: model.ResourceRef{Cluster: "test", UID: "node-1", Kind: "Node", Name: "worker-1"},
		Status: json.RawMessage(`{"conditions":[{"type":"Ready","status":"False"}]}`), Observed: time.Now().UTC(),
	}
	applyResource(store, pvc)
	applyResource(store, node)
	provider := NewObservationProvider(store)
	pvcObservation, err := provider.Build(pvc.Ref)
	if err != nil || pvcObservation.PVCPhase == nil || *pvcObservation.PVCPhase != "Pending" {
		t.Fatalf("PVC phase unavailable: observation=%#v err=%v", pvcObservation, err)
	}
	nodeObservation, err := provider.Build(node.Ref)
	if err != nil || nodeObservation.NodeReady == nil || *nodeObservation.NodeReady {
		t.Fatalf("Node Ready condition unavailable: observation=%#v err=%v", nodeObservation, err)
	}
}

func applyResource(store *inventory.Store, resource model.Resource) {
	store.Apply(collector.Change{Type: collector.Added, Resource: resource})
}
