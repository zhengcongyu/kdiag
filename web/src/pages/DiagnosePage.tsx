import {useEffect, useMemo, useState} from "react";
import {
  Alert, Button, Card, CardContent, Chip, MenuItem, Stack, TextField, Typography
} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {api, subscribeDiagnosis} from "../api";
import {NamespacePicker} from "../components/NamespacePicker";
import {ResourcePicker} from "../components/ResourcePicker";
import type {DiagnosisTask, InventoryResource} from "../types";

const supportedKinds = ["Deployment", "Pod", "Service", "Node", "PersistentVolumeClaim"];

export function DiagnosePage() {
  const overview = useQuery({
    queryKey: ["cluster-overview"],
    queryFn: api.clusterOverview,
    refetchInterval: 15_000
  });
  const [kind, setKind] = useState("Pod");
  const [namespace, setNamespace] = useState("");
  const [resource, setResource] = useState<InventoryResource>();
  const [task, setTask] = useState<DiagnosisTask>();
  const [events, setEvents] = useState<{type: string; data: unknown}[]>([]);
  const [error, setError] = useState("");

  const availableKinds = useMemo(() => supportedKinds.filter(
    (candidate) => (overview.data?.facets.kinds[candidate] ?? 0) > 0
  ), [overview.data]);

  useEffect(() => {
    if (kind !== "Node" && !namespace && overview.data?.facets.namespaces.length) {
      const namespaces = overview.data.facets.namespaces;
      setNamespace(namespaces.includes("default") ? "default" : namespaces[0]);
    }
  }, [kind, namespace, overview.data]);

  useEffect(() => {
    if (!task?.id) return;
    return subscribeDiagnosis(task.id, (type, data) => setEvents((current) => [...current, {type, data}]));
  }, [task?.id]);

  async function run() {
    if (!resource) return;
    setError("");
    setEvents([]);
    try {
      setTask(await api.diagnose(resource.ref));
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
    <div>
      <Typography variant="h4">资源诊断</Typography>
      <Typography color="text.secondary">资源来自 Kubernetes Informer 缓存，每 15 秒刷新；无需手工输入名称。</Typography>
    </div>
    <Card><CardContent>
      <Stack spacing={2.25}>
        {overview.error ? <Alert severity="error">集群资源目录不可用：{(overview.error as Error).message}</Alert> : null}
        <TextField select fullWidth label="资源类型" value={kind}
          onChange={(event) => changeKind(event.target.value)}>
          {(availableKinds.length ? availableKinds : supportedKinds).map((value) =>
            <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField>
        <NamespacePicker value={namespace} disabled={kind === "Node"}
          onChange={(value) => { setNamespace(value); setResource(undefined); }} />
        <ResourcePicker kind={kind} namespace={kind === "Node" ? undefined : namespace}
          label="资源名称" value={resource?.ref.uid ?? ""} onChange={setResource} />
        {resource ? <Stack direction="row" gap={1} flexWrap="wrap">
          <Chip size="small" label={`UID ${resource.ref.uid}`} />
          <Chip size="small" label={resource.stateText} color={resource.state === "healthy" ? "success" : "warning"} />
          {resource.node ? <Chip size="small" label={`节点 ${resource.node}`} /> : null}
        </Stack> : null}
        <Button variant="contained" onClick={run} disabled={!resource}>开始诊断</Button>
      </Stack>
    </CardContent></Card>
    {error ? <Alert severity="error">{error}</Alert> : null}
    {task ? <Typography role="status">任务 {task.id} · {events.length ? "实时执行中" : "等待事件"}</Typography> : null}
    <Stack spacing={1.5}>{events.map((event, index) =>
      <Card key={`${event.type}-${index}`} variant="outlined"><CardContent>
        <strong>{event.type}</strong>
        <Typography component="pre" sx={{whiteSpace: "pre-wrap"}}>{JSON.stringify(event.data, null, 2)}</Typography>
      </CardContent></Card>)}
    </Stack>
  </Stack>;
}
