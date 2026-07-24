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
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/zhengcongyu/kdiag/internal/diagnosis"
	"github.com/zhengcongyu/kdiag/internal/inventory"
	networkdiag "github.com/zhengcongyu/kdiag/internal/network"
	"github.com/zhengcongyu/kdiag/internal/repository"
	"github.com/zhengcongyu/kdiag/internal/rules"
	"github.com/zhengcongyu/kdiag/pkg/model"
)

type Server struct {
	repository   repository.Repository
	engine       *diagnosis.Engine
	network      *networkdiag.Analyzer
	hub          *eventHub
	logger       *slog.Logger
	mu           sync.Mutex
	cancels      map[string]context.CancelFunc
	requests     atomic.Uint64
	diagnoses    atomic.Uint64
	inventory    inventory.Reader
	observations diagnosis.ObservationProvider
}

func New(repository repository.Repository, logger *slog.Logger) *Server {
	return NewWithInventory(repository, logger, inventory.Disconnected("Kubernetes 数据源未配置"))
}

func NewWithInventory(repository repository.Repository, logger *slog.Logger, resourceInventory inventory.Reader) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	if resourceInventory == nil {
		resourceInventory = inventory.Disconnected("Kubernetes 数据源未配置")
	}
	return &Server{
		repository: repository, engine: diagnosis.New(rules.Catalog()),
		network: networkdiag.NewAnalyzer(nil),
		hub:     newEventHub(), logger: logger, cancels: map[string]context.CancelFunc{},
		inventory: resourceInventory, observations: diagnosis.NewObservationProvider(resourceInventory),
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", s.health)
	mux.HandleFunc("GET /api/v1/readiness", s.health)
	mux.HandleFunc("GET /metrics", s.metrics)
	mux.HandleFunc("GET /api/v1/clusters", s.clusters)
	mux.HandleFunc("GET /api/v1/cluster/overview", s.clusterOverview)
	mux.HandleFunc("GET /api/v1/access", s.accessReport)
	mux.HandleFunc("GET /api/v1/access/rbac", s.accessRBAC)
	mux.HandleFunc("GET /api/v1/inventory", s.inventoryList)
	mux.HandleFunc("GET /api/v1/inventory/{uid}", s.inventoryItem)
	mux.HandleFunc("GET /api/v1/incidents", s.incidents)
	mux.HandleFunc("GET /api/v1/incidents/{id}", s.incident)
	mux.HandleFunc("GET /api/v1/incidents/{id}/topology", s.incidentTopology)
	mux.HandleFunc("GET /api/v1/incidents/{id}/timeline", s.incidentTimeline)
	mux.HandleFunc("POST /api/v1/diagnoses", s.createDiagnosis)
	mux.HandleFunc("GET /api/v1/diagnoses", s.listDiagnoses)
	mux.HandleFunc("GET /api/v1/diagnoses/{id}", s.getDiagnosis)
	mux.HandleFunc("GET /api/v1/diagnoses/{id}/events", s.diagnosisEvents)
	mux.HandleFunc("DELETE /api/v1/diagnoses/{id}", s.cancelDiagnosis)
	mux.HandleFunc("POST /api/v1/network-diagnoses", s.createNetworkDiagnosis)
	mux.HandleFunc("GET /api/v1/topology", s.topology)
	mux.HandleFunc("GET /api/v1/resources/search", s.searchResources)
	mux.HandleFunc("GET /api/v1/resources/{kind}/{namespace}/{name}", s.resource)
	mux.HandleFunc("POST /api/v1/replays/{incidentId}", s.replay)
	return s.middleware(mux)
}

func (s *Server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recover() != nil {
				s.logger.Error("http_panic", "path", r.URL.Path)
				writeJSON(w, http.StatusInternalServerError, map[string]any{
					"error": map[string]any{"code": "INTERNAL", "message": "internal server error"},
				})
			}
		}()
		requestID := r.Header.Get("X-Request-ID")
		if !validRequestID.MatchString(requestID) {
			requestID = newID()
		}
		w.Header().Set("X-Request-ID", requestID)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		started := time.Now()
		s.requests.Add(1)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey{}, requestID)))
		s.logger.Info("http_request", "request_id", requestID, "method", r.Method, "path", r.URL.Path, "duration_ms", time.Since(started).Milliseconds())
	})
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "time": time.Now().UTC()})
}

func (s *Server) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	_, _ = fmt.Fprintf(w, "# HELP kdiag_http_requests_total Total HTTP requests.\n# TYPE kdiag_http_requests_total counter\nkdiag_http_requests_total %d\n", s.requests.Load())
	_, _ = fmt.Fprintf(w, "# HELP kdiag_diagnoses_started_total Total diagnosis tasks accepted.\n# TYPE kdiag_diagnoses_started_total counter\nkdiag_diagnoses_started_total %d\n", s.diagnoses.Load())
}

