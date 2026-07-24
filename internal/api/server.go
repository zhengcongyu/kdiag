package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/zhengcongyu/kdiag/internal/diagnosis"
	networkdiag "github.com/zhengcongyu/kdiag/internal/network"
	"github.com/zhengcongyu/kdiag/internal/repository"
	"github.com/zhengcongyu/kdiag/internal/rules"
	"github.com/zhengcongyu/kdiag/pkg/model"
)

type Server struct {
	repository repository.Repository
	engine     *diagnosis.Engine
	network    *networkdiag.Analyzer
	hub        *eventHub
	logger     *slog.Logger
	mu         sync.Mutex
	cancels    map[string]context.CancelFunc
}

func New(repository repository.Repository, logger *slog.Logger) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	return &Server{
		repository: repository, engine: diagnosis.New(rules.Catalog()),
		network: networkdiag.NewAnalyzer(nil),
		hub:     newEventHub(), logger: logger, cancels: map[string]context.CancelFunc{},
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", s.health)
	mux.HandleFunc("GET /api/v1/readiness", s.health)
	mux.HandleFunc("GET /api/v1/clusters", s.clusters)
	mux.HandleFunc("GET /api/v1/incidents", s.incidents)
	mux.HandleFunc("GET /api/v1/incidents/{id}", s.incident)
	mux.HandleFunc("GET /api/v1/incidents/{id}/topology", s.incidentTopology)
	mux.HandleFunc("GET /api/v1/incidents/{id}/timeline", s.incidentTimeline)
	mux.HandleFunc("POST /api/v1/diagnoses", s.createDiagnosis)
	mux.HandleFunc("GET /api/v1/diagnoses/{id}", s.getDiagnosis)
	mux.HandleFunc("GET /api/v1/diagnoses/{id}/events", s.diagnosisEvents)
	mux.HandleFunc("DELETE /api/v1/diagnoses/{id}", s.cancelDiagnosis)
	mux.HandleFunc("POST /api/v1/network-diagnoses", s.createNetworkDiagnosis)
	mux.HandleFunc("GET /api/v1/resources/search", s.searchResources)
	mux.HandleFunc("GET /api/v1/resources/{kind}/{namespace}/{name}", s.resource)
	mux.HandleFunc("POST /api/v1/replays/{incidentId}", s.replay)
	return s.middleware(mux)
}

func (s *Server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-Request-ID")
		if requestID == "" {
			requestID = newID()
		}
		w.Header().Set("X-Request-ID", requestID)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		started := time.Now()
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey{}, requestID)))
		s.logger.Info("http_request", "request_id", requestID, "method", r.Method, "path", r.URL.Path, "duration_ms", time.Since(started).Milliseconds())
	})
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "time": time.Now().UTC()})
}

func (s *Server) clusters(w http.ResponseWriter, r *http.Request) {
	items, err := s.repository.ListClusters(r.Context())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "unable to list clusters")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) incidents(w http.ResponseWriter, r *http.Request) {
	items, err := s.repository.ListIncidents(r.Context())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "unable to list incidents")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}

func (s *Server) incident(w http.ResponseWriter, r *http.Request) {
	item, ok := s.getIncident(w, r)
	if ok {
		writeJSON(w, http.StatusOK, item)
	}
}

func (s *Server) incidentTopology(w http.ResponseWriter, r *http.Request) {
	item, ok := s.getIncident(w, r)
	if ok {
		writeJSON(w, http.StatusOK, item.Topology)
	}
}

func (s *Server) incidentTimeline(w http.ResponseWriter, r *http.Request) {
	item, ok := s.getIncident(w, r)
	if ok {
		writeJSON(w, http.StatusOK, map[string]any{"items": item.Timeline})
	}
}

func (s *Server) getIncident(w http.ResponseWriter, r *http.Request) (model.Incident, bool) {
	item, err := s.repository.GetIncident(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, r, http.StatusNotFound, "NOT_FOUND", "incident not found")
		return model.Incident{}, false
	}
	return item, true
}

type diagnosisRequest struct {
	Target      model.ResourceRef `json:"target"`
	Observation rules.Observation `json:"observation"`
}

