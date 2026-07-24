import {useState} from "react";
import {Alert, Button, Stack, TextField, Typography} from "@mui/material";
import {api} from "../api";

export function ReplayPage() {
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
  return <Stack spacing={3}>
    <div><Typography variant="h4">历史回放</Typography><Typography color="text.secondary">基于故障时快照重新分析，不读取无限原始日志。</Typography></div>
    <TextField label="Incident ID" value={id} onChange={(e) => setId(e.target.value)} />
    <Button sx={{alignSelf: "start"}} variant="contained" onClick={replay} disabled={!id}>使用当前规则回放</Button>
    {message && <Alert severity="info">{message}</Alert>}
  </Stack>;
}

