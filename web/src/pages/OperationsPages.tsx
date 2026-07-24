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
  return <Page title="?????" subtitle="???????? NetworkPolicy ? PodDisruptionBudget????????????">
    <Alert severity="info" icon={<SecurityOutlined />}>?????????????????????????????</Alert>
    <Stack direction="row" gap={1} flexWrap="wrap">
      <Chip label={`NetworkPolicy ${items.filter((item) => item.ref.kind === "NetworkPolicy").length}`} />
      <Chip label={`PodDisruptionBudget ${items.filter((item) => item.ref.kind === "PodDisruptionBudget").length}`} />
      <Chip color="warning" label={`??? ${items.filter((item) => item.state !== "healthy").length}`} />
    </Stack>
    {items.length === 0 ? <EmptyState title="????????" detail="Informer ???????????? NetworkPolicy ? PodDisruptionBudget?" /> :
      <Stack spacing={1.25}>{items.map((item) => <ResourceSummary key={item.ref.uid} item={item} />)}</Stack>}
  </Page>;
}

export function ReportsPage() {
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
        "", task.report?.summary ?? "????????",
        "", `- ???${task.report?.verdict ?? task.status}`,
        `- ???${task.report?.impact ?? "????"}`,
        `- ???${task.report?.rootCause ?? "????"}`,
        "", "## ????", ...(task.report?.remediation ?? []).map((value) => `- ${value}`)
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
  return <Page title="??????" subtitle="?????????????????????????????????">
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Stack direction="row" gap={1}>
        <Chip label={`???? ${tasks.length}`} />
        <Chip label={`Incident ${items.length}`} />
        <Chip color="error" label={`??? ${items.filter((item) => item.status !== "resolved").length}`} />
      </Stack>
      <Stack direction="row" gap={1}>
        <Button variant="outlined" startIcon={<DownloadOutlined />} onClick={() => exportReports("markdown")} disabled={!tasks.length}>?? Markdown</Button>
        <Button variant="outlined" onClick={() => exportReports("json")} disabled={!tasks.length && !items.length}>?? JSON</Button>
      </Stack>
    </Stack>
    {tasks.length === 0 ? <EmptyState title="???????" detail="????????????????????????" /> :
      <Stack spacing={1.25}>{tasks.map((task) => <Card variant="outlined" key={task.id}><CardContent>
        <Stack direction={{xs: "column", md: "row"}} justifyContent="space-between" gap={2}>
          <Box>
            <Stack direction="row" gap={1} alignItems="center">
              <Typography variant="h6">{task.report?.headline ?? `${task.target.kind}/${task.target.name}`}</Typography>
              <Chip size="small" label={task.report?.verdict ?? task.status}
                color={task.report?.verdict === "CONFIRMED_ISSUE" ? "error" : "default"} />
            </Stack>
            <Typography color="text.secondary">{task.report?.summary ?? "??????"}</Typography>
          </Box>
          <Stack direction="row" gap={1} alignItems="center">
            <Chip size="small" label={`?? ${task.report?.confirmedIssues.length ?? 0}`} />
            <Chip size="small" label={`??? ${task.report?.unknownChecks.length ?? 0}`} />
            <Button component={Link} to={`/${task.kind === "network" ? "network" : "diagnose"}/${encodeURIComponent(task.id)}`}
              size="small" variant="outlined">????</Button>
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
  return <Page title="??????" subtitle="??????????????????????????">
    <Card><CardContent><Stack spacing={2}>
      <NamespacePicker value={namespace} onChange={(value) => {setNamespace(value); setResource(undefined);}} />
      <TextField select label="????" value={kind}
        onChange={(event) => {setKind(event.target.value); setResource(undefined);}}>
        {(kinds.length ? kinds : ["Service", "Deployment", "Pod"]).map((value) =>
          <MenuItem key={value} value={value}>{value}</MenuItem>)}
      </TextField>
      <ResourcePicker kind={kind} namespace={namespace} label="??????"
        value={resource?.ref.uid ?? ""} onChange={setResource} />
      <Stack direction={{xs: "column", md: "row"}} gap={1.5}>
        <TextField select label="????" value={depth} sx={{minWidth: 160}}
          onChange={(event) => setDepth(Number(event.target.value))}>
          {[1, 2, 3, 4].map((value) => <MenuItem key={value} value={value}>{value} ?</MenuItem>)}
        </TextField>
        <TextField select label="????" value={direction} sx={{minWidth: 180}}
          onChange={(event) => setDirection(event.target.value)}>
          <MenuItem value="both">???</MenuItem><MenuItem value="upstream">????</MenuItem>
          <MenuItem value="downstream">????</MenuItem>
        </TextField>
      </Stack>
    </Stack></CardContent></Card>
    {!resource ? <EmptyState title="???????" detail="?????????????????????" /> : null}
    {topology.isLoading ? <LoadingState /> : null}
    {topology.error ? <ErrorState error={topology.error} /> : null}
    {topology.data ? <SmartTopology topology={topology.data} /> : null}
  </Page>;
}

export function SettingsPage() {
  const {language, t} = useLanguage();
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
          <Typography color="text.secondary">{data.connection.serverVersion} ? {data.connection.mode}</Typography>
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
        t("secretContent", {value: data.coverage.secrets ? t("observed") : t("notCollected")}),
        t("readOnlyPermission"),
        t("activeProbeOff")
      ]} />
      <InfoCard title={t("capabilityCoverage")} lines={[
        t("discoveredKinds", {value: Object.keys(data.facets.kinds).length}),
        t("namespaces", {value: data.facets.namespaces.length}),
        t("observedCount", {value: data.facets.states.observed ?? 0})
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
    <Alert severity="warning">?? NodePort ??????????????????? HTTPS ?????????????????? NetworkPolicy?</Alert>
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
        <Typography variant="body2" color="text.secondary">{item.ref.namespace || "???"} ? {item.summary}</Typography>
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
