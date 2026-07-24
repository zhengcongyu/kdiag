import {render, screen} from "@testing-library/react";
import {expect, test} from "vitest";
import {DiagnosisReportView} from "./DiagnosisReportView";
import type {DiagnosisTask} from "../types";

test("shows a plain-language conclusion before technical evidence", () => {
  const task: DiagnosisTask = {
    id: "task-1", kind: "network", status: "COMPLETED",
    target: {cluster: "test", uid: "svc-1", kind: "Service", namespace: "production", name: "payment"},
    evidence: [], hypotheses: [],
    steps: [{
      id: "target-port", ruleId: "network/target-port", name: "目标端口",
      status: "COMPLETED", outcome: "FAILED", summary: "targetPort 8080 没有对应的容器端口"
    }],
    report: {
      verdict: "CONFIRMED_ISSUE", headline: "网络路径卡在“目标端口”",
      summary: "Service 将流量转发到了后端未声明的端口",
      impact: "payment 当前无法把请求交给后端 Pod", blockedAt: "目标端口",
      rootCause: "target_port_mismatch",
      confirmedIssues: [{
        code: "network/target-port", title: "目标端口检查失败",
        summary: "targetPort 8080 没有对应的容器端口", outcome: "FAILED",
        confidence: .9, evidence: ["network/target-port"]
      }],
      suspectedIssues: [], healthyChecks: [], unknownChecks: [],
      affectedResources: [], coverage: {
        checked: 1, total: 1, capabilities: ["结构化 Service 与 Pod 端口"], limitations: ["主动探测默认关闭"]
      },
      remediation: ["把 targetPort 改为 Pod 实际监听端口"], verification: ["重新验证 Service 请求"],
      topology: {nodes: [], edges: []}, generatedAt: new Date().toISOString()
    }
  };
  render(<DiagnosisReportView task={task} />);
  expect(screen.getByRole("heading", {name: "网络路径卡在“目标端口”"})).toBeInTheDocument();
  expect(screen.getByText("payment 当前无法把请求交给后端 Pod")).toBeInTheDocument();
  expect(screen.getByText("问题卡在 目标端口")).toBeInTheDocument();
  expect(screen.getByText("把 targetPort 改为 Pod 实际监听端口")).toBeInTheDocument();
  expect(screen.getByText("已确认问题")).toBeInTheDocument();
  expect(screen.getByText("未验证")).toBeInTheDocument();
});
