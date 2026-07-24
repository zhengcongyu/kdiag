package network

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

type Protocol string

const (
	ProtocolTCP  Protocol = "TCP"
	ProtocolHTTP Protocol = "HTTP"
)

type Request struct {
	Cluster     string   `json:"cluster"`
	Namespace   string   `json:"namespace"`
	Source      string   `json:"source"`
	Service     string   `json:"service"`
	Port        int32    `json:"port"`
	Protocol    Protocol `json:"protocol"`
	ActiveProbe bool     `json:"activeProbe"`
}

type Pod struct {
	Ref            model.ResourceRef
	Running        bool
	Ready          bool
	Labels         map[string]string
	IP             string
	ContainerPorts map[string]int32
}

type ServicePort struct {
	Name       string
	Port       int32
	TargetPort string
}

type Service struct {
	Ref       model.ResourceRef
	Exists    bool
	ClusterIP string
	Selector  map[string]string
	Ports     []ServicePort
}

type Endpoint struct {
	Addresses []string
	Ready     *bool
	TargetRef *model.ResourceRef
}

type EndpointSlice struct {
	Ref       model.ResourceRef
	Service   string
	Endpoints []Endpoint
}

type PolicyAssessment struct {
	Applicable       bool
	StaticallyDenied bool
	Summary          string
	Limitations      string
}

type Snapshot struct {
	SourcePods     []Pod
	Service        Service
	BackendPods    []Pod
	EndpointSlices []EndpointSlice
	Policy         PolicyAssessment
}

type StepStatus string

const (
	Passed  StepStatus = "PASSED"
	Failed  StepStatus = "FAILED"
	Missing StepStatus = "MISSING"
	Skipped StepStatus = "SKIPPED"
)

type Step struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Status   StepStatus     `json:"status"`
	Summary  string         `json:"summary"`
	Evidence model.Evidence `json:"evidence"`
}

type Result struct {
	Status       model.DiagnosisStatus `json:"status"`
	Summary      string                `json:"summary"`
	RootCause    string                `json:"rootCause,omitempty"`
	Steps        []Step                `json:"steps"`
	Coverage     []string              `json:"coverage"`
	Limitations  []string              `json:"limitations"`
	Remediation  []string              `json:"remediation"`
	Verification []string              `json:"verification"`
}

type Analyzer struct{ probes ProbeRunner }

func NewAnalyzer(probes ProbeRunner) *Analyzer {
	if probes == nil {
		probes = DisabledProbeRunner{}
	}
	return &Analyzer{probes: probes}
}

