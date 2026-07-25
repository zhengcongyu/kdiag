import {useState} from "react";
import {useParams} from "react-router-dom";
import {Accordion, AccordionDetails, AccordionSummary, Alert, Card, CardContent, Stack, Tab, Tabs, Typography} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {api} from "../api";
import {ErrorState, LoadingState} from "../components/States";
import {Severity} from "../components/Severity";
import {SmartTopology} from "../components/SmartTopology";
import {useLanguage} from "../i18n";

export function IncidentDetailPage() {
  const {l, localize} = useLanguage();
  const {id = ""} = useParams();
  const query = useQuery({queryKey: ["incident", id], queryFn: () => api.incident(id)});
  const [tab, setTab] = useState(0);
  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  const incident = query.data!;
  const root = incident.hypotheses?.[0];
  return <Stack spacing={3}>
    <Stack direction="row" justifyContent="space-between" alignItems="start">
      <div><Typography variant="h4">{localize(incident.title)}</Typography><Typography color="text.secondary">{localize(incident.summary)}</Typography></div>
      <Severity value={incident.severity} />
    </Stack>
    <Card><CardContent><Stack spacing={2}>
      <section><Typography variant="overline">{l("发生了什么", "What happened")}</Typography>
        <Typography variant="h6">{localize(incident.title)}</Typography></section>
      <section><Typography variant="overline">{l("影响了什么", "Impact")}</Typography><Typography>
        {incident.resourceState?.length ?? 0} {l("个已保存资源状态", "saved resource states")}; Namespace: {incident.namespace || l("集群级", "cluster-scoped")}</Typography></section>
      <section><Typography variant="overline">{l("最可能的根因", "Most likely root cause")}</Typography>
        <Typography>{localize(root?.title) || l("证据不足，尚不能确定根因", "Insufficient evidence to determine a root cause")}</Typography></section>
      {root?.missingEvidence?.length ? <Alert severity="warning">{l("仍缺少", "Still missing")} {root.missingEvidence.length}
        {" "}{l("项证据；不能把缺失数据解释为正常。", "evidence items; missing data cannot be interpreted as healthy.")}</Alert> : null}
    </Stack></CardContent></Card>
    <Tabs value={tab} onChange={(_, value) => setTab(value)} aria-label={l("Incident 详情标签", "Incident detail tabs")}>
      {[l("概览", "Overview"),l("定位过程", "Diagnostic path"),l("证据", "Evidence"),
        l("拓扑", "Topology"),l("时间线", "Timeline"),l("修复建议", "Remediation")].map((label) => <Tab key={label} label={label} />)}
    </Tabs>
    {tab === 0 && <Typography>{localize(root?.explanation ?? incident.summary)}</Typography>}
    {tab === 1 && <Stack>{incident.diagnosisSteps?.map((step) => <Card key={step.id} variant="outlined"><CardContent><strong>{localize(step.name)}</strong> — {step.status}<Typography>{localize(step.summary)}</Typography></CardContent></Card>)}</Stack>}
    {tab === 2 && <Stack>{incident.evidence?.map((item) => <Accordion key={item.id}><AccordionSummary>{item.role.toUpperCase()} · {localize(item.summary)}</AccordionSummary><AccordionDetails>
      <Typography>{l("来源", "Source")}: {item.source} · {l("可信度", "Confidence")}: {Math.round(item.confidence * 100)}%</Typography>
      <Typography>{l("原始引用", "Raw reference")}: {item.rawRef || l("未保存", "Not saved")}</Typography></AccordionDetails></Accordion>)}</Stack>}
    {tab === 3 && <><Alert severity="info" sx={{mb: 2}}>{l(
      "这是故障发生时保存的局部拓扑，不代表资源当前状态。",
      "This topology was saved at incident time and does not represent current resource state.")}</Alert><SmartTopology topology={incident.topology} /></>}
    {tab === 4 && <Stack>{incident.timeline?.map((event) => <Typography key={event.id}>
      {new Date(event.at).toLocaleString()} — {localize(event.summary)}</Typography>)}</Stack>}
    {tab === 5 && <Stack><Typography variant="h6">{l("安全修复建议", "Safe remediation")}</Typography>
      {(root?.remediation ?? [l("当前证据不足，先补充缺失证据。", "Evidence is insufficient; collect the missing evidence first.")])
        .map((item) => <Alert key={item} severity="info">{localize(item)}</Alert>)}
      <Typography variant="h6">{l("修复后验证", "Post-fix verification")}</Typography>
      {root?.verification?.map((item) => <Typography key={item}>• {localize(item)}</Typography>)}</Stack>}
  </Stack>;
}
