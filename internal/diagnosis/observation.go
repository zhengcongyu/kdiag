package diagnosis

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/zhengcongyu/kdiag/internal/inventory"
	networkdiag "github.com/zhengcongyu/kdiag/internal/network"
	"github.com/zhengcongyu/kdiag/internal/rules"
	"github.com/zhengcongyu/kdiag/pkg/model"
)

// ObservationProvider is the trusted bridge between the informer-backed
// inventory and deterministic diagnosis rules. Browser supplied snapshots are
// never required for a live diagnosis.
type ObservationProvider interface {
	Build(model.ResourceRef) (rules.Observation, error)
	BuildNetwork(networkdiag.Request) (networkdiag.Snapshot, error)
	Topology(uid string, depth int, direction string) (model.GraphSnapshot, error)
}

type InventoryObservationProvider struct {
	inventory inventory.Reader
}

func NewObservationProvider(reader inventory.Reader) *InventoryObservationProvider {
	return &InventoryObservationProvider{inventory: reader}
}

func (p *InventoryObservationProvider) Build(ref model.ResourceRef) (rules.Observation, error) {
	target, err := p.inventory.Get(ref.UID)
	if err != nil {
		return rules.Observation{}, err
	}
	all := p.all()
	observation := rules.Observation{Resource: target.Ref}
	spec, status := rawMap(target.Spec), rawMap(target.Status)

	switch target.Ref.Kind {
	case "Pod":
		buildPodObservation(&observation, target, spec, status, all)
	case "Service":
		buildServiceObservation(&observation, target, spec, all)
	case "PersistentVolumeClaim":
		phase := stringValue(status["phase"])
		if phase != "" {
			observation.PVCPhase = stringPointer(phase)
		}
	case "Node":
		for _, condition := range nestedSlice(status, "conditions") {
			if stringValue(condition["type"]) == "Ready" {
				ready := stringValue(condition["status"]) == "True"
				observation.NodeReady = &ready
				break
			}
		}
	}
	return observation, nil
}

func buildPodObservation(observation *rules.Observation, target inventory.Item, spec, status map[string]any, all []inventory.Item) {
	for _, condition := range nestedSlice(status, "conditions") {
		switch stringValue(condition["type"]) {
		case "Ready":
			value := stringValue(condition["status"]) == "True"
			observation.PodReady = &value
			if value {
				probeFailed := false
				observation.ReadinessProbeFailed = &probeFailed
			}
		case "PodScheduled":
			value := stringValue(condition["status"]) == "True"
			observation.PodScheduled = &value
			if !value && stringValue(condition["reason"]) == "Unschedulable" {
				message := strings.ToLower(stringValue(condition["message"]))
				insufficient := strings.Contains(message, "insufficient")
				taint := strings.Contains(message, "taint") || strings.Contains(message, "tolerat")
				observation.InsufficientResources = &insufficient
				observation.TaintMismatch = &taint
			}
		}
	}
	for _, container := range nestedSlice(status, "containerStatuses") {
		if waiting := nestedMap(container, "state", "waiting"); waiting != nil {
			if reason := stringValue(waiting["reason"]); reason != "" {
				observation.ContainerWaitingReason = stringPointer(reason)
			}
		}
		if terminated := nestedMap(container, "lastState", "terminated"); terminated != nil {
			if reason := stringValue(terminated["reason"]); reason != "" {
				observation.ContainerTerminatedReason = stringPointer(reason)
			}
			if code, ok := numberValue(terminated["exitCode"]); ok {
				value := int32(code)
				observation.ExitCode = &value
			}
		}
	}
	for _, item := range all {
		if item.Ref.Kind != "Event" {
			continue
		}
		raw := rawMap(item.Raw)
		involved, _ := raw["involvedObject"].(map[string]any)
		if stringValue(involved["uid"]) != target.Ref.UID {
			continue
		}
		message := strings.ToLower(stringValue(raw["message"]))
		if strings.Contains(message, "readiness probe") {
			failed := strings.EqualFold(stringValue(raw["reason"]), "Unhealthy")
			observation.ReadinessProbeFailed = &failed
		}
	}
	_ = spec
}