func (s *Server) clusters(w http.ResponseWriter, r *http.Request) {
	items, err := s.repository.ListClusters(r.Context())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "unable to list clusters")
		return
	}
	connection := s.inventory.Connection()
	if connection.Status != "disconnected" {
		items = append([]string{connection.Name}, items...)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": uniqueStrings(items), "connection": connection})
}

func (s *Server) clusterOverview(w http.ResponseWriter, _ *http.Request) {
	result := s.inventory.List(inventory.Query{Limit: 1})
	writeJSON(w, http.StatusOK, map[string]any{
		"connection": s.inventory.Connection(),
		"total":      result.Total,
		"facets":     result.Facets,
		"observedAt": result.Observed,
		"coverage": map[string]any{
			"source":  "Kubernetes API Informer/List-Watch",
			"secrets": false,
			"message": "展示受支持的非敏感 Kubernetes 资源。已采集但没有通用健康条件的资源会标记为 observed，不会显示为健康。",
		},
		"access": s.inventory.Access(),
	})
}

func (s *Server) accessReport(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.inventory.Access())
}

func (s *Server) accessRBAC(w http.ResponseWriter, _ *http.Request) {
	namespace := safeDNSLabel(os.Getenv("POD_NAMESPACE"), "kdiag")
	serviceAccount := safeDNSLabel(os.Getenv("KDIAG_SERVICE_ACCOUNT"), "kdiag-kdiag")
	name := safeDNSLabel(os.Getenv("KDIAG_RBAC_NAME"), serviceAccount+"-reader")
	manifest := fmt.Sprintf(`apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: %s
rules:
  - apiGroups: [""]
    resources: [namespaces, pods, nodes, services, events, configmaps, persistentvolumeclaims, persistentvolumes]
    verbs: [get, list, watch]
  - apiGroups: ["apps"]
    resources: [deployments, replicasets, statefulsets, daemonsets]
    verbs: [get, list, watch]
  - apiGroups: ["batch"]
    resources: [jobs, cronjobs]
    verbs: [get, list, watch]
  - apiGroups: ["discovery.k8s.io"]
    resources: [endpointslices]
    verbs: [get, list, watch]
  - apiGroups: ["networking.k8s.io"]
    resources: [networkpolicies, ingresses]
    verbs: [get, list, watch]
  - apiGroups: ["storage.k8s.io"]
    resources: [storageclasses]
    verbs: [get, list, watch]
  - apiGroups: ["autoscaling"]
    resources: [horizontalpodautoscalers]
    verbs: [get, list, watch]
  - apiGroups: ["policy"]
    resources: [poddisruptionbudgets]
    verbs: [get, list, watch]
  - apiGroups: ["authorization.k8s.io"]
    resources: [selfsubjectaccessreviews]
    verbs: [create]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: %s
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: %s
subjects:
  - kind: ServiceAccount
    name: %s
    namespace: %s
`, name, name, name, serviceAccount, namespace)
	writeJSON(w, http.StatusOK, map[string]any{
		"manifest": manifest,
		"command":  "kubectl apply -f kdiag-readonly-rbac.yaml",
		"warning":  "Review the manifest before applying it. KDiag never applies or escalates permissions automatically.",
	})
}

func safeDNSLabel(value, fallback string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" || len(value) > 63 || !regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`).MatchString(value) {
		return fallback
	}
	return value
}

