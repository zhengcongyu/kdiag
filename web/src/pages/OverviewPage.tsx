import {Card, CardContent, Grid, Stack, Typography} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import {api} from "../api";
import {ErrorState, LoadingState} from "../components/States";
import {Severity} from "../components/Severity";

export function OverviewPage() {
  const query = useQuery({queryKey: ["incidents"], queryFn: api.incidents});
  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  const incidents = query.data?.items ?? [];
  const counts = ["P0", "P1", "P2", "P3"].map((severity) =>
    incidents.filter((item) => item.severity === severity).length);
  const mostSevere = [...incidents].sort((a, b) => a.severity.localeCompare(b.severity))[0];
  return <Stack spacing={3}>
    <div><Typography variant="h4">集群概览</Typography>
      <Typography color="text.secondary">先看影响，再进入证据和技术细节。</Typography></div>
    <Grid container spacing={2}>
      <Grid size={{xs: 12, md: 3}}><Summary title="当前 Incident" value={incidents.length.toString()} /></Grid>
      <Grid size={{xs: 12, md: 3}}><Summary title="工作负载" value="数据覆盖中" /></Grid>
      <Grid size={{xs: 12, md: 3}}><Summary title="网络" value="静态检查可用" /></Grid>
      <Grid size={{xs: 12, md: 3}}><Summary title="存储与节点" value="规则检查可用" /></Grid>
    </Grid>
    <Grid container spacing={2}>
      <Grid size={{xs: 12, md: 5}}><Card><CardContent>
        <Typography variant="h6">严重度分布</Typography>
        <ReactECharts style={{height: 260}} option={{tooltip: {}, xAxis: {type: "category", data: ["P0","P1","P2","P3"]},
          yAxis: {type: "value", minInterval: 1}, series: [{type: "bar", data: counts, color: "#1565c0"}]}} />
      </CardContent></Card></Grid>
      <Grid size={{xs: 12, md: 7}}><Card><CardContent>
        <Typography variant="h6" gutterBottom>当前最严重故障</Typography>
        {mostSevere ? <Stack spacing={1}><Severity value={mostSevere.severity} />
          <Typography variant="h5">{mostSevere.title}</Typography><Typography>{mostSevere.summary}</Typography>
        </Stack> : <Typography color="text.secondary">当前没有 Incident。缺少采集数据时不会显示为“未发现问题”。</Typography>}
      </CardContent></Card></Grid>
    </Grid>
  </Stack>;
}

function Summary({title, value}: {title: string; value: string}) {
  return <Card><CardContent><Typography color="text.secondary">{title}</Typography>
    <Typography variant="h5">{value}</Typography></CardContent></Card>;
}