func buildServiceObservation(observation *rules.Observation, target inventory.Item, spec map[string]any, all []inventory.Item) {
	exists := true
	observation.ServiceExists = &exists
	selector := stringMap(spec["selector"])
	pods := []inventory.Item{}
	for _, item := range all {
		if item.Ref.Kind == "Pod" && item.Ref.Namespace == target.Ref.Namespace && labelsMatch(selector, item.Labels) {
			pods = append(pods, item)
		}
	}
	matches := len(pods) > 0
	observation.SelectorMatches = &matches

	ready := 0
	for _, item := range all {
		if item.Ref.Kind != "EndpointSlice" || item.Ref.Namespace != target.Ref.Namespace ||
			item.Labels["kubernetes.io/service-name"] != target.Ref.Name {
			continue
		}
		for _, endpoint := range nestedSlice(rawMap(item.Spec), "endpoints") {
			conditions, _ := endpoint["conditions"].(map[string]any)
			if value, ok := conditions["ready"].(bool); ok && value {
				ready++
			}
		}
	}
	observation.ReadyEndpoints = &ready
	if len(pods) == 0 {
		return
	}
	matchesPort := true
	ports := nestedSlice(spec, "ports")
	for _, servicePort := range ports {
		targetPort := valueString(servicePort["targetPort"])
		if targetPort == "" {
			targetPort = valueString(servicePort["port"])
		}
		for _, pod := range pods {
			if !podDeclaresPort(pod, targetPort) {
				matchesPort = false
			}
		}
	}
	observation.TargetPortMatches = &matchesPort
}

func (p *InventoryObservationProvider) BuildNetwork(request networkdiag.Request) (networkdiag.Snapshot, error) {
	all := p.all()
	var service *inventory.Item
	for index := range all {
		item := &all[index]
		if item.Ref.Kind == "Service" && item.Ref.Namespace == request.Namespace && item.Ref.Name == request.Service {
			service = item
			break
		}
	}
	if service == nil {
		return networkdiag.Snapshot{Service: networkdiag.Service{Exists: false}}, nil
	}
	serviceSpec := rawMap(service.Spec)
	snapshot := networkdiag.Snapshot{
		Service: networkdiag.Service{
			Ref: service.Ref, Exists: true, ClusterIP: stringValue(serviceSpec["clusterIP"]),
			Selector: stringMap(serviceSpec["selector"]),
		},
		Policy: networkdiag.PolicyAssessment{
			Summary:     "未发现适用于该路径的 NetworkPolicy",
			Limitations: "缺少 CNI 实际流量数据，静态分析不能证明网络完全正常",
		},
	}
	for _, port := range nestedSlice(serviceSpec, "ports") {
		targetPort := valueString(port["targetPort"])
		if targetPort == "" {
			targetPort = valueString(port["port"])
		}
		snapshot.Service.Ports = append(snapshot.Service.Ports, networkdiag.ServicePort{
			Name: stringValue(port["name"]), Port: int32Value(port["port"]),
			TargetPort: targetPort,
		})
	}
	sourceParts := strings.SplitN(request.Source, "/", 2)
	sourceKind, sourceName := "Pod", request.Source
	if len(sourceParts) == 2 {
		sourceKind, sourceName = sourceParts[0], sourceParts[1]
	}
	var sourceSelector map[string]string
	for _, item := range all {
		if item.Ref.Namespace != request.Namespace {
			continue
		}
		if item.Ref.Kind == sourceKind && item.Ref.Name == sourceName {
			if sourceKind == "Pod" {
				snapshot.SourcePods = append(snapshot.SourcePods, networkPod(item))
			} else {
				sourceSelector = stringMap(nestedMap(rawMap(item.Spec), "selector", "matchLabels"))
			}
		}
		if item.Ref.Kind == "NetworkPolicy" {
			snapshot.Policy.Applicable = true
			snapshot.Policy.Summary = "发现 NetworkPolicy；已完成对象级静态检查，实际数据面仍需探测验证"
		}
	}
	for _, item := range all {
		if item.Ref.Kind == "Pod" && item.Ref.Namespace == request.Namespace {
			pod := networkPod(item)
			snapshot.BackendPods = append(snapshot.BackendPods, pod)
			if sourceKind != "Pod" && labelsMatch(sourceSelector, item.Labels) {
				snapshot.SourcePods = append(snapshot.SourcePods, pod)
			}
		}
		if item.Ref.Kind == "EndpointSlice" && item.Ref.Namespace == request.Namespace {
			snapshot.EndpointSlices = append(snapshot.EndpointSlices, networkSlice(item))
		}
	}
	return snapshot, nil
}