func (a *Analyzer) Analyze(ctx context.Context, request Request, snapshot Snapshot) Result {
	result := Result{
		Status:      model.StatusCompleted,
		Coverage:    []string{"source readiness", "Service existence and selector", "all EndpointSlices", "Ready endpoints", "targetPort resolution", "declared container ports", "NetworkPolicy static analysis"},
		Limitations: []string{"Static NetworkPolicy analysis cannot prove actual CNI dataplane behavior.", "Without CNI flow evidence KDiag cannot claim the network is completely healthy."},
	}
	add := func(id, name string, status StepStatus, summary string, role model.EvidenceRole) {
		result.Steps = append(result.Steps, Step{
			ID: id, Name: name, Status: status, Summary: summary,
			Evidence: model.Evidence{
				ID: "network/" + id, Role: role, Source: "network-static-analyzer",
				ObservedAt: time.Now().UTC(), Summary: summary, Confidence: 0.9,
				Freshness: 1, Directness: 0.9, DedupSource: "network/" + id,
			},
		})
	}
	if len(snapshot.SourcePods) == 0 {
		add("source", "源 Pod", Missing, "没有源 Pod 快照，无法验证源端状态", model.EvidenceMissing)
	} else {
		healthy := false
		for _, pod := range snapshot.SourcePods {
			healthy = healthy || (pod.Running && pod.Ready)
		}
		if !healthy {
			add("source", "源 Pod", Failed, "源 Pod 未同时处于 Running 和 Ready", model.EvidenceSupporting)
			result.RootCause = "source_not_ready"
		} else {
			add("source", "源 Pod", Passed, "至少一个源 Pod 处于 Running 且 Ready", model.EvidenceNeutral)
		}
	}
	add("dns", "DNS", Skipped, "主动 DNS 探测默认关闭；静态快照不能证明 DNS 查询成功", model.EvidenceMissing)
	if !snapshot.Service.Exists {
		add("service", "目标 Service", Failed, "目标 Service 不存在", model.EvidenceSupporting)
		return fail(result, "service_not_found", "目标 Service 不存在")
	}
	add("service", "目标 Service", Passed, "目标 Service 存在", model.EvidenceNeutral)
	matched := selectPods(snapshot.BackendPods, snapshot.Service.Selector)
	if len(matched) == 0 {
		add("selector", "Service selector", Failed, "Service selector 没有匹配任何 Pod", model.EvidenceSupporting)
		return fail(result, "service_selector_mismatch", "Service 当前没有可接收请求的后端 Pod")
	}
	add("selector", "Service selector", Passed, fmt.Sprintf("Service selector 匹配 %d 个 Pod", len(matched)), model.EvidenceNeutral)
	slices := []EndpointSlice{}
	for _, slice := range snapshot.EndpointSlices {
		if slice.Service == snapshot.Service.Ref.Name {
			slices = append(slices, slice)
		}
	}
	if len(slices) == 0 {
		add("endpointslices", "EndpointSlice", Failed, "没有代表该 Service 的 EndpointSlice", model.EvidenceSupporting)
		return fail(result, "no_endpointslice", "Service 当前没有 Endpoint")
	}
	ready := readyEndpoints(slices)
	if ready == 0 {
		add("ready-endpoints", "Ready Endpoint", Failed, "所有 EndpointSlice 的 Ready Endpoint 数量为 0", model.EvidenceSupporting)
		return fail(result, "no_ready_endpoint", "Service 当前没有可以接收请求的 Ready 后端")
	}
	add("ready-endpoints", "Ready Endpoint", Passed, fmt.Sprintf("发现 %d 个 Ready Endpoint", ready), model.EvidenceNeutral)
	servicePort, ok := findServicePort(snapshot.Service.Ports, request.Port)
	if !ok {
		add("service-port", "Service 端口", Failed, "请求端口未在 Service ports 中声明", model.EvidenceSupporting)
		return fail(result, "service_port_not_found", "目标端口不属于该 Service")
	}
	mismatched := []string{}
	for _, pod := range matched {
		resolved, ok := resolveTargetPort(servicePort.TargetPort, pod.ContainerPorts)
		if !ok {
			mismatched = append(mismatched, pod.Ref.Name)
			continue
		}
		found := false
		for _, declared := range pod.ContainerPorts {
			found = found || declared == resolved
		}
		if !found {
			mismatched = append(mismatched, pod.Ref.Name)
		}
	}
	if len(mismatched) > 0 {
		add("target-port", "targetPort", Failed, "targetPort 无法解析到后端 Pod 声明的容器端口："+strings.Join(mismatched, ", "), model.EvidenceSupporting)
		result.Remediation = []string{"将 Service targetPort 改为后端容器实际监听端口或正确的命名端口；变更前先审查 Manifest。"}
		result.Verification = []string{"确认 EndpointSlice 仍有 Ready Endpoint。", "分别验证 Pod IP:port 与 Service IP:port，二者都应成功。"}
		return fail(result, "target_port_mismatch", "Service 将流量转发到了后端未声明的端口")
	}
	add("target-port", "targetPort", Passed, "targetPort 可解析到所有匹配 Pod 的已声明容器端口", model.EvidenceNeutral)
	if snapshot.Policy.StaticallyDenied {
		add("network-policy", "NetworkPolicy", Failed, snapshot.Policy.Summary, model.EvidenceSupporting)
		result.Remediation = []string{"审查 NetworkPolicy ingress/egress 选择器与端口；使用最小范围规则放行所需流量。"}
		return fail(result, "network_policy_denied", "NetworkPolicy 静态规则阻止该路径")
	}
	policyStatus := Passed
	policyRole := model.EvidenceNeutral
	if !snapshot.Policy.Applicable {
		policyStatus, policyRole = Missing, model.EvidenceMissing
	}
	add("network-policy", "NetworkPolicy", policyStatus, snapshot.Policy.Summary+" "+snapshot.Policy.Limitations, policyRole)
	if request.ActiveProbe {
		target := ProbeAction{Kind: ProbeTCP, Host: snapshot.Service.ClusterIP, Port: request.Port, Timeout: 3 * time.Second}
		if request.Protocol == ProtocolHTTP {
			target.Kind = ProbeHTTP
		}
		probe, err := a.probes.Run(ctx, target)
		if err != nil {
			add("active-probe", "主动探测", Failed, "结构化主动探测失败："+err.Error(), model.EvidenceSupporting)
		} else {
			add("active-probe", "主动探测", Passed, probe.Summary, model.EvidenceNeutral)
		}
	} else {
		add("active-probe", "主动探测", Skipped, "主动探测默认关闭", model.EvidenceNeutral)
	}
	result.Summary = "静态检查未发现明确阻断，但缺少实际流量与 CNI 数据，不能宣称网络完全正常"
	return result
}

