package inventory

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/zhengcongyu/kdiag/internal/collector"
	"github.com/zhengcongyu/kdiag/pkg/model"
	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	authorizationclient "k8s.io/client-go/kubernetes/typed/authorization/v1"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

const (
	StateHealthy  = "healthy"
	StateWarning  = "warning"
	StateCritical = "critical"
	StateUnknown  = "unknown"
)

type AccessCheck struct {
	Kind       string          `json:"kind"`
	Group      string          `json:"group"`
	Resource   string          `json:"resource"`
	Namespaced bool            `json:"namespaced"`
	Verbs      map[string]bool `json:"verbs"`
	Allowed    bool            `json:"allowed"`
	Reason     string          `json:"reason,omitempty"`
}

type AccessReport struct {
	Status    string        `json:"status"`
	CheckedAt time.Time     `json:"checkedAt,omitempty"`
	Checks    []AccessCheck `json:"checks"`
	Message   string        `json:"message"`
}

type Connection struct {
	Name          string    `json:"name"`
	Status        string    `json:"status"`
	Mode          string    `json:"mode"`
	Server        string    `json:"server,omitempty"`
	ServerVersion string    `json:"serverVersion,omitempty"`
	Message       string    `json:"message,omitempty"`
	SyncedAt      time.Time `json:"syncedAt,omitempty"`
}

type Query struct {
	Kind      string
	Group     string
	Namespace string
	Node      string
	State     string
	Label     string
	Search    string
	Offset    int
	Limit     int
}

type Relation struct {
	Type     string            `json:"type"`
	Resource model.ResourceRef `json:"resource"`
}

type Item struct {
	model.Resource
	Group         string     `json:"group"`
	State         string     `json:"state"`
	StateText     string     `json:"stateText"`
	Ready         string     `json:"ready,omitempty"`
	Node          string     `json:"node,omitempty"`
	IP            string     `json:"ip,omitempty"`
	Summary       string     `json:"summary,omitempty"`
	RecentEvent   string     `json:"recentEvent,omitempty"`
	RecentEventAt *time.Time `json:"recentEventAt,omitempty"`
	Relations     []Relation `json:"relations,omitempty"`
}

type Facets struct {
	Kinds      map[string]int `json:"kinds"`
	Groups     map[string]int `json:"groups"`
	Namespaces []string       `json:"namespaces"`
	Nodes      []string       `json:"nodes"`
	States     map[string]int `json:"states"`
}

type Result struct {
	Items    []Item    `json:"items"`
	Total    int       `json:"total"`
	Offset   int       `json:"offset"`
	Limit    int       `json:"limit"`
	Facets   Facets    `json:"facets"`
	Observed time.Time `json:"observedAt"`
}

type Reader interface {
	Connection() Connection
	Access() AccessReport
	List(Query) Result
	Get(string) (Item, error)
}

type Store struct {
	mu         sync.RWMutex
	connection Connection
	access     AccessReport
	resources  map[string]model.Resource
}

func NewStore(connection Connection) *Store {
	return &Store{connection: connection, resources: map[string]model.Resource{}}
}

func (s *Store) SetConnection(connection Connection) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.connection = connection
}

func (s *Store) Connection() Connection {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.connection
}

func (s *Store) SetAccess(access AccessReport) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.access = access
}

func (s *Store) Access() AccessReport {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.access
}

func (s *Store) Apply(change collector.Change) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if change.Type == collector.Deleted {
		delete(s.resources, change.Resource.Ref.UID)
		return
	}
	s.resources[change.Resource.Ref.UID] = change.Resource
}

