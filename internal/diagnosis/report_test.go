package diagnosis

import (
	"testing"
	"time"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

func TestReportNeverCallsMissingEvidenceHealthy(t *testing.T) {
	target := model.ResourceRef{UID: "pod-1", Kind: "Pod", Name: "payment"}
	task := &model.DiagnosisTask{
		ID: "task-1", Target: target,
		Steps: []model.DiagnosisStep{{
			ID: "missing", Name: "就绪探针", Outcome: model.CheckUnknown,
			Status: model.StatusNeedsMoreEvidence, Summary: "缺少必要证据",
		}},
		Hypotheses: []model.Hypothesis{{
			ID: "h1", RuleID: "rule", Title: "就绪探针失败",
			MissingEvidence: []string{"e1"}, Status: model.StatusNeedsMoreEvidence,
		}},
	}
	report := BuildReport(task, model.GraphSnapshot{})
	if report.Verdict != model.VerdictInconclusive || len(report.HealthyChecks) != 0 || len(report.UnknownChecks) != 1 {
		t.Fatalf("missing evidence was misclassified: %#v", report)
	}
}

func TestReportPromotesStructuredSupportingEvidence(t *testing.T) {
	target := model.ResourceRef{UID: "svc-1", Kind: "Service", Name: "payment"}
	task := &model.DiagnosisTask{
		ID: "task-1", Target: target, CreatedAt: time.Now().UTC(),
		Steps: []model.DiagnosisStep{{
			ID: "failed", Name: "目标端口", Outcome: model.CheckFailed,
			Status: model.StatusCompleted, Summary: "targetPort 不匹配",
		}},
		Hypotheses: []model.Hypothesis{{
			ID: "h1", RuleID: "KDIAG-SVC-TARGETPORT", Title: "Service targetPort 与后端容器端口不一致",
			Explanation: "已将 targetPort 与后端端口比较", Confidence: .9,
			SupportingEvidence: []string{"e1"}, Remediation: []string{"审查端口配置"},
		}},
	}
	report := BuildReport(task, model.GraphSnapshot{})
	if report.Verdict != model.VerdictConfirmed || len(report.ConfirmedIssues) != 1 ||
		report.RootCause == "" || len(report.Remediation) == 0 {
		t.Fatalf("supporting evidence was not promoted: %#v", report)
	}
}
