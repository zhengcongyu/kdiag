package network

import (
	"context"
	"strings"
	"testing"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

func boolean(value bool) *bool { return &value }

func healthySnapshot() Snapshot {
	service := model.ResourceRef{Cluster: "demo", UID: "svc1", Kind: "Service", Namespace: "default", Name: "payment"}
	pod := Pod{
		Ref:     model.ResourceRef{Cluster: "demo", UID: "p1", Kind: "Pod", Namespace: "default", Name: "payment-a"},
		Running: true, Ready: true, Labels: map[string]string{"app": "payment"}, IP: "10.0.0.2",
		ContainerPorts: map[string]int32{"http": 8080},
	}
	return Snapshot{
		SourcePods: []Pod{{Ref: model.ResourceRef{Name: "frontend"}, Running: true, Ready: true}},
		Service: Service{Ref: service, Exists: true, ClusterIP: "10.96.0.10", Selector: map[string]string{"app": "payment"},
			Ports: []ServicePort{{Name: "http", Port: 80, TargetPort: "http"}}},
		BackendPods:    []Pod{pod},
		EndpointSlices: []EndpointSlice{{Service: "payment", Endpoints: []Endpoint{{Addresses: []string{"10.0.0.2"}, Ready: boolean(true), TargetRef: &pod.Ref}}}},
		Policy:         PolicyAssessment{Applicable: true, Summary: "static policy permits the selected path", Limitations: "CNI implementation details are unavailable"},
	}
}

func TestTargetPortMismatchIsPreciselyLocated(t *testing.T) {
	snapshot := healthySnapshot()
	snapshot.Service.Ports[0].TargetPort = "9090"
	result := NewAnalyzer(nil).Analyze(context.Background(), Request{Port: 80, Protocol: ProtocolTCP}, snapshot)
	if result.RootCause != "target_port_mismatch" {
		t.Fatalf("unexpected result: %#v", result)
	}
	failedAtTargetPort := false
	skippedAfterFailure := false
	for _, step := range result.Steps {
		failedAtTargetPort = failedAtTargetPort || (step.ID == "target-port" && step.Status == Failed)
		skippedAfterFailure = skippedAfterFailure || (step.ID == "network-policy" && step.Status == Skipped)
	}
	if !failedAtTargetPort || !skippedAfterFailure {
		t.Fatalf("diagnosis did not mark targetPort as the blocking point: %#v", result.Steps)
	}
	if len(result.Remediation) < 2 || !strings.Contains(result.Remediation[1], "9090 → 8080") {
		t.Fatalf("remediation does not contain an exact read-only targetPort diff: %#v", result.Remediation)
	}
	if !strings.Contains(result.Steps[7].Summary, "Service 端口 80") ||
		!strings.Contains(result.Steps[7].Summary, "targetPort 9090") ||
		!strings.Contains(result.Steps[7].Summary, "8080") {
		t.Fatalf("targetPort comparison is incomplete: %s", result.Steps[7].Summary)
	}
}

func TestFourNetworkFaults(t *testing.T) {
	tests := []struct {
		name, expected string
		mutate         func(*Snapshot)
	}{
		{"selector", "service_selector_mismatch", func(s *Snapshot) { s.Service.Selector = map[string]string{"app": "wrong"} }},
		{"endpoint", "no_ready_endpoint", func(s *Snapshot) { s.EndpointSlices[0].Endpoints[0].Ready = boolean(false) }},
		{"targetPort", "target_port_mismatch", func(s *Snapshot) { s.Service.Ports[0].TargetPort = "9090" }},
		{"policy", "network_policy_denied", func(s *Snapshot) { s.Policy.StaticallyDenied = true; s.Policy.Summary = "default deny blocks ingress" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			snapshot := healthySnapshot()
			tt.mutate(&snapshot)
			result := NewAnalyzer(nil).Analyze(context.Background(), Request{Port: 80, Protocol: ProtocolTCP}, snapshot)
			if result.RootCause != tt.expected {
				t.Fatalf("got %s, expected %s: %#v", result.RootCause, tt.expected, result)
			}
		})
	}
}

func TestHealthyStaticResultRetainsCapabilityLimit(t *testing.T) {
	result := NewAnalyzer(nil).Analyze(context.Background(), Request{Port: 80, Protocol: ProtocolTCP}, healthySnapshot())
	if len(result.Limitations) == 0 || result.Summary == "network is healthy" {
		t.Fatalf("capability limitation disappeared: %#v", result)
	}
}
