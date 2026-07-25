import {useState} from "react";
import {Alert, Button, MenuItem, Stack, TextField, Typography} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {api} from "../api";
import {EmptyState, ErrorState, LoadingState} from "../components/States";
import {useLanguage} from "../i18n";

export function ReplayPage() {
  const {l, localize} = useLanguage();
  const incidents = useQuery({queryKey: ["incidents"], queryFn: api.incidents, refetchInterval: 15_000});
  const [id, setId] = useState("");
  const [message, setMessage] = useState("");
  async function replay() {
    try {
      const task = await api.replay(id);
      setMessage(l(`已使用当前规则创建回放任务 ${task.id}。请比较原规则版本和当前结果。`,
        `Replay task ${task.id} was created with the current rules. Compare it with the original result.`));
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (incidents.isLoading) return <LoadingState />;
  if (incidents.error) return <ErrorState error={incidents.error} />;
  const items = incidents.data?.items ?? [];
  return <Stack spacing={3} sx={{p: {xs: 2, md: 3.5}}}>
    <div><Typography variant="h4">{l("历史回放", "Historical Replay")}</Typography>
      <Typography color="text.secondary">{l("Incident 从系统实时读取，不需要手工复制 ID。",
        "Incidents are loaded from the system; you do not need to copy IDs manually.")}</Typography></div>
    {items.length === 0 ? <EmptyState title={l("没有可回放的 Incident", "No Incidents available for replay")}
      detail={l("创建 Incident 后即可从这里选择历史快照.", "Historical snapshots will appear here after an Incident is created.")} /> :
      <>
        <TextField select label="Incident" value={id} onChange={(event) => setId(event.target.value)}
          helperText={l(`实时读取，共 ${items.length} 条`, `${items.length} live records`)}>
          {items.map((incident) => <MenuItem key={incident.id} value={incident.id}>
            {incident.severity} · {localize(incident.title)} · {incident.namespace || l("集群级", "Cluster-scoped")}
          </MenuItem>)}
        </TextField>
        <Button sx={{alignSelf: "start"}} variant="contained" onClick={replay} disabled={!id}>
          {l("使用当前规则回放", "Replay with current rules")}
        </Button>
      </>}
    {message ? <Alert severity="info">{message}</Alert> : null}
  </Stack>;
}
