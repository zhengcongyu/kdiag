import {useEffect, useMemo, useState} from "react";
import type {ReactNode} from "react";
import {Link} from "react-router-dom";
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, Chip, Divider,
  LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography
} from "@mui/material";
import {useMutation, useQuery} from "@tanstack/react-query";
import {
  ContentCopyOutlined, DownloadOutlined, ExpandMore, LockOpenOutlined, PolicyOutlined,
  SecurityOutlined, SettingsOutlined
} from "@mui/icons-material";
import {api} from "../api";
import {EmptyState, ErrorState, LoadingState} from "../components/States";
import {NamespacePicker} from "../components/NamespacePicker";
import {ResourcePicker} from "../components/ResourcePicker";
import {SmartTopology} from "../components/SmartTopology";
import type {InventoryResource} from "../types";
import {useLanguage} from "../i18n";

export function PolicyPage() {
  const {l, localize} = useLanguage();
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
  return <Page title={l("策略与告警", "Policies & Alerts")}
    subtitle={l("只读展示集群中的 NetworkPolicy 与 PodDisruptionBudget；不会自动修改生产资源。",
      "Read-only view of NetworkPolicies and PodDisruptionBudgets. KDiag never mutates production resources.")}>
    <Alert severity="info" icon={<SecurityOutlined />}>{l(
      "告警来自结构化资源状态；未知或未覆盖的数据不会显示为正常。",
      "Alerts are based on structured resource state. Unknown or uncovered data is never shown as healthy."
    )}</Alert>
    <Stack direction="row" gap={1} flexWrap="wrap">
      <Chip label={`NetworkPolicy ${items.filter((item) => item.ref.kind === "NetworkPolicy").length}`} />
      <Chip label={`PodDisruptionBudget ${items.filter((item) => item.ref.kind === "PodDisruptionBudget").length}`} />
      <Chip color="warning" label={`${l("需关注", "Needs attention")} ${items.filter((item) => item.state !== "healthy").length}`} />
    </Stack>
    {items.length === 0 ? <EmptyState title={l("没有发现策略资源", "No policy resources found")}
      detail={l("Informer 已同步，但当前集群未创建 NetworkPolicy 或 PodDisruptionBudget。",
        "The informer is synced, but the cluster has no NetworkPolicy or PodDisruptionBudget resources.")} /> :
      <Stack spacing={1.25}>{items.map((item) => <ResourceSummary key={item.ref.uid} item={item}
        stateText={localize(item.stateText)} summary={localize(item.summary)} />)}</Stack>}
  </Page>;
}