func (s *Store) List(query Query) Result {
	s.mu.RLock()
	resources := make([]model.Resource, 0, len(s.resources))
	for _, resource := range s.resources {
		resources = append(resources, resource)
	}
	s.mu.RUnlock()

	items := decorate(resources)
	facets := buildFacets(items)
	filtered := make([]Item, 0, len(items))
	for _, item := range items {
		if matches(item, query) {
			filtered = append(filtered, item)
		}
	}
	sort.Slice(filtered, func(i, j int) bool {
		left, right := severityRank(filtered[i].State), severityRank(filtered[j].State)
		if left != right {
			return left < right
		}
		if filtered[i].Ref.Namespace != filtered[j].Ref.Namespace {
			return filtered[i].Ref.Namespace < filtered[j].Ref.Namespace
		}
		if filtered[i].Ref.Kind != filtered[j].Ref.Kind {
			return filtered[i].Ref.Kind < filtered[j].Ref.Kind
		}
		return filtered[i].Ref.Name < filtered[j].Ref.Name
	})
	total := len(filtered)
	offset := query.Offset
	if offset < 0 || offset > total {
		offset = 0
	}
	limit := query.Limit
	if limit < 1 || limit > 200 {
		limit = 50
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return Result{
		Items: filtered[offset:end], Total: total, Offset: offset, Limit: limit,
		Facets: facets, Observed: time.Now().UTC(),
	}
}

func (s *Store) Get(uid string) (Item, error) {
	s.mu.RLock()
	resources := make([]model.Resource, 0, len(s.resources))
	found := false
	for _, resource := range s.resources {
		resources = append(resources, resource)
		if resource.Ref.UID == uid {
			found = true
		}
	}
	s.mu.RUnlock()
	if !found {
		return Item{}, errors.New("resource not found")
	}
	for _, item := range decorate(resources) {
		if item.Ref.UID == uid {
			return item, nil
		}
	}
	return Item{}, errors.New("resource not found")
}

type Manager struct {
	store     *Store
	collector collector.Collector
	logger    *slog.Logger
}

func NewAuto(logger *slog.Logger) (*Manager, error) {
	if logger == nil {
		logger = slog.Default()
	}
	config, name, mode, err := loadConfig()
	if err != nil {
		return nil, err
	}
	config.UserAgent = "kdiag/0.2"
	config.Timeout = 30 * time.Second
	client, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("create Kubernetes dynamic client: %w", err)
	}
	access := AccessReport{
		Status: "unavailable", Checks: []AccessCheck{},
		Message: "Unable to verify Kubernetes permissions; collection will still attempt the configured read-only watches.",
	}
	allowedKinds := map[string]bool(nil)
	if authorization, authorizationErr := authorizationclient.NewForConfig(config); authorizationErr == nil {
		accessCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		access = checkAccess(accessCtx, authorization)
		cancel()
		if access.Status != "unavailable" {
			allowedKinds = map[string]bool{}
			for _, check := range access.Checks {
				allowedKinds[check.Kind] = check.Verbs["list"] && check.Verbs["watch"]
			}
		}
	}
	version := ""
	if discoveryClient, discoveryErr := discovery.NewDiscoveryClientForConfig(config); discoveryErr == nil {
		if info, versionErr := discoveryClient.ServerVersion(); versionErr == nil {
			version = info.GitVersion
		}
	}
	connection := Connection{
		Name: name, Status: "syncing", Mode: mode, Server: config.Host,
		ServerVersion: version, Message: "正在同步 Kubernetes API 缓存",
	}
	store := NewStore(connection)
	store.SetAccess(access)
	return &Manager{
		store: store, collector: collector.NewKubernetesForKinds(name, client, 0, allowedKinds),
		logger: logger,
	}, nil
}

func Disconnected(message string) *Store {
	store := NewStore(Connection{
		Name: "local-k8s", Status: "disconnected", Mode: "unavailable",
		Message: message,
	})
	store.SetAccess(AccessReport{Status: "unavailable", Checks: []AccessCheck{}, Message: "Kubernetes connection is unavailable."})
	return store
}

func (m *Manager) Reader() Reader { return m.store }

func (m *Manager) Run(ctx context.Context) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case change := <-m.collector.Changes():
				m.store.Apply(change)
			}
		}
	}()
	if err := m.collector.Start(ctx); err != nil {
		m.fail(err)
		return
	}
	syncCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	if err := m.collector.WaitForSync(syncCtx); err != nil {
		m.fail(err)
		return
	}
	connection := m.store.Connection()
	connection.Status = "connected"
	connection.Message = "Informer 缓存已同步"
	connection.SyncedAt = time.Now().UTC()
	m.store.SetConnection(connection)
	m.logger.Info("kubernetes_inventory_synced", "cluster", connection.Name, "version", connection.ServerVersion)
	<-ctx.Done()
}

