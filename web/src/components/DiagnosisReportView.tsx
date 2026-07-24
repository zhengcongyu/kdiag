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
  PASSED: {label: "??", color: "success", icon: <CheckCircleOutline fontSize="small" />},
  FAILED: {label: "??", color: "error", icon: <ErrorOutline fontSize="small" />},
  SUSPECTED: {label: "??", color: "warning", icon: <WarningAmberOutlined fontSize="small" />},
  UNKNOWN: {label: "???", color: "default", icon: <HelpOutline fontSize="small" />},
  SKIPPED: {label: "???", color: "default", icon: <HelpOutline fontSize="small" />}
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
    {label: language === "zh-CN" ? "?????" : "Confirmed", value: confirmedIssues.length, color: "#c43228"},
    {label: language === "zh-CN" ? "????" : "Suspected", value: suspectedIssues.length, color: "#9a5b00"},
    {label: language === "zh-CN" ? "????" : "Passed", value: healthyChecks.length, color: "#16833d"},
    {label: language === "zh-CN" ? "???" : "Not verified", value: unknownChecks.length, color: "#6e6e73"}
  ];
  return <Stack spacing={2.5}>
    <Card sx={{border: "1px solid", borderColor: verdictColor(report), background: verdictBackground(report)}}>
      <CardContent sx={{p: {xs: 2.5, md: 3.5}}}>
        <Stack direction="row" alignItems="center" gap={1} sx={{mb: 1}}>
          <Chip size="small" label={verdictLabel(report, language)} color={report.verdict === "CONFIRMED_ISSUE" ? "error" : "warning"} />
          {live ? <Chip size="small" variant="outlined" label="????" /> : null}
        </Stack>
        <Typography variant="h4" component="h1">{localHeadline(report, language)}</Typography>
        <Typography sx={{mt: 1, fontSize: 17}}>{localSummary(report, language)}</Typography>
        <Divider sx={{my: 2.2}} />
        <Grid container spacing={2}>
          <Grid size={{xs: 12, md: 4}}><Fact title={language === "zh-CN" ? "??" : "Impact"} value={language === "zh-CN" ? report.impact : "The target resource or request path may be affected."} /></Grid>
          <Grid size={{xs: 12, md: 4}}><Fact title={language === "zh-CN" ? "??" : "Location"} value={report.blockedAt ? (language === "zh-CN" ? `???? ${report.blockedAt}` : `Blocked at ${report.blockedAt}`) : (language === "zh-CN" ? "????????" : "No confirmed blocking point")} /></Grid>
          <Grid size={{xs: 12, md: 4}}><Fact title={language === "zh-CN" ? "?????" : "Most likely cause"} value={report.rootCause || (language === "zh-CN" ? "??????????" : "Insufficient evidence")} /></Grid>
        </Grid>
      </CardContent>
    </Card>
    <Grid container spacing={1.5}>{counts.map((item) =>
      <Grid size={{xs: 6, md: 3}} key={item.label}><Card variant="outlined"><CardContent>
        <Typography color="text.secondary">{item.label}</Typography>
        <Typography variant="h4" sx={{color: item.color, mt: .5}}>{item.value}</Typography>
      </CardContent></Card></Grid>)}
    </Grid>
    <Section title={language === "zh-CN" ? "????" : "Diagnostic path"} subtitle={language === "zh-CN" ? `??? ${report.coverage.checked}/${report.coverage.total} ?????` : `${report.coverage.checked}/${report.coverage.total} checks completed`}>
      <TroubleshootingChain steps={task.steps ?? []} />
    </Section>
    {confirmedIssues.length || suspectedIssues.length ? <Section title="????" subtitle="???????????????">
      <Stack spacing={1}>{[...confirmedIssues, ...suspectedIssues].map((issue) =>
        <Alert key={issue.code} severity={issue.outcome === "FAILED" ? "error" : "warning"}>
          <Typography sx={{fontWeight: 700}}>{issue.title}</Typography>
          <Typography>{issue.summary}</Typography>
          {issue.problemAt ? <Typography sx={{mt: 1}}>
            <strong>?????</strong>{issue.problemAt}
          </Typography> : null}
          {issue.possibleCauses?.length ? <Box sx={{mt: 1}}>
            <Typography sx={{fontWeight: 650}}>????</Typography>
            {issue.possibleCauses.map((cause) => <Typography key={cause}>? {cause}</Typography>)}
          </Box> : null}
        </Alert>)}</Stack>
    </Section> : null}
    <Section title={language === "zh-CN" ? "??????" : "Recommended troubleshooting"} subtitle={language === "zh-CN" ? "???????????????????????????????" : "Run these read-only checks in order. Each step explains the expected result and what to do when it is abnormal."}>
      <TroubleshootingGuide actions={report.troubleshooting ?? []} language={language} />
    </Section>
    <Section title="??????" subtitle="???????????????????">
      <Stack spacing={1}>{remediation.map((item, index) =>
        <Alert key={`${index}-${item}`} severity="info"><strong>{index + 1}.</strong> {item}</Alert>)}</Stack>
      <Typography variant="h6" sx={{mt: 2}}>?????</Typography>
      <Stack spacing={.7} sx={{mt: 1}}>{verification.map((item) =>
        <Typography key={item}>? {item}</Typography>)}</Stack>
    </Section>
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMore />}><Typography sx={{fontWeight: 700}}>???????</Typography></AccordionSummary>
      <AccordionDetails><Stack spacing={1}>
        <Typography>????{(report.coverage?.capabilities ?? []).join("?") || "??????"}</Typography>
        {limitations.map((item) => <Alert key={item} severity="warning">{item}</Alert>)}
      </Stack></AccordionDetails>
    </Accordion>
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMore />}><Typography sx={{fontWeight: 700}}>?????????</Typography></AccordionSummary>
      <AccordionDetails><EvidenceList evidence={task.evidence ?? []} /></AccordionDetails>
    </Accordion>
    {report.topology?.nodes?.length ? <Section title="??????" subtitle="????????????????????">
      <SmartTopology topology={report.topology} height={440} />
    </Section> : null}
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMore />}><Typography sx={{fontWeight: 700}}>????????????</Typography></AccordionSummary>
      <AccordionDetails><Box component="pre" sx={{whiteSpace: "pre-wrap", fontSize: 12, bgcolor: "#f7f7f9", p: 2, borderRadius: 2}}>
        {JSON.stringify(task, null, 2)}
      </Box></AccordionDetails>
    </Accordion>
  </Stack>;
}

