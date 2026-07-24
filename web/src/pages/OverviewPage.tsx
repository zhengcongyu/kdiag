import {Alert, Card, CardContent, Grid, Stack, Typography} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import {api} from "../api";
import {ErrorState, LoadingState} from "../components/States";
import {Severity} from "../components/Severity";

export function OverviewPage() {
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
    <div><Typography variant="h4">集群健康概览</Typography>
      <Typography color="text.secondary">先看哪里需要处理，再进入诊断证据和 Kubernetes 技术细节。</Typography></div>
    {(states.critical ?? 0) === 0 && (states.warning ?? 0) === 0 && (states.unknown ?? 0) > 0 ?
      <Alert severity="warning">没有发现已确认异常，但有 {states.unknown} 个资源尚未评估；这不代表集群全部正常。</Alert> : null}
    <Grid container spacing={1.5}>
      <Grid size={{xs: 6, md: 3}}><Summary title="异常" value={states.critical ?? 0} tone="#c43228" /></Grid>
      <Grid size={{xs: 6, md: 3}}><Summary title="警告" value={states.warning ?? 0} tone="#9a5b00" /></Grid>
      <Grid size={{xs: 6, md: 3}}><Summary title="尚未评估" value={states.unknown ?? 0} tone="#6e6e73" /></Grid>
      <Grid size={{xs: 6, md: 3}}><Summary title="正常" value={states.healthy ?? 0} tone="#16833d" /></Grid>
    </Grid>
    <Grid container spacing={2}>
      <Grid size={{xs: 12, md: 5}}><Card><CardContent>
        <Typography variant="h6">资源健康分布</Typography>
        <ReactECharts style={{height: 260}} option={{
          tooltip: {trigger: "item"}, legend: {bottom: 0},
          series: [{type: "pie", radius: ["48%", "72%"], data: [
            {name: "异常", value: states.critical ?? 0, itemStyle: {color: "#d94a40"}},
            {name: "警告", value: states.warning ?? 0, itemStyle: {color: "#d9982f"}},
            {name: "尚未评估", value: states.unknown ?? 0, itemStyle: {color: "#a1a1a6"}},
            {name: "正常", value: states.healthy ?? 0, itemStyle: {color: "#2c9b50"}}
          ]}]
        }} />
      </CardContent></Card></Grid>
      <Grid size={{xs: 12, md: 7}}><Card><CardContent>
        <Typography variant="h6" gutterBottom>当前最需要处理</Typography>
        {mostSevere ? <Stack spacing={1}><Severity value={mostSevere.severity} />
          <Typography variant="h5">{mostSevere.title}</Typography><Typography>{mostSevere.summary}</Typography>
        </Stack> : <Stack spacing={1}>
          <Typography variant="h5">{(states.critical ?? 0) > 0 ? `${states.critical} 个资源处于异常状态` : "当前没有已聚合的 Incident"}</Typography>
          <Typography color="text.secondary">Incident 为 0 只表示当前没有已确认并聚合的故障，不等于集群完全健康。</Typography>
        </Stack>}
      </CardContent></Card></Grid>
    </Grid>
    <Grid container spacing={1.5}>
      <Grid size={{xs: 12, md: 3}}><Area title="工作负载" count={groups.workloads ?? 0} /></Grid>
      <Grid size={{xs: 12, md: 3}}><Area title="服务与网络" count={groups.network ?? 0} /></Grid>
      <Grid size={{xs: 12, md: 3}}><Area title="节点" count={groups.cluster ?? 0} /></Grid>
      <Grid size={{xs: 12, md: 3}}><Area title="存储" count={groups.storage ?? 0} /></Grid>
    </Grid>
  </Stack>;
}

function Summary({title, value, tone}: {title: string; value: number; tone: string}) {
  return <Card variant="outlined"><CardContent><Typography color="text.secondary">{title}</Typography>
    <Typography variant="h4" sx={{color: tone, mt: .5}}>{value}</Typography></CardContent></Card>;
}
function Area({title, count}: {title: string; count: number}) {
  return <Card variant="outlined"><CardContent><Typography sx={{fontWeight: 700}}>{title}</Typography>
    <Typography color="text.secondary">{count} 个已采集资源</Typography></CardContent></Card>;
}