func (m *Manager) fail(err error) {
	connection := m.store.Connection()
	connection.Status = "degraded"
	connection.Message = "Kubernetes 缓存同步失败：" + err.Error()
	m.store.SetConnection(connection)
	m.logger.Error("kubernetes_inventory_failed", "error", err)
}

func checkAccess(ctx context.Context, client authorizationclient.AuthorizationV1Interface) AccessReport {
	report := AccessReport{
		Status: "complete", CheckedAt: time.Now().UTC(), Checks: []AccessCheck{},
		Message: "All configured Kubernetes resources have read-only get/list/watch access.",
	}
	for _, resource := range collector.WatchedResources() {
		check := AccessCheck{
			Kind: resource.Kind, Group: resource.Group, Resource: resource.Resource,
			Namespaced: resource.Namespaced, Verbs: map[string]bool{},
		}
		for _, verb := range []string{"get", "list", "watch"} {
			review, err := client.SelfSubjectAccessReviews().Create(ctx, &authorizationv1.SelfSubjectAccessReview{
				Spec: authorizationv1.SelfSubjectAccessReviewSpec{
					ResourceAttributes: &authorizationv1.ResourceAttributes{
						Group: resource.Group, Version: resource.Version,
						Resource: resource.Resource, Verb: verb,
					},
				},
			}, metav1.CreateOptions{})
			if err != nil {
				return AccessReport{
					Status: "unavailable", CheckedAt: time.Now().UTC(), Checks: []AccessCheck{},
					Message: "Kubernetes permission review failed: " + err.Error(),
				}
			}
			check.Verbs[verb] = review.Status.Allowed
			if !review.Status.Allowed && check.Reason == "" {
				check.Reason = valueOr(review.Status.Reason, review.Status.EvaluationError)
			}
		}
		check.Allowed = check.Verbs["get"] && check.Verbs["list"] && check.Verbs["watch"]
		if !check.Allowed {
			report.Status = "partial"
			report.Message = "Some resource kinds are not collectible with the current identity. Use the generated read-only RBAC manifest to grant access manually."
		}
		report.Checks = append(report.Checks, check)
	}
	return report
}

func loadConfig() (*rest.Config, string, string, error) {
	if config, err := rest.InClusterConfig(); err == nil {
		name := strings.TrimSpace(os.Getenv("KDIAG_CLUSTER_NAME"))
		if name == "" {
			name = "local-k8s"
		}
		return config, name, "in-cluster", nil
	}
	rules := clientcmd.NewDefaultClientConfigLoadingRules()
	if path := strings.TrimSpace(os.Getenv("KDIAG_KUBECONFIG")); path != "" {
		rules.ExplicitPath = path
	}
	deferred := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(rules, &clientcmd.ConfigOverrides{})
	raw, err := deferred.RawConfig()
	if err != nil {
		return nil, "", "", fmt.Errorf("load kubeconfig: %w", err)
	}
	config, err := deferred.ClientConfig()
	if err != nil {
		return nil, "", "", fmt.Errorf("build kubeconfig client: %w", err)
	}
	name := raw.CurrentContext
	if override := strings.TrimSpace(os.Getenv("KDIAG_CLUSTER_NAME")); override != "" {
		name = override
	}
	if name == "" {
		name = "local-k8s"
	}
	return config, name, "kubeconfig", nil
}