func (s *Server) createDiagnosis(w http.ResponseWriter, r *http.Request) {
	var request diagnosisRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "INVALID_ARGUMENT", err.Error())
		return
	}
	if request.Target.Kind == "" || request.Target.Name == "" {
		writeError(w, r, http.StatusBadRequest, "INVALID_ARGUMENT", "target.kind and target.name are required")
		return
	}
	if request.Target.UID == "" {
		request.Target.UID = strings.ToLower(request.Target.Kind + ":" + request.Target.Namespace + ":" + request.Target.Name)
	}
	request.Observation.Resource = request.Target
	task := model.DiagnosisTask{
		ID: newID(), Kind: "resource", Target: request.Target,
		Status: model.StatusPending, CreatedAt: time.Now().UTC(),
	}
	if err := s.repository.SaveTask(r.Context(), task); err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "unable to create diagnosis")
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	s.mu.Lock()
	s.cancels[task.ID] = cancel
	s.mu.Unlock()
	go func() {
		defer func() {
			s.mu.Lock()
			delete(s.cancels, task.ID)
			s.mu.Unlock()
			cancel()
		}()
		err := s.engine.Run(ctx, &task, request.Observation, taskSink{hub: s.hub, taskID: task.ID})
		if err != nil && !errors.Is(err, context.Canceled) {
			task.Status, task.Error = model.StatusFailed, "diagnosis execution failed"
			s.hub.publish(task.ID, diagnosis.Event{Type: "diagnosis_failed", Data: task.Error})
		}
		_ = s.repository.SaveTask(context.Background(), task)
	}()
	writeJSON(w, http.StatusAccepted, task)
}

type networkDiagnosisRequest struct {
	networkdiag.Request
	Snapshot networkdiag.Snapshot `json:"snapshot"`
}

func (s *Server) createNetworkDiagnosis(w http.ResponseWriter, r *http.Request) {
	var request networkDiagnosisRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "INVALID_ARGUMENT", err.Error())
		return
	}
	if err := networkdiag.ValidateRequest(request.Request); err != nil {
		writeError(w, r, http.StatusBadRequest, "INVALID_ARGUMENT", err.Error())
		return
	}
	task := model.DiagnosisTask{
		ID: newID(), Kind: "network",
		Target: model.ResourceRef{Cluster: request.Cluster, Kind: "Service", Namespace: request.Namespace, Name: request.Service, UID: "service:" + request.Namespace + ":" + request.Service},
		Status: model.StatusPending, CreatedAt: time.Now().UTC(),
	}
	if err := s.repository.SaveTask(r.Context(), task); err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "unable to create network diagnosis")
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	s.mu.Lock()
	s.cancels[task.ID] = cancel
	s.mu.Unlock()
	go func() {
		defer func() {
			s.mu.Lock()
			delete(s.cancels, task.ID)
			s.mu.Unlock()
			cancel()
		}()
		started := time.Now().UTC()
		task.Status, task.StartedAt = model.StatusRunning, &started
		s.hub.publish(task.ID, diagnosis.Event{Type: "task_started", Data: task})
		result := s.network.Analyze(ctx, request.Request, request.Snapshot)
		for _, networkStep := range result.Steps {
			stepStarted := time.Now().UTC()
			step := model.DiagnosisStep{
				ID: task.ID + "/" + networkStep.ID, RuleID: "network/" + networkStep.ID,
				Name: networkStep.Name, Status: model.StatusRunning, StartedAt: &stepStarted,
			}
			s.hub.publish(task.ID, diagnosis.Event{Type: "step_started", Data: step})
			task.Evidence = append(task.Evidence, networkStep.Evidence)
			s.hub.publish(task.ID, diagnosis.Event{Type: "evidence_added", Data: networkStep.Evidence})
			finished := time.Now().UTC()
			step.CompletedAt, step.Summary = &finished, networkStep.Summary
			if networkStep.Status == networkdiag.Missing {
				step.Status = model.StatusNeedsMoreEvidence
			} else {
				step.Status = model.StatusCompleted
			}
			task.Steps = append(task.Steps, step)
			s.hub.publish(task.ID, diagnosis.Event{Type: "step_completed", Data: step})
		}
		hypothesis := model.Hypothesis{
			ID: task.ID + "/network", RuleID: "KDIAG-NETWORK-PATH", RuleVersion: "1.0.0",
			Title: result.Summary, Explanation: strings.Join(result.Limitations, " "),
			Status: result.Status, Confidence: 0.85, Remediation: result.Remediation, Verification: result.Verification,
		}
		for _, item := range task.Evidence {
			switch item.Role {
			case model.EvidenceSupporting:
				hypothesis.SupportingEvidence = append(hypothesis.SupportingEvidence, item.ID)
			case model.EvidenceContradicting:
				hypothesis.ContradictingEvidence = append(hypothesis.ContradictingEvidence, item.ID)
			case model.EvidenceMissing:
				hypothesis.MissingEvidence = append(hypothesis.MissingEvidence, item.ID)
			}
		}
		task.Hypotheses = []model.Hypothesis{hypothesis}
		s.hub.publish(task.ID, diagnosis.Event{Type: "hypothesis_updated", Data: hypothesis})
		finished := time.Now().UTC()
		task.Status, task.FinishedAt = model.StatusCompleted, &finished
		_ = s.repository.SaveTask(context.Background(), task)
		s.hub.publish(task.ID, diagnosis.Event{Type: "diagnosis_completed", Data: task})
	}()
	writeJSON(w, http.StatusAccepted, task)
}

