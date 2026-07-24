import {useEffect, useState} from "react";
import {Alert, Button, Card, CardContent, MenuItem, Stack, TextField, Typography} from "@mui/material";
import {api, subscribeDiagnosis} from "../api";
import type {DiagnosisTask, ResourceRef} from "../types";

export function DiagnosePage() {
  const [kind, setKind] = useState("Pod");
  const [namespace, setNamespace] = useState("default");
  const [name, setName] = useState("");
  const [task, setTask] = useState<DiagnosisTask>();
  const [events, setEvents] = useState<{type: string; data: unknown}[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!task?.id) return;
    return subscribeDiagnosis(task.id, (type, data) => setEvents((current) => [...current, {type, data}]));
  }, [task?.id]);
  async function run() {
    setError(""); setEvents([]);
    try {
      const target: ResourceRef = {cluster: "demo", uid: "", kind, namespace, name};
      setTask(await api.diagnose(target));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }
  return <Stack spacing={3}>
    <div><Typography variant="h4">资源诊断</Typography><Typography color="text.secondary">诊断逻辑在 API Server 执行，页面只展示实时步骤与证据。</Typography></div>
    <Card><CardContent><Stack direction="row" gap={2} alignItems="center">
      <TextField select label="资源类型" value={kind} onChange={(e) => setKind(e.target.value)}>
        {["Deployment","Pod","Service","Node","PersistentVolumeClaim"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
      </TextField>
      <TextField label="Namespace" value={namespace} onChange={(e) => setNamespace(e.target.value)} disabled={kind === "Node"} />
      <TextField required label="名称" value={name} onChange={(e) => setName(e.target.value)} />
      <Button variant="contained" onClick={run} disabled={!name}>开始诊断</Button>
    </Stack></CardContent></Card>
    {error && <Alert severity="error">{error}</Alert>}
    {task && <Typography role="status">任务 {task.id} · {events.length ? "实时执行中" : "等待事件"}</Typography>}
    <Stack>{events.map((event, index) => <Card key={`${event.type}-${index}`} variant="outlined"><CardContent><strong>{event.type}</strong><Typography component="pre" sx={{whiteSpace: "pre-wrap"}}>{JSON.stringify(event.data, null, 2)}</Typography></CardContent></Card>)}</Stack>
  </Stack>;
}

