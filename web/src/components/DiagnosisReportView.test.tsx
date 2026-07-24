import {cleanup, render, screen} from "@testing-library/react";
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
        problemAt: "Service/payment → targetPort → Pod containerPort",
        possibleCauses: ["targetPort 数值错误", "命名端口不存在"],
        confidence: .9, evidence: ["network/target-port"]
      }],
      suspectedIssues: [], healthyChecks: [], unknownChecks: [],
      affectedResources: [], coverage: {
        checked: 1, total: 1, capabilities: ["结构化 Service 与 Pod 端口"], limitations: ["主动探测默认关闭"]
      },
      troubleshooting: [{
        title: "核对 Service port 与 targetPort",
        purpose: "确认客户端访问端口和后端转发端口。",
        command: "kubectl get service 'payment' -n 'production' -o yaml",
        expected: "targetPort 与 Pod 实际监听端口一致。",
        ifAbnormal: "对比 Pod containerPort，修正 Manifest 后重新诊断。",
        readOnly: true
      }],
      remediation: ["把 targetPort 改为 Pod 实际监听端口"], verification: ["重新验证 Service 请求"],
      topology: {nodes: [], edges: []}, generatedAt: new Date().toISOString()
    }
  };
  render(<DiagnosisReportView task={task} />);
  expect(screen.getByRole("heading", {name: "网络路径卡在“目标端口”"})).toBeInTheDocument();
  expect(screen.getByText("payment 当前无法把请求交给后端 Pod")).toBeInTheDocument();
  expect(screen.getByText("问题卡在 目标端口")).toBeInTheDocument();
  expect(screen.getByText("把 targetPort 改为 Pod 实际监听端口")).toBeInTheDocument();
  expect(screen.getByText("Service/payment → targetPort → Pod containerPort")).toBeInTheDocument();
  expect(screen.getByRole("heading", {name: "推荐排错方法"})).toBeInTheDocument();
  expect(screen.getByText("kubectl get service 'payment' -n 'production' -o yaml")).toBeInTheDocument();
  expect(screen.getByText(/正常应看到/)).toBeInTheDocument();
  expect(screen.getByText(/如果异常/)).toBeInTheDocument();
  expect(screen.getByText("已确认问题")).toBeInTheDocument();
  expect(screen.getByText("未验证")).toBeInTheDocument();

  cleanup();
  task.report!.suspectedIssues = null as never;
  task.report!.unknownChecks = null as never;
  render(<DiagnosisReportView task={task} />);
  expect(screen.getByRole("heading", {name: "网络路径卡在“目标端口”"})).toBeInTheDocument();
});