func (s *Server) getDiagnosis(w http.ResponseWriter, r *http.Request) {
	item, err := s.repository.GetTask(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, r, http.StatusNotFound, "NOT_FOUND", "diagnosis not found")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) diagnosisEvents(w http.ResponseWriter, r *http.Request) {
	if _, err := s.repository.GetTask(r.Context(), r.PathValue("id")); err != nil {
		writeError(w, r, http.StatusNotFound, "NOT_FOUND", "diagnosis not found")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, r, http.StatusInternalServerError, "SSE_UNSUPPORTED", "streaming unavailable")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	ch, unsubscribe := s.hub.subscribe(r.PathValue("id"))
	defer unsubscribe()
	for {
		select {
		case <-r.Context().Done():
			return
		case event, open := <-ch:
			if !open {
				return
			}
			raw, _ := json.Marshal(event.Data)
			_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, raw)
			flusher.Flush()
			if event.Type == "diagnosis_completed" || event.Type == "diagnosis_failed" || event.Type == "task_cancelled" {
				return
			}
		}
	}
}

func (s *Server) cancelDiagnosis(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	cancel := s.cancels[r.PathValue("id")]
	s.mu.Unlock()
	if cancel == nil {
		writeError(w, r, http.StatusConflict, "NOT_RUNNING", "diagnosis is not running")
		return
	}
	cancel()
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) searchResources(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) > 200 {
		writeError(w, r, http.StatusBadRequest, "INVALID_ARGUMENT", "q is too long")
		return
	}
	items, err := s.repository.SearchResources(r.Context(), query)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "unable to search resources")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) resource(w http.ResponseWriter, r *http.Request) {
	item, err := s.repository.GetResource(r.Context(), r.PathValue("kind"), r.PathValue("namespace"), r.PathValue("name"))
	if err != nil {
		writeError(w, r, http.StatusNotFound, "NOT_FOUND", "resource not found")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) replay(w http.ResponseWriter, r *http.Request) {
	incident, err := s.repository.GetIncident(r.Context(), r.PathValue("incidentId"))
	if err != nil {
		writeError(w, r, http.StatusNotFound, "NOT_FOUND", "incident not found")
		return
	}
	if len(incident.ResourceState) == 0 {
		writeError(w, r, http.StatusUnprocessableEntity, "MISSING_SNAPSHOT", "incident has no saved resource snapshot")
		return
	}
	request := diagnosisRequest{Target: incident.ResourceState[0].Ref, Observation: rules.Observation{Resource: incident.ResourceState[0].Ref}}
	raw, _ := json.Marshal(request)
	r.Body = http.NoBody
	_ = raw
	task := model.DiagnosisTask{ID: newID(), Kind: "replay", Target: request.Target, Status: model.StatusPending, CreatedAt: time.Now().UTC()}
	_ = s.repository.SaveTask(r.Context(), task)
	writeJSON(w, http.StatusAccepted, task)
}

func decodeJSON(r *http.Request, target any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]any{"code": code, "message": message, "requestId": requestID(r.Context())},
	})
}

func newID() string {
	var value [16]byte
	_, _ = rand.Read(value[:])
	return hex.EncodeToString(value[:])
}

type requestIDKey struct{}

func requestID(ctx context.Context) string {
	value, _ := ctx.Value(requestIDKey{}).(string)
	return value
}

func QueryInt(r *http.Request, name string, fallback int) int {
	value, err := strconv.Atoi(r.URL.Query().Get(name))
	if err != nil || value < 1 {
		return fallback
	}
	return value
}