export function ReportsPage() {
  const {l, localize} = useLanguage();
  const incidents = useQuery({queryKey: ["incidents"], queryFn: api.incidents, refetchInterval: 15_000});
  const diagnoses = useQuery({queryKey: ["diagnoses"], queryFn: () => api.diagnoses(), refetchInterval: 15_000});
  if (incidents.isLoading || diagnoses.isLoading) return <LoadingState />;
  if (incidents.error) return <ErrorState error={incidents.error} />;
  if (diagnoses.error) return <ErrorState error={diagnoses.error} />;
  const items = incidents.data?.items ?? [];
  const tasks = diagnoses.data?.items ?? [];
  function exportReports(format: "json" | "markdown") {
    const content = format === "json"
      ? JSON.stringify({exportedAt: new Date().toISOString(), incidents: items, diagnoses: tasks}, null, 2)
      : tasks.map((task) => [
        `# ${task.report?.headline ?? `${task.target.kind}/${task.target.name}`}`,
        "", localize(task.report?.summary) || l("诊断尚未生成报告", "The diagnosis report is not ready."),
        "", `- ${l("结论", "Verdict")}: ${task.report?.verdict ?? task.status}`,
        `- ${l("影响", "Impact")}: ${localize(task.report?.impact) || l("尚未确认", "Unconfirmed")}`,
        `- ${l("根因", "Root cause")}: ${localize(task.report?.rootCause) || l("尚未确认", "Unconfirmed")}`,
        "", `## ${l("修复建议", "Remediation")}`, ...(task.report?.remediation ?? []).map((value) => `- ${localize(value)}`)
      ].join("\n")).join("\n\n---\n\n");
    const blob = new Blob([content],
      {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kdiag-reports-${new Date().toISOString().slice(0, 10)}.${format === "json" ? "json" : "md"}`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return <Page title={l("诊断报告中心", "Diagnosis Reports")}
    subtitle={l("普通用户先看结论，技术人员可进入报告查看完整证据、规则和原始数据。",
      "Start with the verdict, then open the technical report for evidence, rules, and raw data.")}>
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Stack direction="row" gap={1}>
        <Chip label={`${l("诊断报告", "Reports")} ${tasks.length}`} />
        <Chip label={`Incident ${items.length}`} />
        <Chip color="error" label={`${l("未解决", "Unresolved")} ${items.filter((item) => item.status !== "resolved").length}`} />
      </Stack>
      <Stack direction="row" gap={1}>
        <Button variant="outlined" startIcon={<DownloadOutlined />} onClick={() => exportReports("markdown")} disabled={!tasks.length}>
          {l("导出 Markdown", "Export Markdown")}</Button>
        <Button variant="outlined" onClick={() => exportReports("json")} disabled={!tasks.length && !items.length}>
          {l("导出 JSON", "Export JSON")}</Button>
      </Stack>
    </Stack>
    {tasks.length === 0 ? <EmptyState title={l("还没有诊断报告", "No diagnosis reports yet")}
      detail={l("运行资源诊断或网络路径诊断后，报告会保存在这里。",
        "Resource and network diagnosis reports will be saved here.")} /> :
      <Stack spacing={1.25}>{tasks.map((task) => <Card variant="outlined" key={task.id}><CardContent>
        <Stack direction={{xs: "column", md: "row"}} justifyContent="space-between" gap={2}>
          <Box>
            <Stack direction="row" gap={1} alignItems="center">
              <Typography variant="h6">{task.report?.headline ?? `${task.target.kind}/${task.target.name}`}</Typography>
              <Chip size="small" label={task.report?.verdict ?? task.status}
                color={task.report?.verdict === "CONFIRMED_ISSUE" ? "error" : "default"} />
            </Stack>
            <Typography color="text.secondary">{localize(task.report?.summary) || l("报告正在生成", "Generating report")}</Typography>
          </Box>
          <Stack direction="row" gap={1} alignItems="center">
            <Chip size="small" label={`${l("问题", "Issues")} ${task.report?.confirmedIssues.length ?? 0}`} />
            <Chip size="small" label={`${l("未验证", "Unverified")} ${task.report?.unknownChecks.length ?? 0}`} />
            <Button component={Link} to={`/${task.kind === "network" ? "network" : "diagnose"}/${encodeURIComponent(task.id)}`}
              size="small" variant="outlined">{l("查看报告", "View report")}</Button>
          </Stack>
        </Stack>
      </CardContent></Card>)}</Stack>}
  </Page>;
}

export function TopologyPage() {
  const {l} = useLanguage();
  const overview = useQuery({queryKey: ["cluster-overview"], queryFn: api.clusterOverview, refetchInterval: 15_000});
  const [namespace, setNamespace] = useState("");
  const [kind, setKind] = useState("Service");
  const [resource, setResource] = useState<InventoryResource>();
  const [depth, setDepth] = useState(2);
  const [direction, setDirection] = useState("both");
  useEffect(() => {
    if (!namespace && overview.data?.facets.namespaces.length) {
      const values = overview.data.facets.namespaces;
      setNamespace(values.includes("default") ? "default" : values[0]);
    }
  }, [namespace, overview.data]);
  const kinds = useMemo(() => ["Service", "Deployment", "ReplicaSet", "Pod", "EndpointSlice", "PersistentVolumeClaim"]
    .filter((value) => (overview.data?.facets.kinds[value] ?? 0) > 0), [overview.data]);
  const topology = useQuery({
    queryKey: ["topology", resource?.ref.uid, depth, direction],
    queryFn: () => api.topology(resource!.ref.uid, depth, direction),
    enabled: Boolean(resource), refetchInterval: 15_000
  });
  return <Page title={l("智能资源拓扑", "Smart Resource Topology")}
    subtitle={l("以所选资源为中心展示上下游、健康状态和故障传播路径。",
      "Explore upstream and downstream resources, health, and failure propagation around the selected resource.")}>
    <Card><CardContent><Stack spacing={2}>
      <NamespacePicker value={namespace} onChange={(value) => {setNamespace(value); setResource(undefined);}} />
      <TextField select label={l("资源类型", "Resource kind")} value={kind}
        onChange={(event) => {setKind(event.target.value); setResource(undefined);}}>
        {(kinds.length ? kinds : ["Service", "Deployment", "Pod"]).map((value) =>
          <MenuItem key={value} value={value}>{value}</MenuItem>)}
      </TextField>
      <ResourcePicker kind={kind} namespace={namespace} label={l("拓扑中心资源", "Topology root")}
        value={resource?.ref.uid ?? ""} onChange={setResource} />
      <Stack direction={{xs: "column", md: "row"}} gap={1.5}>
        <TextField select label={l("展开层数", "Depth")} value={depth} sx={{minWidth: 160}}
          onChange={(event) => setDepth(Number(event.target.value))}>
          {[1, 2, 3, 4].map((value) => <MenuItem key={value} value={value}>{value} {l("层", "levels")}</MenuItem>)}
        </TextField>
        <TextField select label={l("关系方向", "Direction")} value={direction} sx={{minWidth: 180}}
          onChange={(event) => setDirection(event.target.value)}>
          <MenuItem value="both">{l("上下游", "Both")}</MenuItem>
          <MenuItem value="upstream">{l("只看上游", "Upstream only")}</MenuItem>
          <MenuItem value="downstream">{l("只看下游", "Downstream only")}</MenuItem>
        </TextField>
      </Stack>
    </Stack></CardContent></Card>
    {!resource ? <EmptyState title={l("请选择一个资源", "Select a resource")}
      detail={l("资源名称全部来自当前集群，不支持手工输入。",
        "Resource names are loaded from the live cluster and cannot be entered manually.")} /> : null}
    {topology.isLoading ? <LoadingState /> : null}
    {topology.error ? <ErrorState error={topology.error} /> : null}
    {topology.data ? <SmartTopology topology={topology.data} /> : null}
  </Page>;
}

export function SettingsPage() {
  const {language, t, l} = useLanguage();
  const overview = useQuery({queryKey: ["cluster-overview"], queryFn: api.clusterOverview, refetchInterval: 15_000});
  const rbac = useMutation({mutationFn: api.accessRBAC});
  if (overview.isLoading) return <LoadingState />;
  if (overview.error) return <ErrorState error={overview.error} />;
  const data = overview.data!;
  const syncAge = data.connection.syncedAt ? Math.max(0, Date.now() - Date.parse(data.connection.syncedAt)) : undefined;
  const access = data.access;
  const accessLabel = access.status === "complete" ? t("accessComplete") :
    access.status === "partial" ? t("accessPartial") : t("accessUnavailable");
  return <Page title={t("systemSettings")} subtitle={t("settingsSubtitle")}>
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
      <InfoCard title={t("collector")} lines={[
        t("dataSource", {value: data.coverage.source}),
        t("resourceTotal", {value: data.total}),
        t("cacheSync", {value: syncAge == null ? t("notAvailable") : t("secondsAgo", {value: Math.round(syncAge / 1000)})})
      ]} />
      <InfoCard title={t("securityBoundary")} lines={[
        t("secretContent", {value: data.coverage.secrets ? l("允许", "Allowed") : t("notCollected")}),
        t("readOnlyPermission"),
        t("activeProbeOff")
      ]} />
      <InfoCard title={t("capabilityCoverage")} lines={[
        t("discoveredKinds", {value: Object.keys(data.facets.kinds).length}),
        t("namespaces", {value: data.facets.namespaces.length}),
        t("unknownCount", {value: data.facets.states.unknown ?? 0})
      ]} />
    </Stack>
    <Card variant="outlined"><CardContent>
      <Stack direction={{xs: "column", md: "row"}} justifyContent="space-between" gap={2}>
        <Box>
          <Stack direction="row" gap={1} alignItems="center">
            <LockOpenOutlined color={access.status === "complete" ? "success" : "warning"} />
            <Typography variant="h5">{t("accessTitle")}</Typography>
            <Chip size="small" color={access.status === "complete" ? "success" : "warning"} label={accessLabel} />
          </Stack>
          <Typography color="text.secondary" sx={{mt: .7}}>
            {language === "zh-CN" ? access.message : access.status === "complete"
              ? "The current ServiceAccount can read every configured resource kind."
              : "At least one configured resource kind is not readable by the current ServiceAccount."}
          </Typography>
        </Box>
        <Stack direction="row" gap={1} alignItems="center">
          <Button variant="outlined" onClick={() => void overview.refetch()}>{t("refreshPermissions")}</Button>
          <Button variant="contained" onClick={() => rbac.mutate()}>{t("generateRBAC")}</Button>
        </Stack>
      </Stack>
      <Alert severity="info" sx={{mt: 2}}>{t("rbacHelp")}</Alert>
      <Accordion sx={{mt: 2}}>
        <AccordionSummary expandIcon={<ExpandMore />}><Typography sx={{fontWeight: 700}}>{t("permissionMatrix")}</Typography></AccordionSummary>
        <AccordionDetails sx={{p: 0}}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>{t("kind")}</TableCell><TableCell>{t("scope")}</TableCell>
              <TableCell>{t("verbs")}</TableCell><TableCell>{t("status")}</TableCell>
            </TableRow></TableHead>
            <TableBody>{access.checks.map((check) => <TableRow key={`${check.group}/${check.resource}`}>
              <TableCell>{check.kind}<Typography variant="caption" color="text.secondary" display="block">
                {check.group || "core"}/{check.resource}
              </Typography></TableCell>
              <TableCell>{check.namespaced ? t("namespaced") : t("clusterScoped")}</TableCell>
              <TableCell>{(["get", "list", "watch"] as const).map((verb) =>
                <Chip key={verb} size="small" sx={{mr: .5}} label={verb}
                  color={check.verbs[verb] ? "success" : "error"} variant="outlined" />)}</TableCell>
              <TableCell><Chip size="small" color={check.allowed ? "success" : "error"}
                label={check.allowed ? t("allowed") : t("denied")} /></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </AccordionDetails>
      </Accordion>
      {rbac.data ? <Box sx={{mt: 2}}>
        <Alert severity="warning">{t("rbacWarning")}</Alert>
        <Stack direction="row" gap={1} sx={{my: 1.5}}>
          <Button startIcon={<ContentCopyOutlined />} variant="outlined"
            onClick={() => void navigator.clipboard.writeText(rbac.data.manifest)}>{t("copyManifest")}</Button>
          <Button startIcon={<ContentCopyOutlined />} variant="outlined"
            onClick={() => void navigator.clipboard.writeText(rbac.data.command)}>{t("copyCommand")}</Button>
        </Stack>
        <Box component="pre" sx={{maxHeight: 360, overflow: "auto", bgcolor: "#f5f5f7", p: 2, borderRadius: 2, fontSize: 12}}>
          {rbac.data.manifest}
        </Box>
      </Box> : null}
      {rbac.error ? <Alert severity="error" sx={{mt: 2}}>{String(rbac.error)}</Alert> : null}
    </CardContent></Card>
    <Alert severity="warning">{l(
      "当前 NodePort 实验部署未内置身份认证。生产环境应使用 HTTPS 与身份认证代理，并恢复适配入口方式的 NetworkPolicy。",
      "This NodePort lab deployment has no built-in authentication. Production deployments should use HTTPS, an authentication proxy, and an ingress-appropriate NetworkPolicy."
    )}</Alert>
  </Page>;
}

function Page({title, subtitle, children}: {title: string; subtitle: string; children: ReactNode}) {
  return <Stack spacing={3} sx={{p: {xs: 2, md: 3.5}}}>
    <Box><Typography variant="h4">{title}</Typography><Typography color="text.secondary">{subtitle}</Typography></Box>
    {children}
  </Stack>;
}

function ResourceSummary({item, stateText, summary}: {
  item: InventoryResource; stateText?: string; summary?: string;
}) {
  const {l} = useLanguage();
  return <Card variant="outlined"><CardContent>
    <Stack direction={{xs: "column", md: "row"}} gap={2} alignItems={{md: "center"}}>
      <PolicyOutlined color="action" />
      <Box sx={{flex: 1}}>
        <Typography sx={{fontWeight: 650}}>{item.ref.kind}/{item.ref.name}</Typography>
        <Typography variant="body2" color="text.secondary">{item.ref.namespace || l("集群级", "Cluster-scoped")} · {summary ?? item.summary}</Typography>
      </Box>
      <Chip size="small" label={stateText ?? item.stateText}
        color={item.state === "healthy" ? "success" : item.state === "critical" ? "error" : "warning"} />
    </Stack>
  </CardContent></Card>;
}

function InfoCard({title, lines}: {title: string; lines: string[]}) {
  return <Card variant="outlined" sx={{flex: 1}}><CardContent>
    <Typography variant="h6">{title}</Typography><Divider sx={{my: 1.5}} />
    <Stack spacing={1}>{lines.map((line) => <Typography key={line} variant="body2">{line}</Typography>)}</Stack>
  </CardContent></Card>;
}
