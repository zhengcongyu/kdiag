import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Card, CardContent,
  Button, Chip, Divider, Grid, Stack, Typography
} from "@mui/material";
import {
  CheckCircleOutline, ContentCopyOutlined, ErrorOutline, ExpandMore, HelpOutline, RouteOutlined,
  WarningAmberOutlined
} from "@mui/icons-material";
import type {
  CheckOutcome, DiagnosisReport, DiagnosisStep, DiagnosisTask, Evidence, TroubleshootingAction
} from "../types";
import {SmartTopology} from "./SmartTopology";
import {useLanguage} from "../i18n";

const outcomeMeta: Record<CheckOutcome, {label: string; color: "success" | "error" | "warning" | "default"; icon: React.ReactElement}> = {
  PASSED: {label: "正常", color: "success", icon: <CheckCircleOutline fontSize="small" />},
  FAILED: {label: "阻断", color: "error", icon: <ErrorOutline fontSize="small" />},
  SUSPECTED: {label: "疑似", color: "warning", icon: <WarningAmberOutlined fontSize="small" />},
  UNKNOWN: {label: "未验证", color: "default", icon: <HelpOutline fontSize="small" />},
  SKIPPED: {label: "未执行", color: "default", icon: <HelpOutline fontSize="small" />}
};