func decorate(resources []model.Resource) []Item {
	byUID := make(map[string]model.Resource, len(resources))
	for _, resource := range resources {
		byUID[resource.Ref.UID] = resource
	}
	items := make([]Item, 0, len(resources))
	for _, resource := range resources {
		state, text, ready, node, ip, summary := summarize(resource, resources)
		item := Item{
			Resource: resource, Group: resourceGroup(resource.Ref.Kind),
			State: state, StateText: text, Ready: ready, Node: node, IP: ip, Summary: summary,
		}
		item.RecentEvent, item.RecentEventAt = recentEvent(resource.Ref.UID, resources)
		for _, owner := range resource.Owners {
			if related, ok := byUID[owner.UID]; ok {
				item.Relations = append(item.Relations, Relation{Type: "owned-by", Resource: related.Ref})
			}
		}
		item.Relations = append(item.Relations, directRelations(resource, resources)...)
		items = append(items, item)
	}
	return items
}

func recentEvent(uid string, resources []model.Resource) (string, *time.Time) {
	var latest time.Time
	summary := ""
	for _, resource := range resources {
		if resource.Ref.Kind != "Event" {
			continue
		}
		raw := rawMap(resource.Raw)
		involved, _ := raw["involvedObject"].(map[string]any)
		if stringValue(involved["uid"]) != uid {
			continue
		}
		at := eventTime(raw)
		if latest.IsZero() || at.After(latest) {
			latest = at
			summary = valueOr(stringValue(raw["reason"]), stringValue(raw["message"]))
		}
	}
	if latest.IsZero() {
		return summary, nil
	}
	return summary, &latest
}

func eventTime(raw map[string]any) time.Time {
	for _, key := range []string{"eventTime", "lastTimestamp", "firstTimestamp"} {
		if value := stringValue(raw[key]); value != "" {
			if parsed, err := time.Parse(time.RFC3339, value); err == nil {
				return parsed
			}
		}
	}
	return time.Time{}
}

func directRelations(resource model.Resource, resources []model.Resource) []Relation {
	relations := []Relation{}
	if resource.Ref.Kind == "Service" {
		selector := nestedStringMap(resource.Spec, "selector")
		for _, candidate := range resources {
			if candidate.Ref.Namespace != resource.Ref.Namespace {
				continue
			}
			if candidate.Ref.Kind == "EndpointSlice" && candidate.Labels["kubernetes.io/service-name"] == resource.Ref.Name {
				relations = append(relations, Relation{Type: "represented-by", Resource: candidate.Ref})
			}
			if candidate.Ref.Kind == "Pod" && labelsMatch(selector, candidate.Labels) {
				relations = append(relations, Relation{Type: "selects", Resource: candidate.Ref})
			}
		}
	}
	if resource.Ref.Kind == "EndpointSlice" {
		serviceName := resource.Labels["kubernetes.io/service-name"]
		for _, candidate := range resources {
			if candidate.Ref.Kind == "Service" && candidate.Ref.Namespace == resource.Ref.Namespace && candidate.Ref.Name == serviceName {
				relations = append(relations, Relation{Type: "represents", Resource: candidate.Ref})
			}
		}
	}
	sort.Slice(relations, func(i, j int) bool {
		return relations[i].Resource.Kind+"/"+relations[i].Resource.Name < relations[j].Resource.Kind+"/"+relations[j].Resource.Name
	})
	return relations
}