func (s *Server) inventoryList(w http.ResponseWriter, r *http.Request) {
	for _, name := range []string{"kind", "group", "namespace", "node", "state", "label", "q"} {
		if len(r.URL.Query().Get(name)) > 200 {
			writeError(w, r, http.StatusBadRequest, "INVALID_ARGUMENT", name+" is too long")
			return
		}
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	result := s.inventory.List(inventory.Query{
		Kind:      strings.TrimSpace(r.URL.Query().Get("kind")),
		Group:     strings.TrimSpace(r.URL.Query().Get("group")),
		Namespace: strings.TrimSpace(r.URL.Query().Get("namespace")),
		Node:      strings.TrimSpace(r.URL.Query().Get("node")),
		State:     strings.TrimSpace(r.URL.Query().Get("state")),
		Label:     strings.TrimSpace(r.URL.Query().Get("label")),
		Search:    strings.TrimSpace(r.URL.Query().Get("q")),
		Offset:    offset, Limit: QueryInt(r, "limit", 50),
	})
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) inventoryItem(w http.ResponseWriter, r *http.Request) {
	uid := strings.TrimSpace(r.PathValue("uid"))
	if uid == "" || len(uid) > 256 {
		writeError(w, r, http.StatusBadRequest, "INVALID_ARGUMENT", "invalid resource UID")
		return
	}
	item, err := s.inventory.Get(uid)
	if err != nil {
		writeError(w, r, http.StatusNotFound, "NOT_FOUND", "resource not found")
		return
	}
	writeJSON(w, http.StatusOK, item)
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
	if err := decodeJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "INVALID_ARGUMENT", err.Error())
		return
	}
	if request.Target.Kind == "" || request.Target.Name == "" {
		writeError(w, r, http.StatusBadRequest, "INVALID_ARGUMENT", "target.kind and target.name are required")
		return
	}
	if request.Target.UID == "" {
		result := s.inventory.List(inventory.Query{
			Kind: request.Target.Kind, Namespace: request.Target.Namespace,
			Search: request.Target.Name, Limit: 200,
		})
		for _, item := range result.Items {
			if item.Ref.Name == request.Target.Name {
				request.Target = item.Ref
				break
			}
		}
		if request.Target.UID == "" {
			writeError(w, r, http.StatusNotFound, "NOT_FOUND", "target resource was not found in the live Kubernetes inventory")
			return
		}
	}
	task := model.DiagnosisTask{
		ID: newID(), Kind: "resource", Target: request.Target,
		Status: model.StatusPending, CreatedAt: time.Now().UTC(),
	}
	if err := s.repository.SaveTask(r.Context(), task); err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "unable to create diagnosis")
		return
	}
	s.diagnoses.Add(1)
	baseCtx := context.WithoutCancel(r.Context())
	ctx, cancel := context.WithTimeout(baseCtx, 2*time.Minute)
	s.mu.Lock()
	s.cancels[task.ID] = cancel
	s.mu.Unlock()
	acceptedTask := task
	go func() {
		defer func() {
			s.mu.Lock()
			delete(s.cancels, task.ID)
			s.mu.Unlock()
			cancel()
		}()
		observation, observationErr := s.observations.Build(request.Target)
		if observationErr != nil {
			task.Status, task.Error = model.StatusFailed, "无法从实时 Kubernetes 缓存读取目标资源"
			s.hub.publish(task.ID, diagnosis.Event{Type: "diagnosis_failed", Data: task.Error})
			persistCtx, persistCancel := context.WithTimeout(baseCtx, 5*time.Second)
			defer persistCancel()
			_ = s.repository.SaveTask(persistCtx, task)
			return
		}
		err := s.engine.Run(ctx, &task, observation, taskSink{hub: s.hub, taskID: task.ID})
		if err != nil && !errors.Is(err, context.Canceled) {
			task.Status, task.Error = model.StatusFailed, "diagnosis execution failed"
			s.hub.publish(task.ID, diagnosis.Event{Type: "diagnosis_failed", Data: task.Error})
		}
		if err == nil {
			topology, _ := s.observations.Topology(task.Target.UID, 2, "both")
			task.Report = diagnosis.BuildReport(&task, topology)
			if task.Report.Verdict == model.VerdictConfirmed {
				_ = s.saveTaskIncident(baseCtx, task)
			}
		}
		persistCtx, persistCancel := context.WithTimeout(baseCtx, 5*time.Second)
		defer persistCancel()
		_ = s.repository.SaveTask(persistCtx, task)
	}()
	writeJSON(w, http.StatusAccepted, acceptedTask)
}

type networkDiagnosisRequest struct {
	networkdiag.Request
	Snapshot networkdiag.Snapshot `json:"snapshot"`
}

