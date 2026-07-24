import {useState} from "react";
import {Alert, Button, Card, CardContent, MenuItem, Stack, Step, StepLabel, Stepper, TextField, Typography} from "@mui/material";
import {api} from "../api";

export function NetworkPage() {
  const [source, setSource] = useState("");
  const [service, setService] = useState("");
  const [port, setPort] = useState("8080");
  const [protocol, setProtocol] = useState("TCP");
  const [message, setMessage] = useState("");
  async function run() {
    const task = await api.networkDiagnose(
      {cluster: "demo", uid: "", kind: "Service", namespace: "default", name: service},
      {source, targetPort: Number(port), protocol, activeProbe: false}
    );
    setMessage(`网络诊断任务已启动：${task.id}`);
  }
  return <Stack spacing={3}>
    <div><Typography variant="h4">网络路径诊断</Typography><Typography color="text.secondary">默认只执行静态分析；主动探测保持关闭。</Typography></div>
    <Alert severity="info">没有 CNI 实际流量数据时，KDiag 不会宣称网络完全正常。NetworkPolicy 结果仅代表静态可达性分析。</Alert>
    <Stepper activeStep={0}>{["源资源","DNS","Service","EndpointSlice","NetworkPolicy","目标 Pod","目标端口","HTTP"].map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper>
    <Card><CardContent><Stack spacing={2}>
      <TextField label="源 Pod 或 Deployment" value={source} onChange={(e) => setSource(e.target.value)} />
      <TextField label="目标 Service" value={service} onChange={(e) => setService(e.target.value)} />
      <TextField label="目标端口" type="number" value={port} onChange={(e) => setPort(e.target.value)} />
      <TextField select label="协议" value={protocol} onChange={(e) => setProtocol(e.target.value)}>
        <MenuItem value="TCP">TCP</MenuItem><MenuItem value="HTTP">HTTP</MenuItem>
      </TextField>
      <Button variant="contained" onClick={run} disabled={!source || !service}>执行静态诊断</Button>
    </Stack></CardContent></Card>
    {message && <Alert severity="success">{message}</Alert>}
  </Stack>;
}