func summarize(resource model.Resource, all []model.Resource) (state, text, ready, node, ip, summary string) {
	spec, status := rawMap(resource.Spec), rawMap(resource.Status)
	switch resource.Ref.Kind {
	case "Namespace":
		phase := stringValue(status["phase"])
		if phase == "Active" {
			return StateHealthy, "Active", "1/1", "", "", "Namespace is active"
		}
		if phase == "Terminating" {
			return StateWarning, "Terminating", "0/1", "", "", "Namespace deletion is in progress"
		}
		return StateUnknown, valueOr(phase, "Unknown"), "", "", "", "Namespace phase is missing or not recognized"
	case "Node":
		for _, condition := range nestedSlice(status, "conditions") {
			if stringValue(condition["type"]) == "Ready" {
				if stringValue(condition["status"]) == "True" {
					return StateHealthy, "就绪", "1/1", "", nodeAddress(status), "节点 Ready 条件为 True"
				}
				return StateCritical, "未就绪", "0/1", "", nodeAddress(status), "节点 Ready 条件不为 True"
			}
		}
		return StateUnknown, "缺少 Ready 条件", "", "", nodeAddress(status), "无法确认节点就绪状态"
	case "Pod":
		node, ip = stringValue(spec["nodeName"]), stringValue(status["podIP"])
		phase := stringValue(status["phase"])
		containerStatuses := nestedSlice(status, "containerStatuses")
		readyCount := 0
		for _, container := range containerStatuses {
			if value, ok := container["ready"].(bool); ok && value {
				readyCount++
			}
			if waiting := nestedMap(container, "state", "waiting"); waiting != nil {
				reason := stringValue(waiting["reason"])
				if reason != "" && reason != "ContainerCreating" && reason != "PodInitializing" {
					return StateCritical, reason, fmt.Sprintf("%d/%d", readyCount, len(containerStatuses)), node, ip, "容器处于 " + reason
				}
			}
		}
		ready = fmt.Sprintf("%d/%d", readyCount, len(containerStatuses))
		if phase == "Succeeded" {
			return StateHealthy, "已完成", ready, node, ip, "Pod 已成功完成"
		}
		if phase == "Failed" {
			return StateCritical, "失败", ready, node, ip, "Pod phase 为 Failed"
		}
		if phase == "Running" && len(containerStatuses) > 0 && readyCount == len(containerStatuses) {
			return StateHealthy, "就绪", ready, node, ip, "所有容器已就绪"
		}
		if phase == "Pending" {
			return StateWarning, "等待中", ready, node, ip, "Pod 仍在等待调度或启动"
		}
		return StateWarning, "未就绪", ready, node, ip, "Pod 尚未全部就绪"
	case "Deployment", "StatefulSet", "ReplicaSet":
		desired := intValue(spec["replicas"])
		available := intValue(status["availableReplicas"])
		if resource.Ref.Kind == "ReplicaSet" {
			available = intValue(status["readyReplicas"])
		}
		ready = fmt.Sprintf("%d/%d", available, desired)
		if desired == 0 {
			return StateHealthy, "已缩容", ready, "", "", "期望副本为 0"
		}
		if desired > 0 && available >= desired {
			return StateHealthy, "可用", ready, "", "", "期望副本均已可用"
		}
		if available == 0 && desired > 0 {
			return StateCritical, "不可用", ready, "", "", "没有可用副本"
		}
		return StateWarning, "部分可用", ready, "", "", "可用副本少于期望值"
	case "DaemonSet":
		desired, available := intValue(status["desiredNumberScheduled"]), intValue(status["numberAvailable"])
		ready = fmt.Sprintf("%d/%d", available, desired)
		if desired > 0 && available >= desired {
			return StateHealthy, "可用", ready, "", "", "所有目标节点均有可用 Pod"
		}
		return StateWarning, "部分可用", ready, "", "", "部分目标节点没有可用 Pod"
	case "Service":
		clusterIP := stringValue(spec["clusterIP"])
		readyEndpoints, totalEndpoints := endpointCounts(resource, all)
		ready = fmt.Sprintf("%d/%d", readyEndpoints, totalEndpoints)
		if stringValue(spec["type"]) == "ExternalName" {
			return StateHealthy, "外部名称", "", "", stringValue(spec["externalName"]), "ExternalName Service 不使用 EndpointSlice"
		}
		if totalEndpoints == 0 {
			return StateCritical, "无端点", ready, "", clusterIP, "Service 当前没有可以接收请求的后端 Pod"
		}
		if readyEndpoints == 0 {
			return StateCritical, "端点未就绪", ready, "", clusterIP, "EndpointSlice 中 Ready Endpoint 数量为 0"
		}
		if readyEndpoints < totalEndpoints {
			return StateWarning, "部分就绪", ready, "", clusterIP, "部分 Endpoint 尚未就绪"
		}
		return StateHealthy, "端点就绪", ready, "", clusterIP, "所有 Endpoint 均已就绪"
	case "EndpointSlice":
		readyEndpoints, totalEndpoints := sliceEndpointCounts(spec)
		ready = fmt.Sprintf("%d/%d", readyEndpoints, totalEndpoints)
		if totalEndpoints == 0 || readyEndpoints == 0 {
			return StateCritical, "无就绪端点", ready, "", "", "没有 Ready Endpoint"
		}
		if readyEndpoints < totalEndpoints {
			return StateWarning, "部分就绪", ready, "", "", "部分 Endpoint 尚未就绪"
		}
		return StateHealthy, "端点就绪", ready, "", "", "EndpointSlice 有可用后端"
	case "PersistentVolumeClaim":
		phase := stringValue(status["phase"])
		if phase == "Bound" {
			return StateHealthy, "已绑定", "1/1", "", stringValue(spec["volumeName"]), "PVC 已绑定到 PersistentVolume"
		}
		if phase == "Lost" {
			return StateCritical, "已丢失", "0/1", "", "", "PVC 绑定已丢失"
		}
		return StateWarning, valueOr(phase, "等待中"), "0/1", "", "", "PVC 尚未绑定"
	case "PersistentVolume":
		phase := stringValue(status["phase"])
		if phase == "Bound" || phase == "Available" {
			return StateHealthy, phase, "", "", "", "PersistentVolume 可用"
		}
		if phase == "Failed" {
			return StateCritical, "失败", "", "", "", "PersistentVolume phase 为 Failed"
		}
		return StateWarning, valueOr(phase, "未知"), "", "", "", "PersistentVolume 状态需要检查"
	case "Job":
		completions := intValue(spec["completions"])
		if completions == 0 {
			completions = 1
		}
		succeeded, failed := intValue(status["succeeded"]), intValue(status["failed"])
		ready = fmt.Sprintf("%d/%d", succeeded, completions)
		if failed > 0 {
			return StateCritical, "失败", ready, "", "", "Job 有失败的 Pod"
		}
		if succeeded >= completions {
			return StateHealthy, "已完成", ready, "", "", "Job 已达到完成数"
		}
		return StateWarning, "运行中", ready, "", "", "Job 尚未完成"
	case "ConfigMap":
		return StateHealthy, "配置有效", "1/1", "", "", "ConfigMap 已通过 Kubernetes API 校验并且可以读取"
	case "CronJob":
		if suspended, _ := spec["suspend"].(bool); suspended {
			return StateHealthy, "按配置暂停", "1/1", "", "", "CronJob 已按用户配置暂停，不属于运行故障"
		}
		active := len(nestedSlice(status, "active"))
		if active > 0 {
			return StateHealthy, "任务运行中", fmt.Sprintf("%d active", active), "", "", "CronJob 当前有活动 Job"
		}
		if strings.TrimSpace(stringValue(spec["schedule"])) == "" {
			return StateCritical, "缺少调度计划", "0/1", "", "", "CronJob 未声明有效的 schedule"
		}
		return StateHealthy, "调度计划有效", "1/1", "", "", "CronJob 调度计划已通过 Kubernetes API 校验，当前无需活动 Job"
	case "Ingress":
		addresses := nestedSlice(status, "loadBalancer", "ingress")
		if len(addresses) > 0 {
			return StateHealthy, "地址已分配", fmt.Sprintf("%d", len(addresses)), "", "", "Ingress 已获得负载均衡地址"
		}
		if len(nestedSlice(spec, "rules")) == 0 && nestedMap(spec, "defaultBackend") == nil {
			return StateCritical, "没有路由规则", "0/1", "", "", "Ingress 没有 rules 或 defaultBackend"
		}
		return StateWarning, "入口状态未确认", "0/1", "", "", "Ingress 配置有效，但控制器尚未报告负载均衡地址；请确认 IngressClass 和控制器状态"
	case "NetworkPolicy":
		if nestedMap(spec, "podSelector") == nil {
			return StateCritical, "缺少 Pod 选择器", "0/1", "", "", "NetworkPolicy 缺少 podSelector"
		}
		return StateHealthy, "策略结构有效", "1/1", "", "", "NetworkPolicy 已通过 Kubernetes API 结构校验；实际流量仍需 CNI 或主动探测证据验证"
	case "StorageClass":
		if strings.TrimSpace(stringValue(spec["provisioner"])) == "" {
			return StateCritical, "缺少供应器", "0/1", "", "", "StorageClass 未声明 provisioner"
		}
		return StateHealthy, "配置有效", "1/1", "", "", "StorageClass 已声明 provisioner 并通过 Kubernetes API 校验"
	case "HorizontalPodAutoscaler":
		current, desired := intValue(status["currentReplicas"]), intValue(status["desiredReplicas"])
		ready = fmt.Sprintf("%d/%d", current, desired)
		if conditionState, conditionText, ok := summarizeConditions(status); ok {
			return conditionState, conditionText, ready, "", "", "基于 HPA 结构化 Condition 汇总"
		}
		if desired > 0 && current > 0 {
			return StateHealthy, "副本目标有效", ready, "", "", "HPA 已报告当前和期望副本数，但缺少 Condition，指标获取能力仍需单独确认"
		}
		return StateUnknown, "缺少伸缩状态", ready, "", "", "HPA 没有可判定的 Condition 或有效副本状态"
	case "PodDisruptionBudget":
		current, desired := intValue(status["currentHealthy"]), intValue(status["desiredHealthy"])
		ready = fmt.Sprintf("%d/%d", current, desired)
		if current >= desired {
			return StateHealthy, "预算满足", ready, "", "", "当前健康 Pod 数量满足中断预算"
		}
		return StateWarning, "预算不足", ready, "", "", "当前健康 Pod 数量低于中断预算要求"
	case "Event":
		raw := rawMap(resource.Raw)
		eventType, reason := stringValue(raw["type"]), stringValue(raw["reason"])
		if eventType == "Warning" {
			return StateWarning, valueOr(reason, "警告"), "", "", "", stringValue(raw["message"])
		}
		return StateHealthy, valueOr(reason, "正常"), "", "", "", stringValue(raw["message"])
	default:
		if conditionState, conditionText, ok := summarizeConditions(status); ok {
			return conditionState, conditionText, "", "", "", "基于结构化 Condition 汇总"
		}
		return StateUnknown, "无法确认健康状态", "", "", "", "此资源类型没有可用的结构化健康信号"
	}
}

