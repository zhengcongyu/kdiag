import {useEffect, useMemo, useState} from "react";
import type {ReactNode} from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, LinearProgress, MenuItem,
  Stack, TextField, Typography
} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {
  AccountTreeOutlined, DownloadOutlined, PolicyOutlined, SecurityOutlined,
  SettingsOutlined
} from "@mui/icons-material";
import {api} from "../api";
import {EmptyState, ErrorState, LoadingState} from "../components/States";
import {NamespacePicker} from "../components/NamespacePicker";
import {ResourcePicker} from "../components/ResourcePicker";
import type {InventoryResource} from "../types";

export function PolicyPage() {
  const policies = useQuery({
    queryKey: ["policy-inventory"],
    queryFn: async () => {
      const [network, disruption] = await Promise.all([
        api.inventory({kind: "NetworkPolicy", limit: 500}),
        api.inventory({kind: "PodDisruptionBudget", limit: 500})
      ]);
      return [...network.items, ...disruption.items];
    },
    refetchInterval: 15_000
  });
  if (policies.isLoading) return <LoadingState />;
  if (policies.error) return <ErrorState error={policies.error} />;
  const items = policies.data ?? [];
  return <Page title="策略与告警" subtitle="只读展示集群中的 NetworkPolicy 与 PodDisruptionBudget；不会自动修改生产资源。">
    <Alert severity="info" icon={<SecurityOutlined />}>告警来自结构化资源状态；未知或未覆盖的数据不会显示为正常。</Alert>
    <Stack direction="row" gap={1} flexWrap="wrap">
      <Chip label={`NetworkPolicy ${items.filter((item) => item.ref.kind === "NetworkPolicy").length}`} />
      <Chip label={`PodDisruptionBudget ${items.filter((item) => item.ref.kind === "PodDisruptionBudget").length}`} />
      <Chip color="warning" label={`需关注 ${items.filter((item) => item.state !== "healthy").length}`} />
    </Stack>
    {items.length === 0 ? <EmptyState title="没有发现策略资源" detail="Informer 已同步，但当前集群未创建 NetworkPolicy 或 PodDisruptionBudget。" /> :
      <Stack spacing={1.25}>{items.map((item) => <ResourceSummary key={item.ref.uid} item={item} />)}</Stack>}
  </Page>;
}