export function DiagnosisReportView({task, live = false}: {task: DiagnosisTask; live?: boolean}) {
  const {language} = useLanguage();
  const report = task.report;
  if (!report) {
    return <LiveProgress task={task} live={live} />;
  }
  const confirmedIssues = report.confirmedIssues ?? [];
  const suspectedIssues = report.suspectedIssues ?? [];
  const healthyChecks = report.healthyChecks ?? [];
  const unknownChecks = report.unknownChecks ?? [];
  const remediation = report.remediation ?? [];
  const verification = report.verification ?? [];
  const limitations = report.coverage?.limitations ?? [];
  const counts = [
    {label: language === "zh-CN" ? "已确认问题" : "Confirmed", value: confirmedIssues.length, color: "#c43228"},
    {label: language === "zh-CN" ? "疑似问题" : "Suspected", value: suspectedIssues.length, color: "#9a5b00"},
    {label: language === "zh-CN" ? "检查正常" : "Passed", value: healthyChecks.length, color: "#16833d"},
    {label: language === "zh-CN" ? "未验证" : "Not verified", value: unknownChecks.length, color: "#6e6e73"}
  ];
  return <Stack spacing={2.5}>
    <Card sx={{border: "1px solid", borderColor: verdictColor(report), background: verdictBackground(report)}}>
      <CardContent sx={{p: {xs: 2.5, md: 3.5}}}>
        <Stack direction="row" alignItems="center" gap={1} sx={{mb: 1}}>
          <Chip size="small" label={verdictLabel(report, language)} color={report.verdict === "CONFIRMED_ISSUE" ? "error" : "warning"} />
          {live ? <Chip size="small" variant="outlined" label="实时诊断" /> : null}
        </Stack>
        <Typography variant="h4" component="h1">{localHeadline(report, language)}</Typography>
        <Typography sx={{mt: 1, fontSize: 17}}>{localSummary(report, language)}</Typography>
        <Divider sx={{my: 2.2}} />
        <Grid container spacing={2}>
          <Grid size={{xs: 12, md: 4}}><Fact title={language === "zh-CN" ? "影响" : "Impact"} value={language === "zh-CN" ? report.impact : "The target resource or request path may be affected."} /></Grid>
          <Grid size={{xs: 12, md: 4}}><Fact title={language === "zh-CN" ? "定位" : "Location"} value={report.blockedAt ? (language === "zh-CN" ? `问题卡在 ${report.blockedAt}` : `Blocked at ${report.blockedAt}`) : (language === "zh-CN" ? "未发现明确阻断点" : "No confirmed blocking point")} /></Grid>
          <Grid size={{xs: 12, md: 4}}><Fact title={language === "zh-CN" ? "最可能根因" : "Most likely cause"} value={report.rootCause || (language === "zh-CN" ? "证据不足，暂不能确定" : "Insufficient evidence")} /></Grid>
        </Grid>
      </CardContent>
    </Card>
    <Grid container spacing={1.5}>{counts.map((item) =>
      <Grid size={{xs: 6, md: 3}} key={item.label}><Card variant="outlined"><CardContent>
        <Typography color="text.secondary">{item.label}</Typography>
        <Typography variant="h4" sx={{color: item.color, mt: .5}}>{item.value}</Typography>
      </CardContent></Card></Grid>)}
    </Grid>
    <Section title={language === "zh-CN" ? "排查链路" : "Diagnostic path"} subtitle={language === "zh-CN" ? `已完成 ${report.coverage.checked}/${report.coverage.total} 项可用检查` : `${report.coverage.checked}/${report.coverage.total} checks completed`}>
      <TroubleshootingChain steps={task.steps ?? []} />
    </Section>
    {confirmedIssues.length || suspectedIssues.length ? <Section title="诊断结论" subtitle="先看结论，需要时再展开技术证据">
      <Stack spacing={1}>{[...confirmedIssues, ...suspectedIssues].map((issue) =>
        <Alert key={issue.code} severity={issue.outcome === "FAILED" ? "error" : "warning"}>
          <Typography sx={{fontWeight: 700}}>{issue.title}</Typography>
          <Typography>{issue.summary}</Typography>
          {issue.problemAt ? <Typography sx={{mt: 1}}>
            <strong>问题位置：</strong>{issue.problemAt}
          </Typography> : null}
          {issue.possibleCauses?.length ? <Box sx={{mt: 1}}>
            <Typography sx={{fontWeight: 650}}>常见原因</Typography>
            {issue.possibleCauses.map((cause) => <Typography key={cause}>• {cause}</Typography>)}
          </Box> : null}
        </Alert>)}</Stack>
    </Section> : null}
    <Section title={language === "zh-CN" ? "推荐排错方法" : "Recommended troubleshooting"} subtitle={language === "zh-CN" ? "按顺序执行以下只读检查；每一步都说明正常结果和异常时的下一步。" : "Run these read-only checks in order. Each step explains the expected result and what to do when it is abnormal."}>
      <TroubleshootingGuide actions={report.troubleshooting ?? []} language={language} />
    </Section>
    <Section title="安全修复建议" subtitle="只提供建议与变更预览，不会自动修改集群">
      <Stack spacing={1}>{remediation.map((item, index) =>
        <Alert key={`${index}-${item}`} severity="info"><strong>{index + 1}.</strong> {item}</Alert>)}</Stack>
      <Typography variant="h6" sx={{mt: 2}}>修复后验证</Typography>
      <Stack spacing={.7} sx={{mt: 1}}>{verification.map((item) =>
        <Typography key={item}>• {item}</Typography>)}</Stack>
    </Section>
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMore />}><Typography sx={{fontWeight: 700}}>能力覆盖与限制</Typography></AccordionSummary>
      <AccordionDetails><Stack spacing={1}>
        <Typography>已使用：{(report.coverage?.capabilities ?? []).join("、") || "没有可用能力"}</Typography>
        {limitations.map((item) => <Alert key={item} severity="warning">{item}</Alert>)}
      </Stack></AccordionDetails>
    </Accordion>
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMore />}><Typography sx={{fontWeight: 700}}>技术证据与规则详情</Typography></AccordionSummary>
      <AccordionDetails><EvidenceList evidence={task.evidence ?? []} /></AccordionDetails>
    </Accordion>
    {report.topology?.nodes?.length ? <Section title="故障资源拓扑" subtitle="红色为故障，绿色为健康，灰色表示尚未确认">
      <SmartTopology topology={report.topology} height={440} />
    </Section> : null}
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMore />}><Typography sx={{fontWeight: 700}}>原始诊断数据（技术人员）</Typography></AccordionSummary>
      <AccordionDetails><Box component="pre" sx={{whiteSpace: "pre-wrap", fontSize: 12, bgcolor: "#f7f7f9", p: 2, borderRadius: 2}}>
        {JSON.stringify(task, null, 2)}
      </Box></AccordionDetails>
    </Accordion>
  </Stack>;
}