func buildFacets(items []Item) Facets {
	facets := Facets{
		Kinds: map[string]int{}, Groups: map[string]int{},
		States: map[string]int{},
	}
	namespaces, nodes := map[string]struct{}{}, map[string]struct{}{}
	for _, item := range items {
		facets.Kinds[item.Ref.Kind]++
		facets.Groups[item.Group]++
		facets.States[item.State]++
		if item.Ref.Namespace != "" {
			namespaces[item.Ref.Namespace] = struct{}{}
		}
		if item.Node != "" {
			nodes[item.Node] = struct{}{}
		}
	}
	for value := range namespaces {
		facets.Namespaces = append(facets.Namespaces, value)
	}
	for value := range nodes {
		facets.Nodes = append(facets.Nodes, value)
	}
	sort.Strings(facets.Namespaces)
	sort.Strings(facets.Nodes)
	return facets
}

func matches(item Item, query Query) bool {
	if query.Kind != "" && !strings.EqualFold(item.Ref.Kind, query.Kind) {
		return false
	}
	if query.Group != "" && !strings.EqualFold(item.Group, query.Group) {
		return false
	}
	if query.Namespace != "" && item.Ref.Namespace != query.Namespace {
		return false
	}
	if query.Node != "" && item.Node != query.Node {
		return false
	}
	if query.State != "" && item.State != query.State {
		return false
	}
	if query.Label != "" {
		parts := strings.SplitN(query.Label, "=", 2)
		value, ok := item.Labels[parts[0]]
		if !ok || (len(parts) == 2 && value != parts[1]) {
			return false
		}
	}
	if query.Search != "" {
		haystack := strings.ToLower(strings.Join([]string{
			item.Ref.Kind, item.Ref.Namespace, item.Ref.Name, item.Node, item.IP, item.StateText,
		}, " "))
		if !strings.Contains(haystack, strings.ToLower(query.Search)) {
			return false
		}
	}
	return true
}