func (p *InventoryObservationProvider) Topology(uid string, depth int, direction string) (model.GraphSnapshot, error) {
	if depth < 1 {
		depth = 2
	}
	if depth > 5 {
		depth = 5
	}
	all := p.all()
	byUID := map[string]inventory.Item{}
	for _, item := range all {
		byUID[item.Ref.UID] = item
	}
	if _, ok := byUID[uid]; !ok {
		return model.GraphSnapshot{}, errors.New("resource not found")
	}
	edges := topologyEdges(all)
	seen := map[string]bool{uid: true}
	frontier := []string{uid}
	for level := 0; level < depth; level++ {
		next := []string{}
		for _, current := range frontier {
			for _, edge := range edges {
				include := (direction != "upstream" && edge.From.UID == current) ||
					(direction != "downstream" && edge.To.UID == current)
				if !include {
					continue
				}
				other := edge.To.UID
				if edge.To.UID == current {
					other = edge.From.UID
				}
				if !seen[other] {
					seen[other] = true
					next = append(next, other)
				}
			}
		}
		frontier = next
	}
	result := model.GraphSnapshot{}
	for nodeUID := range seen {
		item := byUID[nodeUID]
		result.Nodes = append(result.Nodes, item.Ref)
		result.NodeStates = append(result.NodeStates, model.TopologyNodeState{
			Resource: item.Ref, State: item.State, StateText: item.StateText, Summary: item.Summary,
		})
	}
	for _, edge := range edges {
		if seen[edge.From.UID] && seen[edge.To.UID] {
			result.Edges = append(result.Edges, edge)
		}
	}
	return result, nil
}

func (p *InventoryObservationProvider) all() []inventory.Item {
	result := []inventory.Item{}
	for offset := 0; ; offset += 200 {
		page := p.inventory.List(inventory.Query{Offset: offset, Limit: 200})
		result = append(result, page.Items...)
		if len(result) >= page.Total || len(page.Items) == 0 {
			break
		}
	}
	return result
}

func topologyEdges(all []inventory.Item) []model.GraphEdge {
	edges := []model.GraphEdge{}
	byUID := map[string]model.ResourceRef{}
	nodesByName := map[string]model.ResourceRef{}
	for _, item := range all {
		byUID[item.Ref.UID] = item.Ref
		nodesByName[item.Ref.Kind+"/"+item.Ref.Namespace+"/"+item.Ref.Name] = item.Ref
	}
	added := map[string]bool{}
	add := func(from, to model.ResourceRef, relation string) {
		key := from.UID + "/" + to.UID + "/" + relation
		if from.UID == "" || to.UID == "" || added[key] {
			return
		}
		added[key] = true
		edges = append(edges, model.GraphEdge{From: from, To: to, Relation: relation})
	}
	for _, item := range all {
		for _, owner := range item.Owners {
			if ref, ok := byUID[owner.UID]; ok {
				add(ref, item.Ref, "owns")
			}
		}
		for _, relation := range item.Relations {
			switch relation.Type {
			case "selects", "represented-by":
				add(item.Ref, relation.Resource, relation.Type)
			}
		}
		if item.Ref.Kind == "Pod" {
			spec := rawMap(item.Spec)
			if node := nodesByName["Node//"+stringValue(spec["nodeName"])]; node.UID != "" {
				add(item.Ref, node, "scheduled-on")
			}
			for _, volume := range nestedSlice(spec, "volumes") {
				claim := nestedMap(volume, "persistentVolumeClaim")
				if claim == nil {
					continue
				}
				if pvc := nodesByName["PersistentVolumeClaim/"+item.Ref.Namespace+"/"+stringValue(claim["claimName"])]; pvc.UID != "" {
					add(item.Ref, pvc, "mounts")
				}
			}
		}
	}
	return edges
}