func fail(result Result, rootCause, summary string) Result {
	result.Status, result.RootCause, result.Summary = model.StatusCompleted, rootCause, summary
	return result
}

func selectPods(pods []Pod, selector map[string]string) []Pod {
	result := []Pod{}
	for _, pod := range pods {
		match := len(selector) > 0
		for key, value := range selector {
			match = match && pod.Labels[key] == value
		}
		if match {
			result = append(result, pod)
		}
	}
	return result
}

func readyEndpoints(slices []EndpointSlice) int {
	count := 0
	for _, slice := range slices {
		for _, endpoint := range slice.Endpoints {
			if endpoint.Ready != nil && *endpoint.Ready {
				count++
			}
		}
	}
	return count
}

func findServicePort(ports []ServicePort, requested int32) (ServicePort, bool) {
	for _, port := range ports {
		if port.Port == requested {
			return port, true
		}
	}
	return ServicePort{}, false
}

func resolveTargetPort(target string, ports map[string]int32) (int32, bool) {
	if numeric, err := strconv.ParseInt(target, 10, 32); err == nil && numeric > 0 && numeric <= 65535 {
		return int32(numeric), true
	}
	port, ok := ports[target]
	return port, ok
}

func ValidateRequest(request Request) error {
	if request.Namespace == "" || request.Source == "" || request.Service == "" {
		return fmt.Errorf("namespace, source, and service are required")
	}
	if request.Port < 1 || request.Port > 65535 {
		return fmt.Errorf("port must be between 1 and 65535")
	}
	if request.Protocol != ProtocolTCP && request.Protocol != ProtocolHTTP {
		return fmt.Errorf("protocol must be TCP or HTTP")
	}
	return nil
}

func validProbeHost(host string) bool {
	if ip := net.ParseIP(host); ip != nil {
		return !ip.IsLoopback() && !ip.IsUnspecified() && !ip.IsMulticast() && !ip.IsLinkLocalUnicast()
	}
	if strings.EqualFold(host, "localhost") || strings.ContainsAny(host, "/\\@#?") {
		return false
	}
	parts := strings.Split(host, ".")
	for _, part := range parts {
		if part == "" || len(part) > 63 {
			return false
		}
		for _, char := range part {
			if !((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '-') {
				return false
			}
		}
	}
	return true
}