func resourceGroup(kind string) string {
	switch kind {
	case "Node", "Namespace":
		return "cluster"
	case "Deployment", "ReplicaSet", "StatefulSet", "DaemonSet", "Pod", "Job", "CronJob", "HorizontalPodAutoscaler", "PodDisruptionBudget":
		return "workloads"
	case "Service", "EndpointSlice", "Ingress", "NetworkPolicy":
		return "network"
	case "PersistentVolumeClaim", "PersistentVolume", "StorageClass":
		return "storage"
	case "ConfigMap":
		return "configuration"
	case "Event":
		return "events"
	default:
		return "other"
	}
}

func severityRank(state string) int {
	switch state {
	case StateCritical:
		return 0
	case StateWarning:
		return 1
	case StateUnknown:
		return 2
	default:
		return 3
	}
}

func endpointCounts(service model.Resource, resources []model.Resource) (int, int) {
	ready, total := 0, 0
	for _, resource := range resources {
		if resource.Ref.Kind != "EndpointSlice" || resource.Ref.Namespace != service.Ref.Namespace ||
			resource.Labels["kubernetes.io/service-name"] != service.Ref.Name {
			continue
		}
		sliceReady, sliceTotal := sliceEndpointCounts(rawMap(resource.Spec))
		ready += sliceReady
		total += sliceTotal
	}
	return ready, total
}

