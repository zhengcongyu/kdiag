package rules

import (
	"fmt"
	"strings"
	"time"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

type Observation struct {
	Resource                  model.ResourceRef
	ContainerWaitingReason    *string
	ContainerTerminatedReason *string
	ExitCode                  *int32
	PodReady                  *bool
	ReadinessProbeFailed      *bool
	ServiceExists             *bool
	SelectorMatches           *bool
	ReadyEndpoints            *int
	TargetPortMatches         *bool
	PodScheduled              *bool
	InsufficientResources     *bool
	TaintMismatch             *bool
	PVCPhase                  *string
	NodeReady                 *bool
}

type Result struct {
	Status     model.DiagnosisStatus
	Evidence   []model.Evidence
	Hypothesis *model.Hypothesis
}

type Rule interface {
	ID() string
	Version() string
	ApplicableKinds() []string
	Evaluate(Observation) Result
}

type predicate func(Observation) (matched bool, contradicted bool, available bool, detail string)

type deterministicRule struct {
	id, title, source, remediation, verification string
	kinds                                        []string
	check                                        predicate
}

func (r deterministicRule) ID() string                { return r.id }
func (r deterministicRule) Version() string           { return "1.0.0" }
func (r deterministicRule) ApplicableKinds() []string { return append([]string(nil), r.kinds...) }

func (r deterministicRule) Evaluate(observation Observation) Result {
	matched, contradicted, available, detail := r.check(observation)
	role := model.EvidenceMissing
	status := model.StatusNeedsMoreEvidence
	confidence := 0.0
	summary := "Required structured evidence is unavailable"
	if available && matched {
		role, status, confidence, summary = model.EvidenceSupporting, model.StatusCompleted, 0.9, detail
	} else if available && contradicted {
		role, status, confidence, summary = model.EvidenceContradicting, model.StatusCompleted, 0.95, detail
	}
	evidenceID := r.id + "/evidence"
	evidence := model.Evidence{
		ID: evidenceID, Role: role, Source: r.source, ObservedAt: time.Now().UTC(),
		Resource: &observation.Resource, Summary: summary, Confidence: confidence,
		Freshness: 1, Directness: 1, RawRef: "snapshot://structured-status/" + observation.Resource.UID,
		DedupSource: r.id + "/" + observation.Resource.UID,
	}
	hypothesis := &model.Hypothesis{
		ID: r.id + "/hypothesis", RuleID: r.id, RuleVersion: r.Version(),
		Title: r.title, Explanation: summary, Confidence: confidence, Status: status,
		Remediation: []string{r.remediation}, Verification: []string{r.verification},
	}
	switch role {
	case model.EvidenceSupporting:
		hypothesis.SupportingEvidence = []string{evidenceID}
	case model.EvidenceContradicting:
		hypothesis.ContradictingEvidence = []string{evidenceID}
	case model.EvidenceMissing:
		hypothesis.MissingEvidence = []string{evidenceID}
	}
	return Result{Status: status, Evidence: []model.Evidence{evidence}, Hypothesis: hypothesis}
}

func Catalog() []Rule {
	waiting := func(reason string) predicate {
		return func(o Observation) (bool, bool, bool, string) {
			if o.ContainerWaitingReason == nil {
				return false, false, false, ""
			}
			match := *o.ContainerWaitingReason == reason
			return match, !match, true, fmt.Sprintf("container waiting reason is %s", *o.ContainerWaitingReason)
		}
	}
	boolean := func(value func(Observation) *bool, expected bool, detail string) predicate {
		return func(o Observation) (bool, bool, bool, string) {
			got := value(o)
			if got == nil {
				return false, false, false, ""
			}
			match := *got == expected
			return match, !match, true, detail
		}
	}
	rules := []Rule{
		newRule("KDIAG-POD-CRASHLOOP", "容器正在反复崩溃并重启", []string{"Pod"}, waiting("CrashLoopBackOff")),
		// OOM requires the structured terminated reason; exit code 137 alone is intentionally ignored.
		newRule("KDIAG-POD-OOMKILLED", "容器被内存不足保护机制终止", []string{"Pod"}, func(o Observation) (bool, bool, bool, string) {
			if o.ContainerTerminatedReason == nil {
				return false, false, false, ""
			}
			match := *o.ContainerTerminatedReason == "OOMKilled"
			return match, !match, true, "last container termination reason is " + *o.ContainerTerminatedReason
		}),
		newRule("KDIAG-POD-IMAGEPULLBACKOFF", "容器镜像拉取持续退避", []string{"Pod"}, waiting("ImagePullBackOff")),
		newRule("KDIAG-POD-ERRIMAGEPULL", "容器镜像无法拉取", []string{"Pod"}, waiting("ErrImagePull")),
		newRule("KDIAG-POD-CONFIG", "容器配置无法创建", []string{"Pod"}, waiting("CreateContainerConfigError")),
		newRule("KDIAG-POD-READINESS", "就绪探针正在失败", []string{"Pod"}, boolean(func(o Observation) *bool { return o.ReadinessProbeFailed }, true, "结构化就绪状态和探针事件显示检查失败")),
		newRule("KDIAG-SVC-SELECTOR", "Service selector 没有匹配任何 Pod", []string{"Service"}, boolean(func(o Observation) *bool { return o.SelectorMatches }, false, "已计算 Service selector 与 Pod 标签的匹配结果")),
		newRule("KDIAG-SVC-ENDPOINT", "Service 没有 Ready Endpoint", []string{"Service"}, func(o Observation) (bool, bool, bool, string) {
			if o.ReadyEndpoints == nil {
				return false, false, false, ""
			}
			match := *o.ReadyEndpoints == 0
			return match, !match, true, fmt.Sprintf("EndpointSlice Ready endpoint count is %d", *o.ReadyEndpoints)
		}),
		newRule("KDIAG-SVC-TARGETPORT", "Service targetPort 与后端容器端口不一致", []string{"Service"}, boolean(func(o Observation) *bool { return o.TargetPortMatches }, false, "已将 targetPort 与后端 Pod 声明端口逐一比较")),
		newRule("KDIAG-SCHED-RESOURCES", "Pod 因资源不足无法调度", []string{"Pod"}, boolean(func(o Observation) *bool { return o.InsufficientResources }, true, "PodScheduled Condition 显示调度资源不足")),
		newRule("KDIAG-SCHED-TAINT", "Pod toleration 与节点 taint 不匹配", []string{"Pod"}, boolean(func(o Observation) *bool { return o.TaintMismatch }, true, "调度 Condition 显示 taint/toleration 不匹配")),
		newRule("KDIAG-PVC-PENDING", "PersistentVolumeClaim 一直处于 Pending", []string{"PersistentVolumeClaim"}, func(o Observation) (bool, bool, bool, string) {
			if o.PVCPhase == nil {
				return false, false, false, ""
			}
			match := strings.EqualFold(*o.PVCPhase, "Pending")
			return match, !match, true, "PVC phase is " + *o.PVCPhase
		}),
		newRule("KDIAG-NODE-NOTREADY", "节点当前未就绪", []string{"Node"}, boolean(func(o Observation) *bool { return o.NodeReady }, false, "已检查 Node Ready Condition")),
	}
	return rules
}

func newRule(id, title string, kinds []string, check predicate) Rule {
	return deterministicRule{
		id: id, title: title, kinds: kinds, check: check, source: "kubernetes-structured-status",
		remediation:  "检查报告中的结构化证据并审查建议的 Manifest 变更；KDiag 不会自动修改生产资源。",
		verification: "修复后重新运行诊断，确认结构化状态恢复，并验证下游 Endpoint 和请求路径。",
	}
}
