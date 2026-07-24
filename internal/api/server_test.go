package api

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/zhengcongyu/kdiag/internal/collector"
	"github.com/zhengcongyu/kdiag/internal/inventory"
	"github.com/zhengcongyu/kdiag/internal/repository"
	"github.com/zhengcongyu/kdiag/pkg/model"
)

func testServer() (*httptest.Server, *repository.Memory) {
	repo := repository.NewMemory()
	server := New(repo, slog.New(slog.NewTextHandler(io.Discard, nil)))
	return httptest.NewServer(server.Handler()), repo
}

func TestHealthAndValidation(t *testing.T) {
	server, _ := testServer()
	defer server.Close()
	response, err := http.Get(server.URL + "/api/v1/health")
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK || response.Header.Get("X-Request-ID") == "" {
		t.Fatalf("unexpected response: %s", response.Status)
	}
	if err := response.Body.Close(); err != nil {
		t.Fatal(err)
	}
	response, err = http.Post(server.URL+"/api/v1/diagnoses", "application/json", strings.NewReader(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("got %d", response.StatusCode)
	}
	if err := response.Body.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestDiagnosisSSE(t *testing.T) {
	repo := repository.NewMemory()
	store := inventory.NewStore(inventory.Connection{Name: "demo", Status: "connected"})
	store.Apply(collector.Change{Type: collector.Added, Resource: model.Resource{
		Ref: model.ResourceRef{Cluster: "demo", UID: "p1", Kind: "Pod", Namespace: "default", Name: "payment"},
		Status: json.RawMessage(`{
			"phase":"Running",
			"conditions":[{"type":"Ready","status":"False"}],
			"containerStatuses":[{"ready":false,"state":{"waiting":{"reason":"CrashLoopBackOff"}}}]
		}`),
		Observed: time.Now().UTC(),
	}})
	server := httptest.NewServer(NewWithInventory(
		repo, slog.New(slog.NewTextHandler(io.Discard, nil)), store,
	).Handler())
	defer server.Close()
	request := diagnosisRequest{
		Target: model.ResourceRef{Cluster: "demo", UID: "p1", Kind: "Pod", Namespace: "default", Name: "payment"},
	}
	raw, _ := json.Marshal(request)
	response, err := http.Post(server.URL+"/api/v1/diagnoses", "application/json", bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	var task model.DiagnosisTask
	if err := json.NewDecoder(response.Body).Decode(&task); err != nil {
		t.Fatal(err)
	}
	if err := response.Body.Close(); err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusAccepted {
		t.Fatalf("got %d", response.StatusCode)
	}
	client := &http.Client{Timeout: 5 * time.Second}
	stream, err := client.Get(server.URL + "/api/v1/diagnoses/" + task.ID + "/events")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = stream.Body.Close() }()
	scanner := bufio.NewScanner(stream.Body)
	events := []string{}
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "event: ") {
			events = append(events, strings.TrimPrefix(line, "event: "))
		}
	}
	if len(events) == 0 || events[0] != "task_started" || events[len(events)-1] != "diagnosis_completed" {
		t.Fatalf("unexpected SSE events: %#v", events)
	}
	var completed model.DiagnosisTask
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		completed, _ = repo.GetTask(context.Background(), task.ID)
		if completed.Report != nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if completed.Report == nil || completed.Report.Verdict != model.VerdictConfirmed {
		t.Fatalf("diagnosis report was not persisted: %#v", completed)
	}
	list, err := http.Get(server.URL + "/api/v1/diagnoses?verdict=CONFIRMED_ISSUE")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = list.Body.Close() }()
	if list.StatusCode != http.StatusOK {
		t.Fatalf("unexpected task list status: %s", list.Status)
	}
	topology, err := http.Get(server.URL + "/api/v1/topology?uid=p1&depth=2&direction=both")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = topology.Body.Close() }()
	if topology.StatusCode != http.StatusOK {
		t.Fatalf("unexpected topology status: %s", topology.Status)
	}
}

func TestLiveInventoryAPI(t *testing.T) {
	repo := repository.NewMemory()
	store := inventory.NewStore(inventory.Connection{
		Name: "local-k8s", Status: "connected", Mode: "in-cluster",
	})
	store.Apply(collector.Change{Type: collector.Added, Resource: model.Resource{
		Ref: model.ResourceRef{
			Cluster: "local-k8s", UID: "pod-uid", Kind: "Pod",
			Namespace: "production", Name: "payment-api",
		},
		Labels:   map[string]string{"app": "payment"},
		Spec:     json.RawMessage(`{"nodeName":"worker-1"}`),
		Status:   json.RawMessage(`{"phase":"Running","podIP":"10.244.1.2","containerStatuses":[{"ready":true}]}`),
		Observed: time.Now().UTC(),
	}})
	server := httptest.NewServer(NewWithInventory(repo, slog.New(slog.NewTextHandler(io.Discard, nil)), store).Handler())
	defer server.Close()

	response, err := http.Get(server.URL + "/api/v1/inventory?namespace=production&state=healthy&label=app%3Dpayment")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	var result inventory.Result
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK || result.Total != 1 || result.Items[0].Node != "worker-1" {
		t.Fatalf("unexpected inventory response: status=%d result=%#v", response.StatusCode, result)
	}

	detail, err := http.Get(server.URL + "/api/v1/inventory/pod-uid")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = detail.Body.Close() }()
	if detail.StatusCode != http.StatusOK {
		t.Fatalf("unexpected detail status: %s", detail.Status)
	}
}

func TestAccessReportAndManualReadOnlyRBAC(t *testing.T) {
	t.Setenv("POD_NAMESPACE", "kdiag")
	t.Setenv("KDIAG_SERVICE_ACCOUNT", "kdiag-api")
	repo := repository.NewMemory()
	store := inventory.NewStore(inventory.Connection{Name: "local-k8s", Status: "connected"})
	store.SetAccess(inventory.AccessReport{
		Status: "partial", Checks: []inventory.AccessCheck{{
			Kind: "Pod", Resource: "pods", Namespaced: true,
			Verbs: map[string]bool{"get": true, "list": false, "watch": false},
		}},
	})
	server := httptest.NewServer(NewWithInventory(repo, slog.New(slog.NewTextHandler(io.Discard, nil)), store).Handler())
	defer server.Close()

	response, err := http.Get(server.URL + "/api/v1/access")
	if err != nil {
		t.Fatal(err)
	}
	var access inventory.AccessReport
	if err := json.NewDecoder(response.Body).Decode(&access); err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if access.Status != "partial" || len(access.Checks) != 1 {
		t.Fatalf("unexpected access report: %#v", access)
	}

	response, err = http.Get(server.URL + "/api/v1/access/rbac")
	if err != nil {
		t.Fatal(err)
	}
	var generated struct {
		Manifest string `json:"manifest"`
		Command  string `json:"command"`
	}
	if err := json.NewDecoder(response.Body).Decode(&generated); err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if !strings.Contains(generated.Manifest, "verbs: [get, list, watch]") ||
		!strings.Contains(generated.Manifest, "name: kdiag-api") ||
		strings.Contains(generated.Manifest, "resources: [secrets") ||
		strings.Contains(generated.Manifest, "delete") ||
		strings.Contains(generated.Manifest, "patch") {
		t.Fatalf("generated RBAC was not safely read-only:\n%s", generated.Manifest)
	}
}
