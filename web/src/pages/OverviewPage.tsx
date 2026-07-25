import {Alert, Card, CardContent, Grid, Stack, Typography} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import {api} from "../api";
import {ErrorState, LoadingState} from "../components/States";
import {Severity} from "../components/Severity";
import {useLanguage} from "../i18n";

export function OverviewPage() {
  const {t} = useLanguage();
  const incidentsQuery = useQuery({queryKey: ["incidents"], queryFn: api.incidents, refetchInterval: 15_000});
  const overviewQuery = useQuery({queryKey: ["cluster-overview"], queryFn: api.clusterOverview, refetchInterval: 15_000});
  if (incidentsQuery.isLoading || overviewQuery.isLoading) return <LoadingState />;
  if (incidentsQuery.error) return <ErrorState error={incidentsQuery.error} />;
  if (overviewQuery.error) return <ErrorState error={overviewQuery.error} />;
  const incidents = incidentsQuery.data?.items ?? [];
  const overview = overviewQuery.data!;
  const states = overview.facets.states;
  const mostSevere = [...incidents].sort((a, b) => a.severity.localeCompare(b.severity))[0];
  const groups = overview.facets.groups;
  return <Stack spacing={3}>
    <div><Typography variant="h4">{t("clusterHealth")}</Typography>
      <Typography color="text.secondary">{t("clusterHealthSubtitle")}</Typography></div>
    {(states.unknown ?? 0) > 0 ? <Alert severity="info">
      {t("unknownCount", {value: states.unknown ?? 0})}
    </Alert> : null}
    {overview.access.status === "partial" ? <Alert severity="warning">{t("permissionDeniedMeaning")}</Alert> : null}
    <Grid container spacing={1.5}>
      <Grid size={{xs: 6, md: 3}}><Summary title={t("critical")} value={states.critical ?? 0} tone="#c43228" /></Grid>
      <Grid size={{xs: 6, md: 3}}><Summary title={t("warning")} value={states.warning ?? 0} tone="#9a5b00" /></Grid>
      <Grid size={{xs: 6, md: 3}}><Summary title={t("unknown")} value={states.unknown ?? 0} tone="#6e6e73" /></Grid>
      <Grid size={{xs: 6, md: 3}}><Summary title={t("healthy")} value={states.healthy ?? 0} tone="#16833d" /></Grid>
    </Grid>
    <Grid container spacing={2}>
      <Grid size={{xs: 12, md: 5}}><Card><CardContent>
        <Typography variant="h6">{t("healthDistribution")}</Typography>
        <ReactECharts style={{height: 260}} option={{
          tooltip: {trigger: "item"}, legend: {bottom: 0},
          series: [{type: "pie", radius: ["48%", "72%"], data: [
            {name: t("critical"), value: states.critical ?? 0, itemStyle: {color: "#d94a40"}},
            {name: t("warning"), value: states.warning ?? 0, itemStyle: {color: "#d9982f"}},
            {name: t("unknown"), value: states.unknown ?? 0, itemStyle: {color: "#7b93a8"}},
            {name: t("healthy"), value: states.healthy ?? 0, itemStyle: {color: "#2c9b50"}}
          ]}]
        }} />
      </CardContent></Card></Grid>
      <Grid size={{xs: 12, md: 7}}><Card><CardContent>
        <Typography variant="h6" gutterBottom>{t("currentPriority")}</Typography>
        {mostSevere ? <Stack spacing={1}><Severity value={mostSevere.severity} />
          <Typography variant="h5">{mostSevere.title}</Typography><Typography>{mostSevere.summary}</Typography>
        </Stack> : <Stack spacing={1}>
          <Typography variant="h5">{(states.critical ?? 0) > 0 ? `${states.critical} ${t("critical")}` : t("noIssueIncident")}</Typography>
          <Typography color="text.secondary">{t("incidentZero")}</Typography>
        </Stack>}
      </CardContent></Card></Grid>
    </Grid>
    <Grid container spacing={1.5}>
      <Grid size={{xs: 12, md: 3}}><Area title={t("workloads")} count={groups.workloads ?? 0} /></Grid>
      <Grid size={{xs: 12, md: 3}}><Area title={t("servicesNetwork")} count={groups.network ?? 0} /></Grid>
      <Grid size={{xs: 12, md: 3}}><Area title={t("nodes")} count={groups.cluster ?? 0} /></Grid>
      <Grid size={{xs: 12, md: 3}}><Area title={t("storage")} count={groups.storage ?? 0} /></Grid>
    </Grid>
  </Stack>;
}

function Summary({title, value, tone}: {title: string; value: number; tone: string}) {
  return <Card variant="outlined"><CardContent><Typography color="text.secondary">{title}</Typography>
    <Typography variant="h4" sx={{color: tone, mt: .5}}>{value}</Typography></CardContent></Card>;
}
function Area({title, count}: {title: string; count: number}) {
  const {t} = useLanguage();
  return <Card variant="outlined"><CardContent><Typography sx={{fontWeight: 700}}>{title}</Typography>
    <Typography color="text.secondary">{t("assessedResources", {value: count})}</Typography></CardContent></Card>;
}
