import {useMemo, useState} from "react";
import {Link} from "react-router-dom";
import {
  Card, CardContent, FormControl, InputLabel, MenuItem, Pagination, Select,
  Stack, TextField, Typography
} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {api} from "../api";
import {ErrorState, LoadingState, EmptyState} from "../components/States";
import {Severity} from "../components/Severity";

export function IncidentsPage() {
  const query = useQuery({queryKey: ["incidents"], queryFn: api.incidents});
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [namespace, setNamespace] = useState("");
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);
  const namespaces = useMemo(() => Array.from(new Set(
    (query.data?.items ?? []).map((item) => item.namespace).filter((value): value is string => Boolean(value))
  )).sort(), [query.data]);
  const filtered = useMemo(() => (query.data?.items ?? []).filter((item) =>
    (severity === "all" || item.severity === severity) &&
    (status === "all" || item.status === status) &&
    (!namespace || item.namespace === namespace) &&
    (!text || `${item.title} ${item.summary}`.toLowerCase().includes(text.toLowerCase()))
  ).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [query.data, severity, status, namespace, text]);
  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  const pageItems = filtered.slice((page - 1) * 10, page * 10);
  return <Stack spacing={3}>
    <div><Typography variant="h4">Incident 列表</Typography><Typography color="text.secondary">重复异常已聚合，避免被 Event 洪水淹没。</Typography></div>
    <Stack direction="row" gap={2} flexWrap="wrap">
      <FormControl size="small" sx={{minWidth: 130}}><InputLabel>严重度</InputLabel>
        <Select label="严重度" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          {["all","P0","P1","P2","P3"].map((value) => <MenuItem key={value} value={value}>{value === "all" ? "全部" : value}</MenuItem>)}
        </Select></FormControl>
      <FormControl size="small" sx={{minWidth: 130}}><InputLabel>状态</InputLabel>
        <Select label="状态" value={status} onChange={(e) => setStatus(e.target.value)}>
          {["all","open","resolved"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </Select></FormControl>
      <TextField select size="small" label="Namespace" value={namespace}
        sx={{minWidth: 160}} onChange={(e) => setNamespace(e.target.value)}>
        <MenuItem value="">全部</MenuItem>
        {namespaces.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
      </TextField>
      <TextField size="small" label="搜索标题或摘要" value={text} onChange={(e) => setText(e.target.value)} />
    </Stack>
    {pageItems.length === 0 ? <EmptyState title="没有匹配的 Incident" detail="调整筛选条件；如果采集尚未同步，此处不会推断集群健康。" /> :
      pageItems.map((item) => <Card key={item.id} variant="outlined"><CardContent>
        <Stack direction="row" justifyContent="space-between" gap={2}>
          <div><Typography variant="h6" component={Link} to={`/incidents/${encodeURIComponent(item.id)}`}>{item.title}</Typography>
            <Typography color="text.secondary">{item.namespace || "cluster-scoped"} · 更新于 {new Date(item.updatedAt).toLocaleString()}</Typography>
            <Typography sx={{mt: 1}}>{item.summary}</Typography></div>
          <Severity value={item.severity} />
        </Stack>
      </CardContent></Card>)}
    <Pagination page={page} onChange={(_, value) => setPage(value)} count={Math.max(1, Math.ceil(filtered.length / 10))} />
  </Stack>;
}
