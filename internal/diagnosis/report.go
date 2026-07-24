package diagnosis

import (
	"fmt"
	"time"

	networkdiag "github.com/zhengcongyu/kdiag/internal/network"
	"github.com/zhengcongyu/kdiag/pkg/model"
)

func BuildReport(task *model.DiagnosisTask, topology model.GraphSnapshot) *model.DiagnosisReport {
	report := &model.DiagnosisReport{
		Verdict: model.VerdictInconclusive, Headline: "证据不足，暂时无法确定问题",
		Summary: "KDiag 已完成当前可用的结构化检查，但仍缺少作出可靠结论所需的证据。",
		Impact:  "尚未确认影响范围", AffectedResources: []model.ResourceRef{task.Target},
		Topology: topology, GeneratedAt: time.Now().UTC(),
	}
	for index := range task.Steps {
		step := task.Steps[index]
		switch step.Outcome {
		case model.CheckPassed:
			report.HealthyChecks = append(report.HealthyChecks, step)
		case model.CheckUnknown, model.CheckSkipped:
			report.UnknownChecks = append(report.UnknownChecks, step)
		}
	}
	for _, hypothesis := range task.Hypotheses {
		issue := model.DiagnosticIssue{
			Code: hypothesis.RuleID, Title: hypothesis.Title, Summary: hypothesis.Explanation,
			Confidence: hypothesis.Confidence, Resource: &task.Target,
		}
		switch {
		case len(hypothesis.SupportingEvidence) > 0:
			issue.Outcome, issue.Evidence = model.CheckFailed, hypothesis.SupportingEvidence
			report.ConfirmedIssues = append(report.ConfirmedIssues, issue)
			if report.RootCause == "" {
				report.RootCause = hypothesis.Title
				report.Remediation = append(report.Remediation, hypothesis.Remediation...)
				report.Verification = append(report.Verification, hypothesis.Verification...)
			}
		case len(hypothesis.MissingEvidence) > 0:
			// Missing evidence is represented by UnknownChecks. Absence alone is
			// not enough to label a root cause as suspected.
		}
	}
	report.Coverage.Total = len(task.Steps)
	report.Coverage.Checked = report.Coverage.Total - len(report.UnknownChecks)
	report.Coverage.Capabilities = []string{"Kubernetes 结构化状态", "Condition", "容器状态", "关联资源", "Kubernetes Event（补充证据）"}
	report.Coverage.Limitations = []string{"主动探测默认关闭", "不读取 Secret 内容", "没有节点级和 CNI 实际流量数据"}

	switch {
	case report.Coverage.Total == 0:
		report.Verdict = model.VerdictInconclusive
		report.Headline = fmt.Sprintf("%s 暂无可直接应用的诊断规则", task.Target.Name)
		report.Summary = "已读取资源，但当前规则集尚未覆盖该资源类型；请沿关联 Pod 或 Service 继续诊断。"
		report.Coverage.Limitations = append(report.Coverage.Limitations, "当前规则集没有适用于该资源类型的直接检查")
	case len(report.ConfirmedIssues) > 0:
		report.Verdict = model.VerdictConfirmed
		report.Headline = fmt.Sprintf("%s 存在已确认问题", task.Target.Name)
		report.Summary = fmt.Sprintf("已定位到 %d 个明确问题；最可能的根因是：%s。", len(report.ConfirmedIssues), report.RootCause)
		report.Impact = "该资源及其下游依赖可能受到影响"
		markTopologyNode(&report.Topology, task.Target.UID, "critical", "已确认故障", "root-cause")
	case len(report.SuspectedIssues) > 0 && len(report.UnknownChecks) == 0:
		report.Verdict = model.VerdictSuspected
		report.Headline = fmt.Sprintf("%s 存在疑似问题", task.Target.Name)
		report.Summary = "发现异常线索，但缺少足够的直接证据，当前不应强行认定根因。"
	case len(report.UnknownChecks) > 0:
		report.Verdict = model.VerdictInconclusive
	default:
		report.Verdict = model.VerdictNoIssue
		report.Headline = fmt.Sprintf("%s 的已覆盖检查均正常", task.Target.Name)
		report.Summary = "当前已覆盖的结构化检查没有发现明确问题。"
		report.Impact = "未发现由当前目标引起的明确影响"
	}
	if len(report.Remediation) == 0 {
		report.Remediation = []string{"先补充“未验证”部分所需的证据，再决定是否修改资源；KDiag 不会自动变更生产集群。"}
	}
	enrichTroubleshooting(report, task.Target)
	return report
}