func networkPod(item inventory.Item) networkdiag.Pod {
	spec, status := rawMap(item.Spec), rawMap(item.Status)
	pod := networkdiag.Pod{
		Ref: item.Ref, Running: stringValue(status["phase"]) == "Running",
		Labels: item.Labels, IP: stringValue(status["podIP"]), ContainerPorts: map[string]int32{},
	}
	for _, condition := range nestedSlice(status, "conditions") {
		if stringValue(condition["type"]) == "Ready" && stringValue(condition["status"]) == "True" {
			pod.Ready = true
		}
	}
	for _, container := range nestedSlice(spec, "containers") {
		for _, port := range nestedSlice(container, "ports") {
			number := int32Value(port["containerPort"])
			name := stringValue(port["name"])
			if name == "" {
				name = strconv.Itoa(int(number))
			}
			pod.ContainerPorts[name] = number
		}
	}
	return pod
}

func networkSlice(item inventory.Item) networkdiag.EndpointSlice {
	result := networkdiag.EndpointSlice{
		Ref: item.Ref, Service: item.Labels["kubernetes.io/service-name"],
	}
	for _, endpoint := range nestedSlice(rawMap(item.Spec), "endpoints") {
		value := networkdiag.Endpoint{}
		for _, address := range anySlice(endpoint["addresses"]) {
			value.Addresses = append(value.Addresses, stringValue(address))
		}
		if conditions, ok := endpoint["conditions"].(map[string]any); ok {
			if ready, ok := conditions["ready"].(bool); ok {
				value.Ready = &ready
			}
		}
		if target, ok := endpoint["targetRef"].(map[string]any); ok {
			value.TargetRef = &model.ResourceRef{
				Cluster: item.Ref.Cluster, UID: stringValue(target["uid"]), Kind: stringValue(target["kind"]),
				Namespace: valueOr(stringValue(target["namespace"]), item.Ref.Namespace), Name: stringValue(target["name"]),
			}
		}
		result.Endpoints = append(result.Endpoints, value)
	}
	return result
}

func podDeclaresPort(item inventory.Item, target string) bool {
	for _, container := range nestedSlice(rawMap(item.Spec), "containers") {
		for _, port := range nestedSlice(container, "ports") {
			if stringValue(port["name"]) == target || valueString(port["containerPort"]) == target {
				return true
			}
		}
	}
	return false
}

func rawMap(raw json.RawMessage) map[string]any {
	result := map[string]any{}
	_ = json.Unmarshal(raw, &result)
	return result
}

func nestedMap(value map[string]any, keys ...string) map[string]any {
	current := value
	for _, key := range keys {
		next, ok := current[key].(map[string]any)
		if !ok {
			return nil
		}
		current = next
	}
	return current
}

func nestedSlice(value map[string]any, key string) []map[string]any {
	items := anySlice(value[key])
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if mapped, ok := item.(map[string]any); ok {
			result = append(result, mapped)
		}
	}
	return result
}

func anySlice(value any) []any {
	items, _ := value.([]any)
	return items
}

func stringMap(value any) map[string]string {
	result := map[string]string{}
	if mapped, ok := value.(map[string]any); ok {
		for key, item := range mapped {
			result[key] = stringValue(item)
		}
	}
	return result
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

func stringValue(value any) string {
	if value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return text
	}
	return fmt.Sprint(value)
}

func valueString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case float64:
		return strconv.FormatInt(int64(typed), 10)
	case json.Number:
		return typed.String()
	default:
		return stringValue(value)
	}
}

func numberValue(value any) (int64, bool) {
	switch typed := value.(type) {
	case float64:
		return int64(typed), true
	case int:
		return int64(typed), true
	case json.Number:
		result, err := typed.Int64()
		return result, err == nil
	}
	return 0, false
}

func int32Value(value any) int32 {
	number, _ := strconv.ParseInt(valueString(value), 10, 32)
	return int32(number)
}

func stringPointer(value string) *string { return &value }

func valueOr(value, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}
