import {useEffect, useMemo, useState} from "react";
import {
  Alert, Button, Card, CardContent, Chip, MenuItem, Stack, Step, StepLabel,
  Stepper, TextField, Typography
} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {api, subscribeDiagnosis} from "../api";
import {NamespacePicker} from "../components/NamespacePicker";
import {ResourcePicker} from "../components/ResourcePicker";
import type {InventoryResource, ResourceRef} from "../types";

export function NetworkPage() {
  const overview = useQuery({
    queryKey: ["cluster-overview"], queryFn: api.clusterOverview, refetchInterval: 15_000
  });
  const [namespace, setNamespace] = useState("");
  const [sourceKind, setSourceKind] = useState("Pod");
  const [source, setSource] = useState<InventoryResource>();
  const [service, setService] = useState<InventoryResource>();
  const [port, setPort] = useState("");
  const [protocol, setProtocol] = useState("TCP");
  const [taskID, setTaskID] = useState("");
  const [events, setEvents] = useState<{type: string; data: unknown}[]>([]);
  const [error, setError] = useState("");

  const namespaceInventory = useQuery({
    queryKey: ["network-snapshot", namespace],
    queryFn: () => api.inventory({namespace, limit: 500}),
    enabled: Boolean(namespace),
    refetchInterval: 15_000
  });

  useEffect(() => {
    if (!namespace && overview.data?.facets.namespaces.length) {
      const namespaces = overview.data.facets.namespaces;
      setNamespace(namespaces.includes("default") ? "default" : namespaces[0]);
    }
  }, [namespace, overview.data]);

  useEffect(() => {
    if (!taskID) return;
    return subscribeDiagnosis(taskID, (type, data) => setEvents((current) => [...current, {type, data}]));
  }, [taskID]);

  const servicePorts = useMemo(() => readServicePorts(service), [service]);

  useEffect(() => {
    setPort(servicePorts.length ? String(servicePorts[0].port) : "");
  }, [service?.ref.uid, servicePorts]);

  async function run() {
    if (!source || !service || !port) return;
    setError("");
    setEvents([]);
    try {
      const all = namespaceInventory.data?.items ?? [];
      const sourcePods = resolveSourcePods(source, all).map(toNetworkPod);
      const backendPods = all.filter((item) => item.ref.kind === "Pod").map(toNetworkPod);
      const endpointSlices = all.filter((item) => item.ref.kind === "EndpointSlice").map(toEndpointSlice);
      const policies = all.filter((item) => item.ref.kind === "NetworkPolicy");
      const task = await api.networkDiagnose({
        cluster: overview.data?.connection.name ?? source.ref.cluster,
        namespace,
        source: `${source.ref.kind}/${source.ref.name}`,
        service: service.ref.name,
        port: Number(port),
        protocol,
        activeProbe: false,
        snapshot: {
          sourcePods,
          service: {
            ref: service.ref,
            exists: true,
            clusterIP: stringValue(service.spec?.clusterIP),
            selector: recordOfStrings(service.spec?.selector),
            ports: servicePorts.map((item) => ({
              name: item.name, port: item.port, targetPort: String(item.targetPort)
            }))
          },
          backendPods,
          endpointSlices,
          policy: {
            applicable: policies.length > 0,
            staticallyDenied: false,
            summary: policies.length
              ? `发现 ${policies.length} 条 NetworkPolicy；静态检查未断言完全可达`
              : "当前 Namespace 没有 NetworkPolicy",
            limitations: "没有 CNI 实际流量数据，不能据此宣称网络完全正常"
          }
        }
      });
      setTaskID(task.id);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  return <Stack spacing={3} sx={{p: {xs: 2, md: 3.5}}}>
    <div>
      <Typography variant="h4">网络路径诊断</Typography>
      <Typography color="text.secondary">源资源、目标 Service 与端口均从实时集群清单读取。</Typography>
    </div>
    <Alert severity="info">主动探测保持关闭。没有 CNI 流量证据时，KDiag 不会宣称网络完全正常。</Alert>
    <Stepper activeStep={taskID ? 1 : 0}>
      {["源资源", "DNS", "Service", "EndpointSlice", "NetworkPolicy", "目标 Pod", "目标端口", "HTTP"].map(
        (label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
    </Stepper>
    <Card><CardContent><Stack spacing={2}>
      <NamespacePicker value={namespace} onChange={(value) => {
        setNamespace(value); setSource(undefined); setService(undefined); setPort("");
      }} />
      <TextField select fullWidth label="源资源类型" value={sourceKind}
        onChange={(event) => { setSourceKind(event.target.value); setSource(undefined); }}>
        <MenuItem value="Pod">Pod</MenuItem>
        <MenuItem value="Deployment">Deployment</MenuItem>
      </TextField>
      <ResourcePicker kind={sourceKind} namespace={namespace} label="源资源"
        value={source?.ref.uid ?? ""} onChange={setSource} />
      <ResourcePicker kind="Service" namespace={namespace} label="目标 Service"
        value={service?.ref.uid ?? ""} onChange={setService} />
      <TextField select fullWidth label="目标端口" value={port}
        disabled={!service || servicePorts.length === 0}
        helperText={servicePorts.length ? "来自 Service spec.ports" : "该 Service 没有声明端口"}
        onChange={(event) => setPort(event.target.value)}>
        {servicePorts.map((item) => <MenuItem key={`${item.name}-${item.port}`} value={String(item.port)}>
          {item.name || "未命名"} · {item.port} → {String(item.targetPort)}
        </MenuItem>)}
      </TextField>
      <TextField select fullWidth label="协议" value={protocol} onChange={(event) => setProtocol(event.target.value)}>
        <MenuItem value="TCP">TCP</MenuItem><MenuItem value="HTTP">HTTP</MenuItem>
      </TextField>
      {source && service ? <Stack direction="row" gap={1} flexWrap="wrap">
        <Chip size="small" label={`${source.ref.kind}/${source.ref.name}`} />
        <Chip size="small" label={`Service/${service.ref.name}`} />
        <Chip size="small" label={`${namespaceInventory.data?.total ?? 0} 个快照资源`} />
      </Stack> : null}
      <Button variant="contained" onClick={run}
        disabled={!source || !service || !port || namespaceInventory.isLoading}>执行静态诊断</Button>
    </Stack></CardContent></Card>
    {namespaceInventory.error ? <Alert severity="error">无法构建网络快照：{(namespaceInventory.error as Error).message}</Alert> : null}
    {error ? <Alert severity="error">{error}</Alert> : null}
    {taskID ? <Alert severity="success">网络诊断任务已启动：{taskID}</Alert> : null}
    <Stack spacing={1}>{events.map((event, index) =>
      <Card variant="outlined" key={`${event.type}-${index}`}><CardContent>
        <Typography sx={{fontWeight: 650}}>{event.type}</Typography>
        <Typography component="pre" sx={{whiteSpace: "pre-wrap", fontSize: 12}}>
          {JSON.stringify(event.data, null, 2)}
        </Typography>
      </CardContent></Card>)}</Stack>
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

function resolveSourcePods(source: InventoryResource, all: InventoryResource[]) {
  if (source.ref.kind === "Pod") return [source];
  const selector = recordOfStrings((source.spec?.selector as Record<string, unknown> | undefined)?.matchLabels);
  return all.filter((item) => item.ref.kind === "Pod" && labelsMatch(item.labels ?? {}, selector));
}

function labelsMatch(labels: Record<string, string>, selector: Record<string, string>) {
  const entries = Object.entries(selector);
  return entries.length > 0 && entries.every(([key, value]) => labels[key] === value);
}

function toNetworkPod(item: InventoryResource) {
  const statuses = Array.isArray(item.status?.conditions) ? item.status.conditions : [];
  const ready = statuses.some((value) => {
    const condition = value as Record<string, unknown>;
    return condition.type === "Ready" && condition.status === "True";
  });
  const containers = Array.isArray(item.spec?.containers) ? item.spec.containers : [];
  const containerPorts: Record<string, number> = {};
  containers.forEach((value) => {
    const container = value as Record<string, unknown>;
    const ports = Array.isArray(container.ports) ? container.ports : [];
    ports.forEach((portValue) => {
      const declared = portValue as Record<string, unknown>;
      const number = Number(declared.containerPort);
      if (Number.isFinite(number)) containerPorts[stringValue(declared.name) || String(number)] = number;
    });
  });
  return {
    ref: item.ref,
    running: item.status?.phase === "Running",
    ready,
    labels: item.labels ?? {},
    ip: item.ip ?? "",
    containerPorts
  };
}

function toEndpointSlice(item: InventoryResource) {
  const endpoints = Array.isArray(item.spec?.endpoints) ? item.spec.endpoints : [];
  return {
    ref: item.ref,
    service: item.labels?.["kubernetes.io/service-name"] ?? "",
    endpoints: endpoints.map((value) => {
      const endpoint = value as Record<string, unknown>;
      const conditions = (endpoint.conditions ?? {}) as Record<string, unknown>;
      const target = endpoint.targetRef as Record<string, unknown> | undefined;
      return {
        addresses: Array.isArray(endpoint.addresses) ? endpoint.addresses.map(String) : [],
        ready: typeof conditions.ready === "boolean" ? conditions.ready : undefined,
        targetRef: target ? {
          cluster: item.ref.cluster,
          uid: stringValue(target.uid),
          kind: stringValue(target.kind),
          namespace: stringValue(target.namespace) || item.ref.namespace,
          name: stringValue(target.name)
        } satisfies ResourceRef : undefined
      };
    })
  };
}

function recordOfStrings(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, String(item)]));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}
