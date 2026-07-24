import {useState} from "react";
import {useParams} from "react-router-dom";
import {Accordion, AccordionDetails, AccordionSummary, Alert, Box, Card, CardContent, Stack, Tab, Tabs, Typography} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {Background, Controls, ReactFlow} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {api} from "../api";
import {ErrorState, LoadingState} from "../components/States";
import {Severity} from "../components/Severity";

export function IncidentDetailPage() {
  const {id = ""} = useParams();
  const query = useQuery({queryKey: ["incident", id], queryFn: () => api.incident(id)});
  const [tab, setTab] = useState(0);
  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  const incident = query.data!;
  const root = incident.hypotheses?.[0];
  return <Stack spacing={3}>
    <Stack direction="row" justifyContent="space-between" alignItems="start">
      <div><Typography variant="h4">{incident.title}</Typography><Typography color="text.secondary">{incident.summary}</Typography></div>
      <Severity value={incident.severity} />
    </Stack>
    <Card><CardContent><Stack spacing={2}>
      <section><Typography variant="overline">发生了什么</Typography><Typography variant="h6">{incident.title}</Typography></section>
      <section><Typography variant="overline">影响了什么</Typography><Typography>{incident.resourceState?.length ?? 0} 个已保存资源状态；Namespace：{incident.namespace || "集群级"}</Typography></section>
      <section><Typography variant="overline">最可能的根因</Typography><Typography>{root?.title ?? "证据不足，尚不能确定根因"}</Typography></section>
      {root?.missingEvidence?.length ? <Alert severity="warning">仍缺少 {root.missingEvidence.length} 项证据；不能把缺失数据解释为正常。</Alert> : null}
    </Stack></CardContent></Card>
    <Tabs value={tab} onChange={(_, value) => setTab(value)} aria-label="Incident 详情标签">
      {["概览","定位过程","证据","拓扑","时间线","修复建议"].map((label) => <Tab key={label} label={label} />)}
    </Tabs>
    {tab === 0 && <Typography>{root?.explanation ?? incident.summary}</Typography>}
    {tab === 1 && <Stack>{incident.diagnosisSteps?.map((step) => <Card key={step.id} variant="outlined"><CardContent><strong>{step.name}</strong> — {step.status}<Typography>{step.summary}</Typography></CardContent></Card>)}</Stack>}
    {tab === 2 && <Stack>{incident.evidence?.map((item) => <Accordion key={item.id}><AccordionSummary>{item.role.toUpperCase()} · {item.summary}</AccordionSummary><AccordionDetails><Typography>来源：{item.source} · 可信度：{Math.round(item.confidence * 100)}%</Typography><Typography>原始引用：{item.rawRef || "未保存"}</Typography></AccordionDetails></Accordion>)}</Stack>}
    {tab === 3 && <TopologyGraph topology={incident.topology} />}
    {tab === 4 && <Stack>{incident.timeline?.map((event) => <Typography key={event.id}>{new Date(event.at).toLocaleString()} — {event.summary}</Typography>)}</Stack>}
    {tab === 5 && <Stack><Typography variant="h6">安全修复建议</Typography>{(root?.remediation ?? ["当前证据不足，先补充缺失证据。"]).map((item) => <Alert key={item} severity="info">{item}</Alert>)}<Typography variant="h6">修复后验证</Typography>{root?.verification?.map((item) => <Typography key={item}>• {item}</Typography>)}</Stack>}
  </Stack>;
}

function TopologyGraph({topology}: {topology: import("../types").GraphSnapshot}) {
  const nodes = (topology?.nodes ?? []).map((node, index) => ({
    id: node.uid, position: {x: (index % 4) * 220, y: Math.floor(index / 4) * 130},
    data: {label: `${node.kind}\n${node.name}`}
  }));
  const edges = (topology?.edges ?? []).map((edge, index) => ({
    id: `${index}-${edge.from.uid}-${edge.to.uid}`, source: edge.from.uid, target: edge.to.uid, label: edge.relation
  }));
  return <Box sx={{height: 480, border: "1px solid", borderColor: "divider"}} aria-label="Incident 局部拓扑">
    <ReactFlow nodes={nodes} edges={edges} fitView><Background /><Controls /></ReactFlow>
  </Box>;
}