function TroubleshootingGuide({actions, language}: {actions: TroubleshootingAction[]; language: "zh-CN" | "en"}) {
  if (!actions.length) {
    return <Alert severity="warning">当前报告还没有可执行的排错步骤。请先补充“未验证”项所需证据，不要直接修改资源。</Alert>;
  }
  return <Stack spacing={1.5}>{actions.map((action, index) =>
    <Card variant="outlined" key={`${action.title}-${action.command ?? index}`} sx={{borderRadius: 2.5}}>
      <CardContent>
        <Stack direction={{xs: "column", md: "row"}} justifyContent="space-between" gap={1}>
          <Box>
            <Stack direction="row" gap={1} alignItems="center">
              <Typography variant="h6">{index + 1}. {localActionTitle(action.title, language)}</Typography>
              {action.readOnly ? <Chip size="small" color="success" variant="outlined" label={language === "zh-CN" ? "只读命令" : "Read-only"} /> : null}
            </Stack>
            <Typography color="text.secondary" sx={{mt: .5}}>{language === "zh-CN" ? action.purpose : "Collect structured Kubernetes evidence without changing the cluster."}</Typography>
          </Box>
          {action.command ? <Button
            size="small"
            variant="outlined"
            startIcon={<ContentCopyOutlined />}
            aria-label={`复制命令：${action.title}`}
            onClick={() => void navigator.clipboard.writeText(action.command ?? "")}
          >{language === "zh-CN" ? "复制命令" : "Copy command"}</Button> : null}
        </Stack>
        {action.command ? <Box component="pre" sx={{
          mt: 1.5, mb: 0, p: 1.5, borderRadius: 2, overflowX: "auto",
          bgcolor: "#f5f5f7", border: "1px solid", borderColor: "divider",
          fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word"
        }}>{action.command}</Box> : null}
        <Grid container spacing={1.5} sx={{mt: .5}}>
          <Grid size={{xs: 12, md: 6}}>
            <Alert severity="success" variant="outlined">
              <strong>{language === "zh-CN" ? "正常应看到：" : "Expected: "}</strong>{language === "zh-CN" ? action.expected : "The object exists and its structured status matches the desired state."}
            </Alert>
          </Grid>
          <Grid size={{xs: 12, md: 6}}>
            <Alert severity="warning" variant="outlined">
              <strong>{language === "zh-CN" ? "如果异常：" : "If abnormal: "}</strong>{language === "zh-CN" ? action.ifAbnormal : "Record Reason, Message and Conditions, then continue with the next check before changing resources."}
            </Alert>
          </Grid>
        </Grid>
        {action.requiresAccess ? <Typography variant="caption" color="text.secondary" sx={{display: "block", mt: 1}}>
          {language === "zh-CN" ? "权限要求：" : "Required access: "}{language === "zh-CN" ? action.requiresAccess : "read-only get/list access to the target resource"}
        </Typography> : null}
      </CardContent>
    </Card>)}
  </Stack>;
}

function LiveProgress({task, live}: {task: DiagnosisTask; live: boolean}) {
  return <Card variant="outlined"><CardContent>
    <Stack direction="row" gap={1} alignItems="center">
      <RouteOutlined color="primary" />
      <Box><Typography variant="h6">{task.status === "FAILED" ? "诊断未能完成" : "正在自动收集并分析证据"}</Typography>
        <Typography color="text.secondary">
          {task.error || (live ? "结果会在同一页面实时更新，不需要阅读原始 YAML。" : "正在恢复诊断结果…")}
        </Typography></Box>
    </Stack>
    <TroubleshootingChain steps={task.steps ?? []} />
  </CardContent></Card>;
}

function TroubleshootingChain({steps}: {steps: DiagnosisStep[]}) {
  if (!steps.length) return <Typography color="text.secondary" sx={{mt: 2}}>等待第一项检查开始…</Typography>;
  return <Stack spacing={1.1} sx={{mt: 1.5}}>{steps.map((step, index) => {
    const outcome = step.outcome ?? (step.status === "RUNNING" ? "UNKNOWN" : "UNKNOWN");
    const current = outcomeMeta[outcome];
    return <Stack key={step.id} direction="row" gap={1.3} alignItems="flex-start"
      sx={{p: 1.5, border: "1px solid", borderColor: outcome === "FAILED" ? "error.light" : "divider", borderRadius: 2.5}}>
      <Typography sx={{width: 24, height: 24, borderRadius: "50%", bgcolor: "#f2f2f7", textAlign: "center", lineHeight: "24px", fontWeight: 700}}>{index + 1}</Typography>
      <Box sx={{flex: 1}}><Typography sx={{fontWeight: 700}}>{step.name}</Typography>
        <Typography color="text.secondary">{step.summary || "正在检查…"}</Typography></Box>
      <Chip size="small" icon={current.icon} color={current.color} label={current.label} variant="outlined" />
    </Stack>;
  })}</Stack>;
}

function EvidenceList({evidence}: {evidence: Evidence[]}) {
  if (!evidence.length) return <Alert severity="warning">没有可用证据；这不能解释为资源正常。</Alert>;
  return <Stack spacing={1}>{evidence.map((item) =>
    <Card key={item.id} variant="outlined"><CardContent>
      <Stack direction="row" gap={1} alignItems="center">
        <Chip size="small" label={roleLabel(item.role)} />
        <Typography sx={{fontWeight: 650}}>{item.summary}</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{mt: 1}}>
        来源：{item.source} · 可信度：{Math.round(item.confidence * 100)}% · 原始引用：{item.rawRef || "未保存"}
      </Typography>
    </CardContent></Card>)}</Stack>;
}

