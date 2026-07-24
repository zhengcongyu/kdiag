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
		newRule("KDIAG-POD-CRASHLOOP", "Container is repeatedly crashing", []string{"Pod"}, waiting("CrashLoopBackOff")),
		// OOM requires the structured terminated reason; exit code 137 alone is intentionally ignored.
		newRule("KDIAG-POD-OOMKILLED", "Container was terminated by the OOM killer", []string{"Pod"}, func(o Observation) (bool, bool, bool, string) {
			if o.ContainerTerminatedReason == nil {
				return false, false, false, ""
			}
			match := *o.ContainerTerminatedReason == "OOMKilled"
			return match, !match, true, "last container termination reason is " + *o.ContainerTerminatedReason
		}),
		newRule("KDIAG-POD-IMAGEPULLBACKOFF", "Image pull is backing off", []string{"Pod"}, waiting("ImagePullBackOff")),
		newRule("KDIAG-POD-ERRIMAGEPULL", "Container image could not be pulled", []string{"Pod"}, waiting("ErrImagePull")),
		newRule("KDIAG-POD-CONFIG", "Container configuration could not be created", []string{"Pod"}, waiting("CreateContainerConfigError")),
		newRule("KDIAG-POD-READINESS", "Readiness probe is failing", []string{"Pod"}, boolean(func(o Observation) *bool { return o.ReadinessProbeFailed }, true, "structured readiness check reports failure")),
		newRule("KDIAG-SVC-SELECTOR", "Service selector matches no Pods", []string{"Service"}, boolean(func(o Observation) *bool { return o.SelectorMatches }, false, "Service selector match result was evaluated")),
		newRule("KDIAG-SVC-ENDPOINT", "Service has no Ready Endpoint", []string{"Service"}, func(o Observation) (bool, bool, bool, string) {
			if o.ReadyEndpoints == nil {
				return false, false, false, ""
			}
			match := *o.ReadyEndpoints == 0
			return match, !match, true, fmt.Sprintf("EndpointSlice Ready endpoint count is %d", *o.ReadyEndpoints)
		}),
		newRule("KDIAG-SVC-TARGETPORT", "Service targetPort does not match a backend container port", []string{"Service"}, boolean(func(o Observation) *bool { return o.TargetPortMatches }, false, "resolved targetPort was compared with backend container ports")),
		newRule("KDIAG-SCHED-RESOURCES", "Pod cannot be scheduled because resources are insufficient", []string{"Pod"}, boolean(func(o Observation) *bool { return o.InsufficientResources }, true, "scheduler condition reports insufficient resources")),
		newRule("KDIAG-SCHED-TAINT", "Pod tolerations do not match node taints", []string{"Pod"}, boolean(func(o Observation) *bool { return o.TaintMismatch }, true, "taints and tolerations were compared structurally")),
		newRule("KDIAG-PVC-PENDING", "PersistentVolumeClaim is Pending", []string{"PersistentVolumeClaim"}, func(o Observation) (bool, bool, bool, string) {
			if o.PVCPhase == nil {
				return false, false, false, ""
			}
			match := strings.EqualFold(*o.PVCPhase, "Pending")
			return match, !match, true, "PVC phase is " + *o.PVCPhase
		}),
		newRule("KDIAG-NODE-NOTREADY", "Node is NotReady", []string{"Node"}, boolean(func(o Observation) *bool { return o.NodeReady }, false, "Node Ready condition was evaluated")),
	}
	return rules
}

func newRule(id, title string, kinds []string, check predicate) Rule {
	return deterministicRule{
		id: id, title: title, kinds: kinds, check: check, source: "kubernetes-structured-status",
		remediation:  "Inspect the referenced workload configuration and apply a reviewed change; KDiag never mutates production resources.",
		verification: "Re-run this rule and confirm the structured status is healthy and dependent endpoints recover.",
	}
}
