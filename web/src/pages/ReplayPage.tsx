import {useState} from "react";
import {Alert, Button, MenuItem, Stack, TextField, Typography} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {api} from "../api";
import {EmptyState, ErrorState, LoadingState} from "../components/States";

export function ReplayPage() {
  const incidents = useQuery({queryKey: ["incidents"], queryFn: api.incidents, refetchInterval: 15_000});
  const [id, setId] = useState("");
  const [message, setMessage] = useState("");
  async function replay() {
    try {
      const task = await api.replay(id);
      setMessage(`已使用当前规则创建回放任务 ${task.id}。请比较原规则版本和当前结果。`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (incidents.isLoading) return <LoadingState />;
  if (incidents.error) return <ErrorState error={incidents.error} />;
  const items = incidents.data?.items ?? [];
  return <Stack spacing={3} sx={{p: {xs: 2, md: 3.5}}}>
    <div><Typography variant="h4">历史回放</Typography>
      <Typography color="text.secondary">Incident 从系统实时读取，不需要手工复制 ID。</Typography></div>
    {items.length === 0 ? <EmptyState title="没有可回放的 Incident" detail="创建 Incident 后即可从这里选择历史快照。" /> :
      <>
        <TextField select label="Incident" value={id} onChange={(event) => setId(event.target.value)}
          helperText={`实时读取，共 ${items.length} 条`}>
          {items.map((incident) => <MenuItem key={incident.id} value={incident.id}>
            {incident.severity} · {incident.title} · {incident.namespace || "集群级"}
          </MenuItem>)}
        </TextField>
        <Button sx={{alignSelf: "start"}} variant="contained" onClick={replay} disabled={!id}>
          使用当前规则回放
        </Button>
      </>}
    {message ? <Alert severity="info">{message}</Alert> : null}
  </Stack>;
}