function Section({title, subtitle, children}: {title: string; subtitle: string; children: React.ReactNode}) {
  return <Card variant="outlined"><CardContent sx={{p: {xs: 2, md: 2.6}}}>
    <Typography variant="h5">{title}</Typography><Typography color="text.secondary" sx={{mb: 2}}>{subtitle}</Typography>
    {children}
  </CardContent></Card>;
}

function Fact({title, value}: {title: string; value: string}) {
  return <Box><Typography variant="overline" color="text.secondary">{title}</Typography>
    <Typography sx={{fontWeight: 650}}>{value}</Typography></Box>;
}

function verdictLabel(report: DiagnosisReport, language: "zh-CN" | "en" = "zh-CN") {
  const labels = language === "zh-CN" ? {
    CONFIRMED_ISSUE: "已定位问题", SUSPECTED_ISSUE: "发现疑点",
    NO_ISSUE_FOUND: "已覆盖检查正常", INCONCLUSIVE: "仍需更多证据"
  } : {
    CONFIRMED_ISSUE: "Issue confirmed", SUSPECTED_ISSUE: "Issue suspected",
    NO_ISSUE_FOUND: "Covered checks passed", INCONCLUSIVE: "More evidence required"
  };
  return (labels as Record<string, string>)[report.verdict];
}

function localHeadline(report: DiagnosisReport, language: "zh-CN" | "en") {
  if (language === "zh-CN") return report.headline;
  if (report.blockedAt) return `Path blocked at ${report.blockedAt}`;
  return verdictLabel(report, language);
}

function localSummary(report: DiagnosisReport, language: "zh-CN" | "en") {
  if (language === "zh-CN") return report.summary;
  if (report.verdict === "CONFIRMED_ISSUE") {
    return "KDiag found structured evidence for a confirmed issue. Follow the read-only checks below before applying a change.";
  }
  if (report.verdict === "NO_ISSUE_FOUND") {
    return "No issue was found by the checks that could be completed. Unverified checks are still listed separately.";
  }
  return "The available evidence is not sufficient for a safe conclusion. Missing and unverified checks are listed below.";
}

function localActionTitle(title: string, language: "zh-CN" | "en") {
  if (language === "zh-CN") return title;
  const titles: Record<string, string> = {
    "确认资源当前状态": "Confirm the current resource state",
    "查看 Condition 与最近事件": "Inspect Conditions and recent Events",
    "核对容器等待与上次终止原因": "Check waiting and previous termination reasons",
    "查看最近应用日志": "Read recent application logs",
    "查看上一次崩溃日志": "Read logs from the previous crash",
    "按 UID 查看相关事件": "Find related Events by UID",
    "查看 Service selector": "Inspect the Service selector",
    "对比 Namespace 内 Pod 标签": "Compare Pod labels in the Namespace",
    "检查 EndpointSlice 和 Ready Endpoint": "Check EndpointSlices and Ready endpoints",
    "核对 Service port 与 targetPort": "Compare Service port and targetPort",
    "查看 Pod 声明的容器端口": "Inspect declared Pod container ports",
    "检查节点可分配资源": "Check allocatable node resources",
    "检查 StorageClass 与供应器": "Check the StorageClass and provisioner",
    "查看节点 Condition": "Inspect Node Conditions",
    "确认节点影响范围": "Assess the node impact scope",
    "列出 Namespace 网络策略": "List NetworkPolicies in the Namespace"
  };
  return titles[title] ?? "Collect additional structured evidence";
}
function verdictColor(report: DiagnosisReport) {
  return report.verdict === "CONFIRMED_ISSUE" ? "#efb5b0" : report.verdict === "NO_ISSUE_FOUND" ? "#b8dfc2" : "#ead6a8";
}
function verdictBackground(report: DiagnosisReport) {
  return report.verdict === "CONFIRMED_ISSUE" ? "#fffafa" : report.verdict === "NO_ISSUE_FOUND" ? "#f8fcf9" : "#fffdf7";
}
function roleLabel(role: Evidence["role"]) {
  return ({supporting: "支持问题", contradicting: "反证 / 正常", missing: "缺失", neutral: "事实"} as const)[role];
}