func BuildNetworkReport(task *model.DiagnosisTask, result networkdiag.Result, topology model.GraphSnapshot) *model.DiagnosisReport {
	report := &model.DiagnosisReport{
		Verdict: model.VerdictInconclusive, Headline: result.Summary, Summary: result.Summary,
		Impact:    "源工作负载到目标 Service 的请求路径可能受到影响",
		RootCause: result.RootCause, Coverage: model.CoverageSummary{
			Capabilities: result.Coverage, Limitations: result.Limitations, Total: len(result.Steps),
		},
		Remediation: result.Remediation, Verification: result.Verification,
		AffectedResources: []model.ResourceRef{task.Target}, Topology: topology, GeneratedAt: time.Now().UTC(),
	}
	blocked := false
	for _, networkStep := range result.Steps {
		step := model.DiagnosisStep{
			ID: task.ID + "/" + networkStep.ID, RuleID: "network/" + networkStep.ID,
			Name: networkStep.Name, Status: model.StatusCompleted, Summary: networkStep.Summary,
		}
		switch networkStep.Status {
		case networkdiag.Passed:
			step.Outcome = model.CheckPassed
			report.HealthyChecks = append(report.HealthyChecks, step)
			report.Coverage.Checked++
		case networkdiag.Failed:
			step.Outcome = model.CheckFailed
			blocked = true
			if report.BlockedAt == "" {
				report.BlockedAt = networkStep.Name
			}
			report.ConfirmedIssues = append(report.ConfirmedIssues, model.DiagnosticIssue{
				Code: "network/" + networkStep.ID, Title: networkStep.Name + "检查失败",
				Summary: networkStep.Summary, Outcome: model.CheckFailed, Confidence: networkStep.Evidence.Confidence,
				Resource: networkStep.Evidence.Resource, Evidence: []string{networkStep.Evidence.ID},
			})
			report.Coverage.Checked++
		case networkdiag.Missing:
			step.Outcome = model.CheckUnknown
			report.UnknownChecks = append(report.UnknownChecks, step)
		case networkdiag.Skipped:
			step.Outcome = model.CheckSkipped
			if blocked {
				step.Summary = "因上游已经阻断，此步骤未执行"
			}
			report.UnknownChecks = append(report.UnknownChecks, step)
		}
	}
	if len(report.ConfirmedIssues) > 0 {
		report.Verdict = model.VerdictConfirmed
		report.Headline = fmt.Sprintf("网络路径卡在“%s”", report.BlockedAt)
		report.Summary = result.Summary
		markTopologyNode(&report.Topology, task.Target.UID, "critical", "网络路径阻断点", "root-cause")
	} else if len(report.UnknownChecks) > 0 {
		report.Verdict = model.VerdictInconclusive
		report.Headline = "静态路径未发现明确阻断，实际连通性未验证"
		report.Summary = "已覆盖的静态检查通过，但主动探测、DNS 或 CNI 数据仍缺失，不能宣称网络完全正常。"
	} else {
		report.Verdict = model.VerdictNoIssue
		report.Headline = "网络路径的已覆盖检查均正常"
	}
	if len(report.Remediation) == 0 {
		report.Remediation = []string{"当前没有足够证据建议修改资源；如需确认实际连通性，请在受控环境启用白名单主动探测。"}
	}
	enrichTroubleshooting(report, task.Target)
	return report
}

func markTopologyNode(topology *model.GraphSnapshot, uid, state, stateText, role string) {
	for index := range topology.NodeStates {
		if topology.NodeStates[index].Resource.UID == uid {
			topology.NodeStates[index].State = state
			topology.NodeStates[index].StateText = stateText
			topology.NodeStates[index].Role = role
			return
		}
	}
}