function TroubleshootingGuide({actions, language}: {actions: TroubleshootingAction[]; language: "zh-CN" | "en"}) {
  if (!actions.length) {
    return <Alert severity="warning">????????????????????????????????????????</Alert>;
  }
  return <Stack spacing={1.5}>{actions.map((action, index) =>
    <Card variant="outlined" key={`${action.title}-${action.command ?? index}`} sx={{borderRadius: 2.5}}>
      <CardContent>
        <Stack direction={{xs: "column", md: "row"}} justifyContent="space-between" gap={1}>
          <Box>
            <Stack direction="row" gap={1} alignItems="center">
              <Typography variant="h6">{index + 1}. {localActionTitle(action.title, language)}</Typography>
              {action.readOnly ? <Chip size="small" color="success" variant="outlined" label={language === "zh-CN" ? "????" : "Read-only"} /> : null}
            </Stack>
            <Typography color="text.secondary" sx={{mt: .5}}>{language === "zh-CN" ? action.purpose : "Collect structured Kubernetes evidence without changing the cluster."}</Typography>
          </Box>
          {action.command ? <Button
            size="small"
            variant="outlined"
            startIcon={<ContentCopyOutlined />}
            aria-label={`?????${action.title}`}
            onClick={() => void navigator.clipboard.writeText(action.command ?? "")}
          >{language === "zh-CN" ? "????" : "Copy command"}</Button> : null}
        </Stack>
        {action.command ? <Box component="pre" sx={{
          mt: 1.5, mb: 0, p: 1.5, borderRadius: 2, overflowX: "auto",
          bgcolor: "#f5f5f7", border: "1px solid", borderColor: "divider",
          fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word"
        }}>{action.command}</Box> : null}
        <Grid container spacing={1.5} sx={{mt: .5}}>
          <Grid size={{xs: 12, md: 6}}>
            <Alert severity="success" variant="outlined">
              <strong>{language === "zh-CN" ? "??????" : "Expected: "}</strong>{language === "zh-CN" ? action.expected : "The object exists and its structured status matches the desired state."}
            </Alert>
          </Grid>
          <Grid size={{xs: 12, md: 6}}>
            <Alert severity="warning" variant="outlined">
              <strong>{language === "zh-CN" ? "?????" : "If abnormal: "}</strong>{language === "zh-CN" ? action.ifAbnormal : "Record Reason, Message and Conditions, then continue with the next check before changing resources."}
            </Alert>
          </Grid>
        </Grid>
        {action.requiresAccess ? <Typography variant="caption" color="text.secondary" sx={{display: "block", mt: 1}}>
          {language === "zh-CN" ? "?????" : "Required access: "}{language === "zh-CN" ? action.requiresAccess : "read-only get/list access to the target resource"}
        </Typography> : null}
      </CardContent>
    </Card>)}
  </Stack>;
}