func (s *Server) createNetworkDiagnosis(w http.ResponseWriter, r *http.Request) {
	var request networkDiagnosisRequest
	if err := decodeJSON(w, r, &request); err != nil {
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
	s.diagnoses.Add(1)
	baseCtx := context.WithoutCancel(r.Context())
	ctx, cancel := context.WithTimeout(baseCtx, 2*time.Minute)
	s.mu.Lock()
	s.cancels[task.ID] = cancel
	s.mu.Unlock()
	acceptedTask := task
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
		snapshot, snapshotErr := s.observations.BuildNetwork(request.Request)
		if snapshotErr != nil {
			task.Status, task.Error = model.StatusFailed, "无法从实时 Kubernetes 缓存构建网络快照"
			s.hub.publish(task.ID, diagnosis.Event{Type: "diagnosis_failed", Data: task.Error})
			return
		}
		if snapshot.Service.Ref.UID != "" {
			task.Target = snapshot.Service.Ref
		}
		result := s.network.Analyze(ctx, request.Request, snapshot)
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
			switch networkStep.Status {
			case networkdiag.Passed:
				step.Outcome = model.CheckPassed
			case networkdiag.Failed:
				step.Outcome = model.CheckFailed
			case networkdiag.Missing:
				step.Outcome = model.CheckUnknown
			case networkdiag.Skipped:
				step.Outcome = model.CheckSkipped
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
		topology, _ := s.observations.Topology(task.Target.UID, 2, "both")
		task.Report = diagnosis.BuildNetworkReport(&task, result, topology)
		finished := time.Now().UTC()
		task.Status, task.FinishedAt = model.StatusCompleted, &finished
		persistCtx, persistCancel := context.WithTimeout(baseCtx, 5*time.Second)
		defer persistCancel()
		_ = s.repository.SaveTask(persistCtx, task)
		if task.Report.Verdict == model.VerdictConfirmed {
			_ = s.saveTaskIncident(baseCtx, task)
		}
		s.hub.publish(task.ID, diagnosis.Event{Type: "diagnosis_completed", Data: task})
	}()
	writeJSON(w, http.StatusAccepted, acceptedTask)
}

func (s *Server) getDiagnosis(w http.ResponseWriter, r *http.Request) {
	item, err := s.repository.GetTask(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, r, http.StatusNotFound, "NOT_FOUND", "diagnosis not found")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) saveTaskIncident(ctx context.Context, task model.DiagnosisTask) error {
	if task.Report == nil {
		return nil
	}
	now := time.Now().UTC()
	started := task.CreatedAt
	if task.StartedAt != nil {
		started = *task.StartedAt
	}
	incident := model.Incident{
		ID: task.ID, Cluster: task.Target.Cluster, Title: task.Report.Headline,
		Summary: task.Report.Summary, Severity: "P1", Status: "open",
		Namespace: task.Target.Namespace, StartedAt: started, UpdatedAt: now,
		ResourceUIDs: []string{task.Target.UID}, Evidence: task.Evidence,
		Hypotheses: task.Hypotheses, EngineVersion: diagnosis.EngineVersion,
		Topology: task.Report.Topology, DiagnosisSteps: task.Steps,
		Timeline: []model.TimelineEvent{{
			ID: task.ID + "/created", IncidentID: task.ID, At: now,
			Type: "diagnosis_confirmed", Summary: task.Report.Headline, Resource: &task.Target,
		}},
	}
	if item, err := s.inventory.Get(task.Target.UID); err == nil {
		incident.ResourceState = []model.Resource{item.Resource}
	}
	saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	return s.repository.SaveIncident(saveCtx, incident)
}

func (s *Server) listDiagnoses(w http.ResponseWriter, r *http.Request) {
	items, err := s.repository.ListTasks(r.Context())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "unable to list diagnoses")
		return
	}
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	verdict := strings.TrimSpace(r.URL.Query().Get("verdict"))
	namespace := strings.TrimSpace(r.URL.Query().Get("namespace"))
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	filtered := make([]model.DiagnosisTask, 0, len(items))
	for _, item := range items {
		if kind != "" && item.Kind != kind {
			continue
		}
		if namespace != "" && item.Target.Namespace != namespace {
			continue
		}
		if verdict != "" && (item.Report == nil || string(item.Report.Verdict) != verdict) {
			continue
		}
		if query != "" && !strings.Contains(strings.ToLower(item.Target.Kind+"/"+item.Target.Name), query) {
			continue
		}
		filtered = append(filtered, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": filtered, "total": len(filtered)})
}

func (s *Server) topology(w http.ResponseWriter, r *http.Request) {
	uid := strings.TrimSpace(r.URL.Query().Get("uid"))
	if uid == "" || len(uid) > 256 {
		writeError(w, r, http.StatusBadRequest, "INVALID_ARGUMENT", "uid is required")
		return
	}
	depth := QueryInt(r, "depth", 2)
	direction := strings.TrimSpace(r.URL.Query().Get("direction"))
	if direction == "" {
		direction = "both"
	}
	if direction != "both" && direction != "upstream" && direction != "downstream" {
		writeError(w, r, http.StatusBadRequest, "INVALID_ARGUMENT", "direction must be both, upstream, or downstream")
		return
	}
	result, err := s.observations.Topology(uid, depth, direction)
	if err != nil {
		writeError(w, r, http.StatusNotFound, "NOT_FOUND", "resource not found")
		return
	}
	writeJSON(w, http.StatusOK, result)
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
	after, _ := strconv.ParseInt(r.Header.Get("Last-Event-ID"), 10, 64)
	ch, unsubscribe := s.hub.subscribe(r.PathValue("id"), after)
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
			_, _ = fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", event.Sequence, event.Type, raw)
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

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
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

var validRequestID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)

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

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}
