package api

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/zhengcongyu/kdiag/internal/repository"
	"github.com/zhengcongyu/kdiag/internal/rules"
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
	response.Body.Close()
	response, err = http.Post(server.URL+"/api/v1/diagnoses", "application/json", strings.NewReader(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("got %d", response.StatusCode)
	}
	response.Body.Close()
}

func TestDiagnosisSSE(t *testing.T) {
	server, _ := testServer()
	defer server.Close()
	reason := "CrashLoopBackOff"
	request := diagnosisRequest{
		Target:      model.ResourceRef{Cluster: "demo", UID: "p1", Kind: "Pod", Namespace: "default", Name: "payment"},
		Observation: rules.Observation{ContainerWaitingReason: &reason},
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
	response.Body.Close()
	if response.StatusCode != http.StatusAccepted {
		t.Fatalf("got %d", response.StatusCode)
	}
	client := &http.Client{Timeout: 5 * time.Second}
	stream, err := client.Get(server.URL + "/api/v1/diagnoses/" + task.ID + "/events")
	if err != nil {
		t.Fatal(err)
	}
	defer stream.Body.Close()
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
}