function LiveProgress({task, live}: {task: DiagnosisTask; live: boolean}) {
  return <Card variant="outlined"><CardContent>
    <Stack direction="row" gap={1} alignItems="center">
      <RouteOutlined color="primary" />
      <Box><Typography variant="h6">{task.status === "FAILED" ? "??????" : "???????????"}</Typography>
        <Typography color="text.secondary">
          {task.error || (live ? "???????????????????? YAML?" : "?????????")}
        </Typography></Box>
    </Stack>
    <TroubleshootingChain steps={task.steps ?? []} />
  </CardContent></Card>;
}

function TroubleshootingChain({steps}: {steps: DiagnosisStep[]}) {
  if (!steps.length) return <Typography color="text.secondary" sx={{mt: 2}}>??????????</Typography>;
  return <Stack spacing={1.1} sx={{mt: 1.5}}>{steps.map((step, index) => {
    const outcome = step.outcome ?? (step.status === "RUNNING" ? "UNKNOWN" : "UNKNOWN");
    const current = outcomeMeta[outcome];
    return <Stack key={step.id} direction="row" gap={1.3} alignItems="flex-start"
      sx={{p: 1.5, border: "1px solid", borderColor: outcome === "FAILED" ? "error.light" : "divider", borderRadius: 2.5}}>
      <Typography sx={{width: 24, height: 24, borderRadius: "50%", bgcolor: "#f2f2f7", textAlign: "center", lineHeight: "24px", fontWeight: 700}}>{index + 1}</Typography>
      <Box sx={{flex: 1}}><Typography sx={{fontWeight: 700}}>{step.name}</Typography>
        <Typography color="text.secondary">{step.summary || "?????"}</Typography></Box>
      <Chip size="small" icon={current.icon} color={current.color} label={current.label} variant="outlined" />
    </Stack>;
  })}</Stack>;
}

function EvidenceList({evidence}: {evidence: Evidence[]}) {
  if (!evidence.length) return <Alert severity="warning">??????????????????</Alert>;
  return <Stack spacing={1}>{evidence.map((item) =>
    <Card key={item.id} variant="outlined"><CardContent>
      <Stack direction="row" gap={1} alignItems="center">
        <Chip size="small" label={roleLabel(item.role)} />
        <Typography sx={{fontWeight: 650}}>{item.summary}</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{mt: 1}}>
        ???{item.source} ? ????{Math.round(item.confidence * 100)}% ? ?????{item.rawRef || "???"}
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
    CONFIRMED_ISSUE: "?????", SUSPECTED_ISSUE: "????",
    NO_ISSUE_FOUND: "???????", INCONCLUSIVE: "??????"
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
    "????????": "Confirm the current resource state",
    "?? Condition ?????": "Inspect Conditions and recent Events",
    "?????????????": "Check waiting and previous termination reasons",
    "????????": "Read recent application logs",
    "?????????": "Read logs from the previous crash",
    "? UID ??????": "Find related Events by UID",
    "?? Service selector": "Inspect the Service selector",
    "?? Namespace ? Pod ??": "Compare Pod labels in the Namespace",
    "?? EndpointSlice ? Ready Endpoint": "Check EndpointSlices and Ready endpoints",
    "?? Service port ? targetPort": "Compare Service port and targetPort",
    "?? Pod ???????": "Inspect declared Pod container ports",
    "?????????": "Check allocatable node resources",
    "?? StorageClass ????": "Check the StorageClass and provisioner",
    "???? Condition": "Inspect Node Conditions",
    "????????": "Assess the node impact scope",
    "?? Namespace ????": "List NetworkPolicies in the Namespace"
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
  return ({supporting: "????", contradicting: "?? / ??", missing: "??", neutral: "??"} as const)[role];
}