func sliceEndpointCounts(spec map[string]any) (int, int) {
	ready, total := 0, 0
	for _, endpoint := range nestedSlice(spec, "endpoints") {
		total++
		conditions := nestedMap(endpoint, "conditions")
		value, exists := conditions["ready"]
		if !exists || value == true {
			ready++
		}
	}
	return ready, total
}

func summarizeConditions(status map[string]any) (string, string, bool) {
	conditions := nestedSlice(status, "conditions")
	if len(conditions) == 0 {
		return "", "", false
	}
	for _, condition := range conditions {
		if stringValue(condition["status"]) == "False" {
			return StateWarning, valueOr(stringValue(condition["reason"]), "Condition 未满足"), true
		}
	}
	return StateHealthy, "条件正常", true
}

func rawMap(raw json.RawMessage) map[string]any {
	value := map[string]any{}
	_ = json.Unmarshal(raw, &value)
	return value
}

func nestedStringMap(raw json.RawMessage, key string) map[string]string {
	source := rawMap(raw)
	input, _ := source[key].(map[string]any)
	output := make(map[string]string, len(input))
	for itemKey, value := range input {
		output[itemKey] = stringValue(value)
	}
	return output
}

func nestedSlice(value map[string]any, keys ...string) []map[string]any {
	current := any(value)
	for _, key := range keys {
		object, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = object[key]
	}
	input, _ := current.([]any)
	output := make([]map[string]any, 0, len(input))
	for _, item := range input {
		if object, ok := item.(map[string]any); ok {
			output = append(output, object)
		}
	}
	return output
}

func nestedMap(value map[string]any, keys ...string) map[string]any {
	current := any(value)
	for _, key := range keys {
		object, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = object[key]
	}
	output, _ := current.(map[string]any)
	return output
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return ""
	}
}

func intValue(value any) int {
	switch typed := value.(type) {
	case float64:
		return int(typed)
	case int64:
		return int(typed)
	case json.Number:
		number, _ := typed.Int64()
		return int(number)
	default:
		return 0
	}
}

func labelsMatch(selector, labels map[string]string) bool {
	if len(selector) == 0 {
		return false
	}
	for key, value := range selector {
		if labels[key] != value {
			return false
		}
	}
	return true
}

func nodeAddress(status map[string]any) string {
	for _, address := range nestedSlice(status, "addresses") {
		if stringValue(address["type"]) == "InternalIP" {
			return stringValue(address["address"])
		}
	}
	return ""
}

func valueOr(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
