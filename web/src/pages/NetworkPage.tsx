import {useEffect, useMemo, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {
  Alert, Box, Button, Card, CardContent, Chip, MenuItem, Stack, TextField, Typography
} from "@mui/material";
import {ArrowForwardIos} from "@mui/icons-material";
import {useQuery} from "@tanstack/react-query";
import {api, subscribeDiagnosis} from "../api";
import {DiagnosisReportView} from "../components/DiagnosisReportView";
import {NamespacePicker} from "../components/NamespacePicker";
import {ResourcePicker} from "../components/ResourcePicker";
import type {DiagnosisStep, DiagnosisTask, Evidence, Hypothesis, InventoryResource} from "../types";
import {useLanguage} from "../i18n";

const pathLabelsZh = ["源工作负载", "DNS", "Service", "EndpointSlice", "NetworkPolicy", "目标 Pod", "目标端口", "TCP / HTTP"];
const pathLabelsEn = ["Source workload", "DNS", "Service", "EndpointSlice", "NetworkPolicy", "Target Pod", "Target port", "TCP / HTTP"];

export function NetworkPage() {
  const {language} = useLanguage();
  const l = (zh: string, en: string) => language === "zh-CN" ? zh : en;
  const pathLabels = language === "zh-CN" ? pathLabelsZh : pathLabelsEn;
  const {id = ""} = useParams();
  const navigate = useNavigate();
  const overview = useQuery({
    queryKey: ["cluster-overview"], queryFn: api.clusterOverview, refetchInterval: 15_000
  });
  const savedTask = useQuery({
    queryKey: ["diagnosis", id], queryFn: () => api.diagnosis(id), enabled: Boolean(id),
    refetchInterval: (query) => query.state.data?.report || query.state.data?.status === "FAILED" ? false : 1_000
  });
  const [namespace, setNamespace] = useState("");
  const [sourceKind, setSourceKind] = useState("Pod");
  const [source, setSource] = useState<InventoryResource>();
  const [service, setService] = useState<InventoryResource>();
  const [port, setPort] = useState("");
  const [protocol, setProtocol] = useState("TCP");
  const [task, setTask] = useState<DiagnosisTask>();
  const [error, setError] = useState("");
  const servicePorts = useMemo(() => readServicePorts(service), [service]);

  useEffect(() => {
    if (!namespace && overview.data?.facets.namespaces.length) {
      const namespaces = overview.data.facets.namespaces;
      setNamespace(namespaces.includes("default") ? "default" : namespaces[0]);
    }
  }, [namespace, overview.data]);
  useEffect(() => setPort(servicePorts.length ? String(servicePorts[0].port) : ""), [service?.ref.uid, servicePorts]);
  useEffect(() => {
    if (savedTask.data) setTask(savedTask.data);
  }, [savedTask.data]);
  useEffect(() => {
    if (!id) return;
    return subscribeDiagnosis(id, (type, data) => {
      setTask((current) => reduceNetworkEvent(current, type, data));
      if (["diagnosis_completed", "diagnosis_failed", "task_cancelled"].includes(type)) {
        window.setTimeout(() => void savedTask.refetch(), 250);
      }
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    if (!source || !service || !port) return;
    setError("");
    try {
      const created = await api.networkDiagnose({
        cluster: overview.data?.connection.name ?? source.ref.cluster,
        namespace, source: `${source.ref.kind}/${source.ref.name}`,
        service: service.ref.name, port: Number(port), protocol, activeProbe: false
      });
      setTask(created);
      navigate(`/network/${encodeURIComponent(created.id)}`);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  return <Stack spacing={3} sx={{p: {xs: 2, md: 3.5}}}>
    <div><Typography variant="h4">{l("网络路径诊断", "Network path diagnosis")}</Typography>
      <Typography color="text.secondary">{l("逐层检查请求从哪里出发、经过什么、最终卡在哪里。", "Check every hop to see where a request starts, what it crosses and where it is blocked.")}</Typography></div>
    <Alert severity="info">{l("主动探测默认关闭。没有实际流量与 CNI 证据时，静态检查通过也只会显示“实际连通性未验证”。", "Active probes are off by default. Static checks cannot prove real connectivity without traffic or CNI evidence.")}</Alert>
    <Box sx={{display: "flex", gap: .7, alignItems: "center", overflowX: "auto", pb: .5}} aria-label="网络诊断路径">
      {pathLabels.map((label, index) => <Box key={label} sx={{display: "flex", alignItems: "center", gap: .7}}>
        <Chip size="small" label={label} variant={task?.report?.blockedAt && label.includes(task.report.blockedAt) ? "filled" : "outlined"}
          color={task?.report?.blockedAt && label.includes(task.report.blockedAt) ? "error" : "default"} />
        {index < pathLabels.length - 1 ? <ArrowForwardIos sx={{fontSize: 12, color: "text.disabled"}} /> : null}
      </Box>)}
    </Box>
    <Card><CardContent><Stack spacing={2}>
      <Typography variant="h6">{l("选择请求路径", "Choose a request path")}</Typography>
      <NamespacePicker value={namespace} onChange={(value) => {
        setNamespace(value); setSource(undefined); setService(undefined); setPort("");
      }} />
      <TextField select fullWidth label={l("源资源类型", "Source kind")} value={sourceKind}
        onChange={(event) => { setSourceKind(event.target.value); setSource(undefined); }}>
        <MenuItem value="Pod">Pod</MenuItem><MenuItem value="Deployment">Deployment</MenuItem>
      </TextField>
      <ResourcePicker kind={sourceKind} namespace={namespace} label={l("源工作负载", "Source workload")}
        value={source?.ref.uid ?? ""} onChange={setSource} />
      <ResourcePicker kind="Service" namespace={namespace} label={l("目标 Service", "Target Service")}
        value={service?.ref.uid ?? ""} onChange={setService} />
      <TextField select fullWidth label={l("目标端口", "Target port")} value={port} disabled={!service || !servicePorts.length}
        helperText={servicePorts.length ? l("来自 Service spec.ports", "Read from Service spec.ports") : l("该 Service 没有声明端口", "This Service declares no ports")}
        onChange={(event) => setPort(event.target.value)}>
        {servicePorts.map((item) => <MenuItem key={`${item.name}-${item.port}`} value={String(item.port)}>
          {item.name || "未命名"} · {item.port} → {String(item.targetPort)}
        </MenuItem>)}
      </TextField>
      <TextField select fullWidth label={l("协议", "Protocol")} value={protocol} onChange={(event) => setProtocol(event.target.value)}>
        <MenuItem value="TCP">TCP</MenuItem><MenuItem value="HTTP">HTTP</MenuItem>
      </TextField>
      <Button variant="contained" onClick={run} disabled={!source || !service || !port}>{l("开始路径诊断", "Start path diagnosis")}</Button>
    </Stack></CardContent></Card>
    {error || savedTask.error ? <Alert severity="error">{error || (savedTask.error as Error).message}</Alert> : null}
    {task ? <DiagnosisReportView task={task} live={!task.report && task.status !== "FAILED"} /> :
      <Alert severity="info">{l("选择路径后，KDiag 会明确列出已通过、被阻断和未验证的每一层。", "KDiag lists every passed, blocked and unverified hop.")}</Alert>}
  </Stack>;
}

function readServicePorts(service?: InventoryResource) {
  const ports = Array.isArray(service?.spec?.ports) ? service.spec.ports : [];
  return ports.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const port = Number(item.port);
    if (!Number.isFinite(port)) return [];
    return [{name: stringValue(item.name), port, targetPort: item.targetPort ?? port}];
  });
}
function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}
function reduceNetworkEvent(current: DiagnosisTask | undefined, type: string, data: unknown): DiagnosisTask | undefined {
  if (type === "task_started" || type === "diagnosis_completed") return data as DiagnosisTask;
  if (!current) return current;
  if (type === "step_started" || type === "step_completed") {
    const step = data as DiagnosisStep;
    const exists = current.steps?.some((item) => item.id === step.id);
    return {...current, status: "RUNNING", steps: exists
      ? current.steps.map((item) => item.id === step.id ? step : item)
      : [...(current.steps ?? []), step]};
  }
  if (type === "evidence_added") {
    const item = data as Evidence;
    return {...current, evidence: [...(current.evidence ?? []).filter((value) => value.id !== item.id), item]};
  }
  if (type === "hypothesis_updated") {
    const item = data as Hypothesis;
    return {...current, hypotheses: [...(current.hypotheses ?? []).filter((value) => value.id !== item.id), item]};
  }
  if (type === "diagnosis_failed") return {...current, status: "FAILED", error: String(data)};
  return current;
}
