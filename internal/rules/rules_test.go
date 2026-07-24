package rules

import (
	"testing"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

func ptr[T any](value T) *T { return &value }

func TestEveryRulePositiveNegativeAndMissing(t *testing.T) {
	cases := map[string]struct{ positive, negative Observation }{
		"KDIAG-POD-CRASHLOOP":        {Observation{ContainerWaitingReason: ptr("CrashLoopBackOff")}, Observation{ContainerWaitingReason: ptr("Running")}},
		"KDIAG-POD-OOMKILLED":        {Observation{ContainerTerminatedReason: ptr("OOMKilled")}, Observation{ContainerTerminatedReason: ptr("Error")}},
		"KDIAG-POD-IMAGEPULLBACKOFF": {Observation{ContainerWaitingReason: ptr("ImagePullBackOff")}, Observation{ContainerWaitingReason: ptr("Running")}},
		"KDIAG-POD-ERRIMAGEPULL":     {Observation{ContainerWaitingReason: ptr("ErrImagePull")}, Observation{ContainerWaitingReason: ptr("Running")}},
		"KDIAG-POD-CONFIG":           {Observation{ContainerWaitingReason: ptr("CreateContainerConfigError")}, Observation{ContainerWaitingReason: ptr("Running")}},
		"KDIAG-POD-READINESS":        {Observation{ReadinessProbeFailed: ptr(true)}, Observation{ReadinessProbeFailed: ptr(false)}},
		"KDIAG-SVC-SELECTOR":         {Observation{SelectorMatches: ptr(false)}, Observation{SelectorMatches: ptr(true)}},
		"KDIAG-SVC-ENDPOINT":         {Observation{ReadyEndpoints: ptr(0)}, Observation{ReadyEndpoints: ptr(2)}},
		"KDIAG-SVC-TARGETPORT":       {Observation{TargetPortMatches: ptr(false)}, Observation{TargetPortMatches: ptr(true)}},
		"KDIAG-SCHED-RESOURCES":      {Observation{InsufficientResources: ptr(true)}, Observation{InsufficientResources: ptr(false)}},
		"KDIAG-SCHED-TAINT":          {Observation{TaintMismatch: ptr(true)}, Observation{TaintMismatch: ptr(false)}},
		"KDIAG-PVC-PENDING":          {Observation{PVCPhase: ptr("Pending")}, Observation{PVCPhase: ptr("Bound")}},
		"KDIAG-NODE-NOTREADY":        {Observation{NodeReady: ptr(false)}, Observation{NodeReady: ptr(true)}},
	}
	for _, rule := range Catalog() {
		tt, ok := cases[rule.ID()]
		if !ok {
			t.Fatalf("test case missing for %s", rule.ID())
		}
		t.Run(rule.ID()+"/positive", func(t *testing.T) {
			result := rule.Evaluate(tt.positive)
			if result.Evidence[0].Role != model.EvidenceSupporting {
				t.Fatalf("got %#v", result)
			}
		})
		t.Run(rule.ID()+"/negative", func(t *testing.T) {
			result := rule.Evaluate(tt.negative)
			if result.Evidence[0].Role != model.EvidenceContradicting {
				t.Fatalf("got %#v", result)
			}
		})
		t.Run(rule.ID()+"/missing", func(t *testing.T) {
			result := rule.Evaluate(Observation{})
			if result.Status != model.StatusNeedsMoreEvidence || result.Evidence[0].Role != model.EvidenceMissing {
				t.Fatalf("got %#v", result)
			}
		})
	}
}

func TestExit137AloneDoesNotProveOOM(t *testing.T) {
	exit := int32(137)
	var oom Rule
	for _, rule := range Catalog() {
		if rule.ID() == "KDIAG-POD-OOMKILLED" {
			oom = rule
		}
	}
	result := oom.Evaluate(Observation{ExitCode: &exit})
	if result.Status != model.StatusNeedsMoreEvidence {
		t.Fatalf("exit 137 was treated as OOM proof: %#v", result)
	}
}