export function ReportsPage() {
  const incidents = useQuery({queryKey: ["incidents"], queryFn: api.incidents, refetchInterval: 15_000});
  if (incidents.isLoading) return <LoadingState />;
  if (incidents.error) return <ErrorState error={incidents.error} />;
  const items = incidents.data?.items ?? [];
  function exportReports() {
    const blob = new Blob([JSON.stringify({exportedAt: new Date().toISOString(), incidents: items}, null, 2)],
      {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kdiag-incidents-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return <Page title="报告中心" subtitle="汇总已生成的 Incident、证据数量、候选根因和最近更新时间。">
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Stack direction="row" gap={1}>
        <Chip label={`报告 ${items.length}`} />
        <Chip color="error" label={`未解决 ${items.filter((item) => item.status !== "resolved").length}`} />
      </Stack>
      <Button variant="outlined" startIcon={<DownloadOutlined />} onClick={exportReports} disabled={!items.length}>
        导出 JSON
      </Button>
    </Stack>
    {items.length === 0 ? <EmptyState title="还没有诊断报告" detail="创建 Incident 或运行资源诊断后，报告会显示在这里。" /> :
      <Stack spacing={1.25}>{items.map((incident) => <Card variant="outlined" key={incident.id}><CardContent>
        <Stack direction={{xs: "column", md: "row"}} justifyContent="space-between" gap={2}>
          <Box>
            <Stack direction="row" gap={1} alignItems="center">
              <Typography variant="h6">{incident.title}</Typography>
              <Chip size="small" label={incident.severity} color={incident.severity === "P0" || incident.severity === "P1" ? "error" : "warning"} />
            </Stack>
            <Typography color="text.secondary">{incident.summary}</Typography>
          </Box>
          <Stack direction="row" gap={1} alignItems="center">
            <Chip size="small" label={`证据 ${incident.evidence?.length ?? 0}`} />
            <Chip size="small" label={`根因 ${incident.hypotheses?.length ?? 0}`} />
            <Typography variant="caption" color="text.secondary">{new Date(incident.updatedAt).toLocaleString()}</Typography>
          </Stack>
        </Stack>
      </CardContent></Card>)}</Stack>}
  </Page>;
}

export function TopologyPage() {
  const overview = useQuery({queryKey: ["cluster-overview"], queryFn: api.clusterOverview, refetchInterval: 15_000});
  const [namespace, setNamespace] = useState("");
  const [kind, setKind] = useState("Service");
  const [resource, setResource] = useState<InventoryResource>();
  useEffect(() => {
    if (!namespace && overview.data?.facets.namespaces.length) {
      const values = overview.data.facets.namespaces;
      setNamespace(values.includes("default") ? "default" : values[0]);
    }
  }, [namespace, overview.data]);
  const kinds = useMemo(() => ["Service", "Deployment", "ReplicaSet", "Pod", "EndpointSlice", "PersistentVolumeClaim"]
    .filter((value) => (overview.data?.facets.kinds[value] ?? 0) > 0), [overview.data]);
  const relations = [
    ...(resource?.owners ?? []).map((owner) => ({type: "所有者", kind: owner.kind, name: owner.name, uid: owner.uid})),
    ...(resource?.relations ?? []).map((relation) => ({
      type: relationLabel(relation.type), kind: relation.resource.kind,
      name: relation.resource.name, uid: relation.resource.uid
    }))
  ];
  return <Page title="资源拓扑" subtitle="从实时 OwnerReference、Service selector 与 EndpointSlice 关系构建局部拓扑。">
    <Card><CardContent><Stack spacing={2}>
      <NamespacePicker value={namespace} onChange={(value) => {setNamespace(value); setResource(undefined);}} />
      <TextField select label="资源类型" value={kind}
        onChange={(event) => {setKind(event.target.value); setResource(undefined);}}>
        {(kinds.length ? kinds : ["Service", "Deployment", "Pod"]).map((value) =>
          <MenuItem key={value} value={value}>{value}</MenuItem>)}
      </TextField>
      <ResourcePicker kind={kind} namespace={namespace} label="拓扑中心资源"
        value={resource?.ref.uid ?? ""} onChange={setResource} />
    </Stack></CardContent></Card>
    {!resource ? <EmptyState title="请选择一个资源" detail="资源名称全部来自当前集群，不支持手工输入。" /> :
      <Card variant="outlined"><CardContent>
        <Stack direction="row" alignItems="center" gap={1.2} sx={{mb: 2}}>
          <AccountTreeOutlined color="primary" />
          <Typography variant="h6">{resource.ref.kind}/{resource.ref.name}</Typography>
          <Chip size="small" label={resource.stateText} />
        </Stack>
        {relations.length === 0 ? <Alert severity="info">该资源当前没有可确认的直接关系；这不代表它没有外部依赖。</Alert> :
          <Stack spacing={1}>{relations.map((relation) =>
            <Stack key={`${relation.type}-${relation.uid}`} direction="row" gap={1.5} alignItems="center"
              sx={{p: 1.5, borderRadius: 2, bgcolor: "#f5f7fb"}}>
              <Chip size="small" label={relation.type} color="primary" variant="outlined" />
              <Typography>{relation.kind}/{relation.name}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ml: "auto"}}>{relation.uid}</Typography>
            </Stack>)}</Stack>}
      </CardContent></Card>}
  </Page>;
}

export function SettingsPage() {
  const overview = useQuery({queryKey: ["cluster-overview"], queryFn: api.clusterOverview, refetchInterval: 15_000});
  if (overview.isLoading) return <LoadingState />;
  if (overview.error) return <ErrorState error={overview.error} />;
  const data = overview.data!;
  const syncAge = data.connection.syncedAt ? Math.max(0, Date.now() - Date.parse(data.connection.syncedAt)) : undefined;
  return <Page title="系统设置" subtitle="展示当前运行模式、采集覆盖和安全边界。MVP 不提供自动修改生产集群的开关。">
    <Card><CardContent>
      <Stack direction="row" gap={1.5} alignItems="center">
        <SettingsOutlined color="primary" />
        <Box sx={{flex: 1}}>
          <Typography variant="h6">{data.connection.name}</Typography>
          <Typography color="text.secondary">{data.connection.serverVersion} · {data.connection.mode}</Typography>
        </Box>
        <Chip color={data.connection.status === "connected" ? "success" : "warning"} label={data.connection.status} />
      </Stack>
      <LinearProgress variant="determinate" value={data.connection.status === "connected" ? 100 : 40} sx={{mt: 2}} />
    </CardContent></Card>
    <Stack direction={{xs: "column", md: "row"}} gap={2}>
      <InfoCard title="采集器" lines={[
        `数据源：${data.coverage.source}`,
        `资源总数：${data.total}`,
        `缓存同步：${syncAge == null ? "未知" : `${Math.round(syncAge / 1000)} 秒前`}`
      ]} />
      <InfoCard title="安全边界" lines={[
        `Secret 内容：${data.coverage.secrets ? "已采集" : "不采集"}`,
        "Kubernetes 权限：只读 get/list/watch",
        "主动探测：默认关闭"
      ]} />
      <InfoCard title="能力覆盖" lines={[
        `已发现资源类型：${Object.keys(data.facets.kinds).length}`,
        `Namespace：${data.facets.namespaces.length}`,
        `未知状态：${data.facets.states.unknown ?? 0}`
      ]} />
    </Stack>
    <Alert severity="warning">当前 NodePort 实验部署未内置身份认证。生产环境应使用 HTTPS 与身份认证代理，并恢复适配入口方式的 NetworkPolicy。</Alert>
  </Page>;
}

function Page({title, subtitle, children}: {title: string; subtitle: string; children: ReactNode}) {
  return <Stack spacing={3} sx={{p: {xs: 2, md: 3.5}}}>
    <Box><Typography variant="h4">{title}</Typography><Typography color="text.secondary">{subtitle}</Typography></Box>
    {children}
  </Stack>;
}

function ResourceSummary({item}: {item: InventoryResource}) {
  return <Card variant="outlined"><CardContent>
    <Stack direction={{xs: "column", md: "row"}} gap={2} alignItems={{md: "center"}}>
      <PolicyOutlined color="action" />
      <Box sx={{flex: 1}}>
        <Typography sx={{fontWeight: 650}}>{item.ref.kind}/{item.ref.name}</Typography>
        <Typography variant="body2" color="text.secondary">{item.ref.namespace || "集群级"} · {item.summary}</Typography>
      </Box>
      <Chip size="small" label={item.stateText} color={item.state === "healthy" ? "success" : item.state === "critical" ? "error" : "warning"} />
    </Stack>
  </CardContent></Card>;
}

function InfoCard({title, lines}: {title: string; lines: string[]}) {
  return <Card variant="outlined" sx={{flex: 1}}><CardContent>
    <Typography variant="h6">{title}</Typography><Divider sx={{my: 1.5}} />
    <Stack spacing={1}>{lines.map((line) => <Typography key={line} variant="body2">{line}</Typography>)}</Stack>
  </CardContent></Card>;
}

function relationLabel(value: string) {
  return ({
    "owned-by": "所有者", "scheduled-on": "调度到", "selects": "选择",
    "represented-by": "由 EndpointSlice 表示", "represents": "表示 Service"
  } as Record<string, string>)[value] ?? value;
}
