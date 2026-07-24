import {useEffect, useMemo, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {
  Alert, Button, Card, CardContent, Chip, MenuItem, Stack, TextField, Typography
} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {api, subscribeDiagnosis} from "../api";
import {DiagnosisReportView} from "../components/DiagnosisReportView";
import {NamespacePicker} from "../components/NamespacePicker";
import {ResourcePicker} from "../components/ResourcePicker";
import type {DiagnosisStep, DiagnosisTask, Evidence, Hypothesis, InventoryResource} from "../types";
import {useLanguage} from "../i18n";

const supportedKinds = ["Deployment", "Pod", "Service", "Node", "PersistentVolumeClaim"];

export function DiagnosePage() {
  const {language} = useLanguage();
  const l = (zh: string, en: string) => language === "zh-CN" ? zh : en;
  const {id = ""} = useParams();
  const navigate = useNavigate();
  const overview = useQuery({
    queryKey: ["cluster-overview"], queryFn: api.clusterOverview, refetchInterval: 15_000
  });
  const savedTask = useQuery({
    queryKey: ["diagnosis", id], queryFn: () => api.diagnosis(id), enabled: Boolean(id),
    refetchInterval: (query) => query.state.data?.report || query.state.data?.status === "FAILED" ? false : 1_000
  });
  const [kind, setKind] = useState("Pod");
  const [namespace, setNamespace] = useState("");
  const [resource, setResource] = useState<InventoryResource>();
  const [task, setTask] = useState<DiagnosisTask>();
  const [error, setError] = useState("");
  const availableKinds = useMemo(() => supportedKinds.filter(
    (candidate) => (overview.data?.facets.kinds[candidate] ?? 0) > 0
  ), [overview.data]);

  useEffect(() => {
    if (savedTask.data) setTask(savedTask.data);
  }, [savedTask.data]);
  useEffect(() => {
    if (kind !== "Node" && !namespace && overview.data?.facets.namespaces.length) {
      const namespaces = overview.data.facets.namespaces;
      setNamespace(namespaces.includes("default") ? "default" : namespaces[0]);
    }
  }, [kind, namespace, overview.data]);
  useEffect(() => {
    if (!id) return;
    return subscribeDiagnosis(id, (type, data) => {
      setTask((current) => reduceEvent(current, type, data));
      if (["diagnosis_completed", "diagnosis_failed", "task_cancelled"].includes(type)) {
        window.setTimeout(() => void savedTask.refetch(), 250);
      }
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    if (!resource) return;
    setError("");
    try {
      const created = await api.diagnose(resource.ref);
      setTask(created);
      navigate(`/diagnose/${encodeURIComponent(created.id)}`);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }
  function changeKind(nextKind: string) {
    setKind(nextKind);
    setResource(undefined);
    if (nextKind === "Node") setNamespace("");
  }

  return <Stack spacing={3} sx={{p: {xs: 2, md: 3.5}}}>
    <div><Typography variant="h4">{l("资源智能诊断", "Resource diagnosis")}</Typography>
      <Typography color="text.secondary">{l("KDiag 会自动读取实时状态、关联资源和事件，先给结论，再按需展示技术证据。", "KDiag reads live status, related resources and Events, then leads with a conclusion before technical evidence.")}</Typography></div>
    <Card><CardContent><Stack spacing={2.25}>
      <Typography variant="h6">{l("选择要诊断的资源", "Choose a resource")}</Typography>
      {overview.error ? <Alert severity="error">{l("集群资源目录不可用：", "Cluster inventory unavailable: ")}{(overview.error as Error).message}</Alert> : null}
      <TextField select fullWidth label={l("资源类型", "Resource kind")} value={kind} onChange={(event) => changeKind(event.target.value)}>
        {(availableKinds.length ? availableKinds : supportedKinds).map((value) =>
          <MenuItem key={value} value={value}>{value}</MenuItem>)}
      </TextField>
      <NamespacePicker value={namespace} disabled={kind === "Node"}
        onChange={(value) => { setNamespace(value); setResource(undefined); }} />
      <ResourcePicker kind={kind} namespace={kind === "Node" ? undefined : namespace}
        label={l("资源名称", "Resource")} value={resource?.ref.uid ?? ""} onChange={setResource} />
      {resource ? <Stack direction="row" gap={1} flexWrap="wrap">
        <Chip size="small" label={resource.stateText} color={resource.state === "healthy" ? "success" : "warning"} />
        <Chip size="small" label={resource.summary || "等待诊断"} variant="outlined" />
        {resource.node ? <Chip size="small" label={`节点 ${resource.node}`} /> : null}
      </Stack> : null}
      <Button variant="contained" onClick={run} disabled={!resource}>{l("开始自动诊断", "Start diagnosis")}</Button>
    </Stack></CardContent></Card>
    {error || savedTask.error ? <Alert severity="error">{error || (savedTask.error as Error).message}</Alert> : null}
    {task ? <DiagnosisReportView task={task} live={!task.report && task.status !== "FAILED"} /> :
      <Alert severity="info">{l("选择资源后，系统会自动总结“哪里有问题、哪里正常、哪里还缺证据”，不会要求你自行阅读 YAML。", "After you select a resource, KDiag summarizes what failed, what passed and which evidence is still missing.")}</Alert>}
  </Stack>;
}

function reduceEvent(current: DiagnosisTask | undefined, type: string, data: unknown): DiagnosisTask | undefined {
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
  if (type === "task_cancelled") return {...current, status: "CANCELLED"};
  return current;
}
