import {useMemo, useState} from "react";
import {keepPreviousData, useMutation, useQuery} from "@tanstack/react-query";
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Divider, FormControl,
  IconButton, InputAdornment, MenuItem, Pagination, Paper, Select, Snackbar,
  Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, TextField, Tooltip, Typography
} from "@mui/material";
import {
  AddOutlined, BookmarkBorderOutlined, CheckCircleOutline, ChevronRight,
  Close, CloudDoneOutlined, CloudOffOutlined, ContentCopyOutlined, DataObjectOutlined,
  ErrorOutline, ExpandLess, ExpandMore, FileDownloadOutlined, FilterAltOutlined,
  HelpOutline, HubOutlined, InfoOutlined, KeyboardArrowDown, LanOutlined,
  MoreHoriz, Refresh, Search, StorageOutlined, WarningAmberOutlined
} from "@mui/icons-material";
import {api} from "../api";
import type {
  ClusterOverview, InventoryFacets, InventoryResource, ResourceState
} from "../types";

const groups = [
  {value: "", label: "全部"},
  {value: "cluster", label: "节点"},
  {value: "workloads", label: "工作负载"},
  {value: "network", label: "服务与网络"},
  {value: "storage", label: "存储"},
  {value: "configuration", label: "配置"},
  {value: "events", label: "事件"}
];

const stateMeta: Record<ResourceState, {label: string; color: string; bg: string; Icon: typeof CheckCircleOutline}> = {
  healthy: {label: "正常", color: "#16833d", bg: "#edf8f0", Icon: CheckCircleOutline},
  warning: {label: "警告", color: "#9a5b00", bg: "#fff7e8", Icon: WarningAmberOutlined},
  critical: {label: "异常", color: "#c43228", bg: "#fff0ef", Icon: ErrorOutline},
  unknown: {label: "未知", color: "#6e6e73", bg: "#f2f2f7", Icon: HelpOutline}
};

type Filters = {
  group: string;
  namespace: string;
  state: string;
  node: string;
  label: string;
  q: string;
};

const emptyFilters: Filters = {group: "", namespace: "", state: "", node: "", label: "", q: ""};

export function ClusterPage() {
  const [filters, setFilters] = useState<Filters>(() => {
    try {
      return {...emptyFilters, ...JSON.parse(localStorage.getItem("kdiag-inventory-view") ?? "{}")};
    } catch {
      return emptyFilters;
    }
  });
  const [page, setPage] = useState(1);
  const [selectedUID, setSelectedUID] = useState("");
  const [expandedUID, setExpandedUID] = useState("");
  const [detailTab, setDetailTab] = useState(0);
  const [notice, setNotice] = useState("");

  const overview = useQuery({
    queryKey: ["cluster-overview"],
    queryFn: api.clusterOverview,
    refetchInterval: 15_000
  });
  const inventory = useQuery({
    queryKey: ["inventory", filters, page],
    queryFn: () => api.inventory({...filters, offset: (page - 1) * 50, limit: 50}),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000
  });
  const selected = useQuery({
    queryKey: ["inventory-item", selectedUID],
    queryFn: () => api.inventoryItem(selectedUID),
    enabled: selectedUID !== ""
  });
  const relatedEvents = useQuery({
    queryKey: ["inventory-events", selectedUID],
    queryFn: () => api.inventory({kind: "Event", limit: 200}),
    enabled: selectedUID !== "" && detailTab === 2
  });
  const diagnose = useMutation({
    mutationFn: (resource: InventoryResource) => api.diagnose(resource.ref),
    onSuccess: (task) => setNotice(`诊断任务已启动：${task.id.slice(0, 8)}`),
    onError: (error) => setNotice(error instanceof Error ? error.message : "无法启动诊断")
  });

  const changeFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({...current, [key]: value}));
    setPage(1);
  };
  const facets = overview.data?.facets ?? inventory.data?.facets;
  const activeResource = selected.data ?? inventory.data?.items.find((item) => item.ref.uid === selectedUID);
  const eventItems = useMemo(() => (relatedEvents.data?.items ?? []).filter((event) => {
    const involved = event.raw?.involvedObject as Record<string, unknown> | undefined;
    return involved?.uid === selectedUID;
  }), [relatedEvents.data, selectedUID]);

  return <Box sx={{minHeight: "100vh", bgcolor: "#fff"}}>
    <TopBar onRefresh={() => {
      void overview.refetch();
      void inventory.refetch();
    }} onExport={() => exportResources(inventory.data?.items ?? [])} />

    <Box sx={{px: {xs: 2.5, xl: 3.5}, pt: 2.2, pb: selectedUID ? 0 : 4}}>
      <ClusterHeading overview={overview.data} loading={overview.isLoading} />

      <ResourceRail filters={filters} facets={facets} onChange={(group) => changeFilter("group", group)} />

      <FilterBar filters={filters} facets={facets} onChange={changeFilter}
        onClear={() => { setFilters(emptyFilters); setPage(1); }}
        onSave={() => {
          localStorage.setItem("kdiag-inventory-view", JSON.stringify(filters));
          setNotice("当前筛选已保存到此浏览器");
        }} />

      {overview.error || inventory.error ? <Alert severity="error" sx={{mt: 2}}>
        无法读取集群资源：{String(overview.error ?? inventory.error)}
      </Alert> : null}

      <InventoryTable
        items={inventory.data?.items ?? []}
        loading={inventory.isLoading}
        selectedUID={selectedUID}
        expandedUID={expandedUID}
        onSelect={(resource) => {
          setSelectedUID(resource.ref.uid);
          setDetailTab(0);
        }}
        onExpand={(uid) => setExpandedUID((current) => current === uid ? "" : uid)}
        onDiagnose={(resource) => diagnose.mutate(resource)}
      />

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{minHeight: 58, px: 1}}>
        <Typography variant="body2" color="text.secondary">
          {inventory.isFetching ? "正在刷新…" :
            `显示 ${inventory.data?.total ? (page - 1) * 50 + 1 : 0}–${Math.min(page * 50, inventory.data?.total ?? 0)} 项，共 ${inventory.data?.total ?? 0} 项`}
        </Typography>
        <Pagination size="small" page={page}
          count={Math.max(1, Math.ceil((inventory.data?.total ?? 0) / 50))}
          onChange={(_, value) => setPage(value)} />
      </Stack>
    </Box>

    <DetailDrawer
      resource={activeResource}
      tab={detailTab}
      events={eventItems}
      eventsLoading={relatedEvents.isLoading}
      onTab={setDetailTab}
      onClose={() => setSelectedUID("")}
    />
    <Snackbar open={notice !== ""} autoHideDuration={3500} onClose={() => setNotice("")}
      message={notice} anchorOrigin={{vertical: "bottom", horizontal: "center"}} />
  </Box>;
}

function TopBar({onRefresh, onExport}: {onRefresh: () => void; onExport: () => void}) {
  return <Box sx={{
    height: 52, borderBottom: "1px solid", borderColor: "divider",
    display: "flex", justifyContent: "flex-end", alignItems: "center", px: 2.5, gap: 1
  }}>
    <Button size="small" variant="outlined" startIcon={<BookmarkBorderOutlined />} onClick={() => {
      const button = document.querySelector<HTMLButtonElement>("[data-save-view]");
      button?.click();
    }}>保存视图</Button>
    <Button size="small" color="inherit" startIcon={<FileDownloadOutlined />} onClick={onExport}>导出</Button>
    <Divider orientation="vertical" flexItem sx={{mx: .5, my: 1}} />
    <Tooltip title="刷新资源缓存视图"><IconButton size="small" aria-label="刷新" onClick={onRefresh}><Refresh /></IconButton></Tooltip>
    <Tooltip title="帮助"><IconButton size="small" aria-label="帮助"><HelpOutline /></IconButton></Tooltip>
    <Box sx={{width: 6, height: 6, bgcolor: "#007aff", borderRadius: "50%", alignSelf: "flex-start", mt: 1.2}} />
    <Typography variant="body2">运维团队</Typography>
    <KeyboardArrowDown sx={{fontSize: 18, color: "text.secondary"}} />
  </Box>;
}

function ClusterHeading({overview, loading}: {overview?: ClusterOverview; loading: boolean}) {
  const connection = overview?.connection;
  const connected = connection?.status === "connected";
  return <Box sx={{mb: 1.8}}>
    <Typography variant="h4" component="h1">集群全景</Typography>
    <Stack direction="row" alignItems="center" spacing={1} sx={{mt: .65, minHeight: 24}}>
      {loading ? <CircularProgress size={14} /> :
        connected ? <CloudDoneOutlined sx={{fontSize: 18, color: "success.main"}} /> :
          <CloudOffOutlined sx={{fontSize: 18, color: "error.main"}} />}
      <Typography sx={{fontWeight: 650}}>{connection?.name ?? "local-k8s"}</Typography>
      <Typography color={connected ? "success.main" : "text.secondary"}>· {connectionLabel(connection?.status)}</Typography>
      {connection?.serverVersion ? <Typography color="text.secondary">· {connection.serverVersion}</Typography> : null}
      <Typography color="text.secondary">
        上次同步：{connection?.syncedAt ? relativeTime(connection.syncedAt) : "等待首次同步"}
      </Typography>
      {connection?.message ? <Tooltip title={connection.message}><InfoOutlined sx={{fontSize: 16, color: "text.secondary"}} /></Tooltip> : null}
    </Stack>
  </Box>;
}

function ResourceRail({filters, facets, onChange}: {
  filters: Filters; facets?: InventoryFacets; onChange: (group: string) => void;
}) {
  return <Box role="tablist" aria-label="资源类型" sx={{
    display: "flex", borderBottom: "1px solid", borderColor: "divider", minHeight: 48, gap: 1
  }}>
    {groups.map((item) => {
      const active = filters.group === item.value;
      const count = item.value ? facets?.groups[item.value] : Object.values(facets?.groups ?? {}).reduce((sum, value) => sum + value, 0);
      return <Button role="tab" aria-selected={active} key={item.value || "all"} onClick={() => onChange(item.value)}
        sx={{
          borderRadius: 0, px: 1.4, minWidth: 0, color: active ? "primary.main" : "text.secondary",
          borderBottom: active ? "2px solid #007aff" : "2px solid transparent",
          fontWeight: active ? 650 : 500
        }}>
        {item.label}<Typography component="span" variant="body2" sx={{ml: .8, color: "text.secondary"}}>{count ?? 0}</Typography>
      </Button>;
    })}
  </Box>;
}

function FilterBar({filters, facets, onChange, onClear, onSave}: {
  filters: Filters;
  facets?: InventoryFacets;
  onChange: (key: keyof Filters, value: string) => void;
  onClear: () => void;
  onSave: () => void;
}) {
  return <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{
    py: 1.35, borderBottom: "1px solid", borderColor: "divider"
  }}>
    <TextField size="small" value={filters.q} onChange={(event) => onChange("q", event.target.value)}
      placeholder="搜索名称、类型、节点或 IP"
      sx={{width: 250}} slotProps={{
        htmlInput: {"aria-label": "搜索资源"},
        input: {startAdornment: <InputAdornment position="start"><Search sx={{fontSize: 18}} /></InputAdornment>}
      }} />
    <CompactSelect label="命名空间" value={filters.namespace} values={facets?.namespaces ?? []}
      onChange={(value) => onChange("namespace", value)} />
    <CompactSelect label="状态" value={filters.state}
      options={[{value: "critical", label: "异常"}, {value: "warning", label: "警告"}, {value: "unknown", label: "未知"}, {value: "healthy", label: "正常"}]}
      onChange={(value) => onChange("state", value)} />
    <CompactSelect label="节点" value={filters.node} values={facets?.nodes ?? []}
      onChange={(value) => onChange("node", value)} />
    <TextField size="small" value={filters.label} onChange={(event) => onChange("label", event.target.value)}
      placeholder="标签 app=payment" sx={{width: 180}} slotProps={{htmlInput: {"aria-label": "标签选择器"}}} />
    <Button size="small" startIcon={<AddOutlined />} sx={{color: "text.secondary"}}>添加条件</Button>
    <Button size="small" onClick={onClear}>清除</Button>
    <Button data-save-view size="small" onClick={onSave} sx={{display: "none"}}>保存</Button>
    <Box sx={{ml: "auto", display: "flex", alignItems: "center", color: "text.secondary", gap: .5}}>
      <FilterAltOutlined sx={{fontSize: 17}} />
      <Typography variant="body2">条件筛选</Typography>
    </Box>
  </Stack>;
}

function CompactSelect({label, value, values = [], options, onChange}: {
  label: string;
  value: string;
  values?: string[];
  options?: {value: string; label: string}[];
  onChange: (value: string) => void;
}) {
  return <FormControl size="small" sx={{minWidth: 142}}>
    <Select value={value} displayEmpty onChange={(event) => onChange(event.target.value)}
      inputProps={{"aria-label": label}}>
      <MenuItem value="">{label} · 全部</MenuItem>
      {(options ?? values.map((item) => ({value: item, label: item}))).map((item) =>
        <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
    </Select>
  </FormControl>;
}

function InventoryTable({items, loading, selectedUID, expandedUID, onSelect, onExpand, onDiagnose}: {
  items: InventoryResource[];
  loading: boolean;
  selectedUID: string;
  expandedUID: string;
  onSelect: (resource: InventoryResource) => void;
  onExpand: (uid: string) => void;
  onDiagnose: (resource: InventoryResource) => void;
}) {
  if (loading && items.length === 0) {
    return <Box sx={{height: 360, display: "grid", placeItems: "center"}}><Stack alignItems="center" spacing={1}>
      <CircularProgress size={26} /><Typography color="text.secondary">正在同步 Kubernetes 资源…</Typography>
    </Stack></Box>;
  }
  if (items.length === 0) {
    return <Box sx={{height: 320, display: "grid", placeItems: "center", borderBottom: "1px solid", borderColor: "divider"}}>
      <Stack alignItems="center" spacing={1}><Search sx={{fontSize: 32, color: "#a1a1a6"}} />
        <Typography variant="h6">没有匹配的资源</Typography>
        <Typography color="text.secondary">调整筛选条件；缺少数据不会被当作健康。</Typography>
      </Stack>
    </Box>;
  }
  return <TableContainer sx={{maxHeight: selectedUID ? "calc(100vh - 472px)" : "calc(100vh - 330px)", minHeight: 300}}>
    <Table size="small" stickyHeader aria-label="Kubernetes 资源清单"
      sx={{tableLayout: "fixed", minWidth: 1160, "& th": {whiteSpace: "nowrap"}}}>
      <TableHead><TableRow>
        <TableCell sx={{width: "24%", pl: 1.2}}>资源</TableCell>
        <TableCell sx={{width: "10%"}}>类型</TableCell>
        <TableCell sx={{width: "10%"}}>命名空间</TableCell>
        <TableCell sx={{width: "12%"}}>就绪 / 状态</TableCell>
        <TableCell sx={{width: "11%"}}>节点 / IP</TableCell>
        <TableCell sx={{width: "8%"}}>创建时间</TableCell>
        <TableCell sx={{width: "13%"}}>所有者</TableCell>
        <TableCell sx={{width: "9%"}}>最近事件</TableCell>
        <TableCell align="right" sx={{width: 44}} />
      </TableRow></TableHead>
      <TableBody>{items.map((resource) => {
        const expanded = expandedUID === resource.ref.uid;
        const selected = selectedUID === resource.ref.uid;
        return <ResourceRows key={resource.ref.uid} resource={resource} expanded={expanded}
          selected={selected} onSelect={onSelect} onExpand={onExpand} onDiagnose={onDiagnose} />;
      })}</TableBody>
    </Table>
  </TableContainer>;
}

function ResourceRows({resource, expanded, selected, onSelect, onExpand, onDiagnose}: {
  resource: InventoryResource;
  expanded: boolean;
  selected: boolean;
  onSelect: (resource: InventoryResource) => void;
  onExpand: (uid: string) => void;
  onDiagnose: (resource: InventoryResource) => void;
}) {
  const meta = stateMeta[resource.state];
  const owner = resource.owners?.find((item) => item.controller) ?? resource.owners?.[0];
  const hasExplanation = resource.state !== "healthy";
  return <>
    <TableRow hover selected={selected} onClick={() => onSelect(resource)}
      sx={{
        cursor: "pointer",
        "&.Mui-selected": {bgcolor: "#f0f6ff"},
        "& > td": {borderColor: resource.state === "critical" && expanded ? "#f3b5af" : "divider"}
      }}>
      <TableCell sx={{pl: .5}}>
        <Stack direction="row" alignItems="center" spacing={.7}>
          <IconButton size="small" aria-label={expanded ? "收起解释" : "展开解释"}
            onClick={(event) => { event.stopPropagation(); onExpand(resource.ref.uid); }}
            disabled={!hasExplanation && !(resource.relations?.length)}>
            {expanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
          </IconButton>
          <ResourceIcon kind={resource.ref.kind} />
          <Typography noWrap sx={{fontWeight: 550, maxWidth: 260}}>{resource.ref.name}</Typography>
          {resource.ref.kind === "Service" && typeof resource.spec?.type === "string" ?
            <Chip label={resource.spec.type} size="small" sx={{height: 20, fontSize: 11}} /> : null}
        </Stack>
      </TableCell>
      <TableCell>{resource.ref.kind}</TableCell>
      <TableCell>{resource.ref.namespace || "集群级"}</TableCell>
      <TableCell><StateLabel resource={resource} /></TableCell>
      <TableCell><Typography variant="body2">{resource.node || "—"}</Typography>
        {resource.ip ? <Typography variant="caption" color="text.secondary">{resource.ip}</Typography> : null}</TableCell>
      <TableCell>{resource.createdAt ? relativeTime(resource.createdAt) : "—"}</TableCell>
      <TableCell><Typography variant="body2" color={owner ? "primary.main" : "text.secondary"} noWrap title={owner ? `${owner.kind}/${owner.name}` : ""}>
        {owner ? `${owner.kind}/${owner.name}` : "—"}
      </Typography></TableCell>
      <TableCell><Typography variant="body2" color={resource.recentEvent ? "text.primary" : "text.secondary"} noWrap title={resource.recentEvent}>
        {resource.recentEvent || "—"}
      </Typography>{resource.recentEventAt ? <Typography variant="caption" color="text.secondary">{relativeTime(resource.recentEventAt)}</Typography> : null}</TableCell>
      <TableCell align="right"><IconButton size="small" aria-label="更多操作" onClick={(event) => event.stopPropagation()}><MoreHoriz /></IconButton></TableCell>
    </TableRow>
    <TableRow sx={{bgcolor: meta.bg}}>
      <TableCell colSpan={9} sx={{p: 0, borderBottom: expanded ? "1px solid #f3b5af" : 0}}>
        <Collapse in={expanded} timeout={180} unmountOnExit>
          <Explanation resource={resource} onDiagnose={onDiagnose} />
        </Collapse>
      </TableCell>
    </TableRow>
  </>;
}

function Explanation({resource, onDiagnose}: {
  resource: InventoryResource; onDiagnose: (resource: InventoryResource) => void;
}) {
  const relations = resource.relations ?? [];
  const missing = resource.state === "unknown";
  return <Box sx={{p: 2, display: "grid", gridTemplateColumns: "1.15fr 1fr auto", gap: 3, borderLeft: "1px solid #f3b5af", borderRight: "1px solid #f3b5af"}}>
    <Box><Typography sx={{fontWeight: 650, mb: .5}}>问题解释</Typography>
      <Typography>{resource.summary || "该资源需要进一步检查。"}</Typography>
      <Typography sx={{fontWeight: 650, mt: 1.2, mb: .4}}>建议操作</Typography>
      <Typography variant="body2">1. 查看结构化状态、Condition 和最近事件。</Typography>
      <Typography variant="body2">2. 沿所有者与关联资源检查影响范围。</Typography>
      <Typography variant="body2">3. 修复后重新确认 Ready 状态与服务端点。</Typography>
    </Box>
    <Box sx={{borderLeft: "1px solid", borderColor: "divider", pl: 3}}>
      <Typography sx={{fontWeight: 650, mb: .5}}>当前证据</Typography>
      <Typography variant="body2">• 资源状态：{resource.stateText}</Typography>
      <Typography variant="body2">• 就绪数量：{resource.ready || "没有结构化计数"}</Typography>
      <Typography variant="body2">• 关联资源：{relations.length} 个</Typography>
      <Typography sx={{fontWeight: 650, mt: 1.2, mb: .4}}>缺失数据</Typography>
      <Typography variant="body2" color={missing ? "warning.main" : "text.secondary"}>
        {missing ? "此资源类型尚无健康判定规则，不能宣称正常。" : "主动流量探测默认关闭；当前结论仅基于 API 状态。"}
      </Typography>
    </Box>
    <Stack spacing={1} justifyContent="center">
      <Button variant="contained" startIcon={<HubOutlined />} onClick={() => onDiagnose(resource)}>解释此问题</Button>
      <Button variant="outlined" onClick={() => onDiagnose(resource)}>查看诊断报告</Button>
    </Stack>
  </Box>;
}

function DetailDrawer({resource, tab, events, eventsLoading, onTab, onClose}: {
  resource?: InventoryResource;
  tab: number;
  events: InventoryResource[];
  eventsLoading: boolean;
  onTab: (value: number) => void;
  onClose: () => void;
}) {
  if (!resource) return null;
  return <Paper square elevation={6} sx={{
    position: "sticky", bottom: 0, zIndex: 8, height: 252, borderTop: "1px solid", borderColor: "divider",
    boxShadow: "0 -8px 24px rgba(0,0,0,.08)"
  }}>
    <Stack direction="row" alignItems="center" sx={{height: 44, px: 2, borderBottom: "1px solid", borderColor: "divider"}}>
      <Typography sx={{fontWeight: 650}}>{resource.ref.name}</Typography>
      <Typography color="text.secondary" sx={{ml: .6}}>({resource.ref.kind})</Typography>
      <StateChip state={resource.state} text={resource.stateText} />
      <Typography variant="body2" color="text.secondary" sx={{ml: 2}}>命名空间：{resource.ref.namespace || "集群级"}</Typography>
      <Box sx={{ml: "auto"}} />
      <Tooltip title="复制资源 UID"><IconButton size="small" onClick={() => void navigator.clipboard.writeText(resource.ref.uid)}><ContentCopyOutlined fontSize="small" /></IconButton></Tooltip>
      <IconButton size="small" aria-label="收起详情"><ExpandLess /></IconButton>
      <IconButton size="small" aria-label="关闭详情" onClick={onClose}><Close /></IconButton>
    </Stack>
    <Tabs value={tab} onChange={(_, value) => onTab(value)} sx={{px: 1.5, minHeight: 38, "& .MuiTab-root": {minHeight: 38, py: 0}}}>
      <Tab label="资源详情" /><Tab label={`关系 ${resource.relations?.length ?? 0}`} />
      <Tab label={`事件 ${events.length}`} /><Tab label="YAML / JSON" />
    </Tabs>
    <Box sx={{height: 164, overflow: "auto", px: 2, py: 1.2}}>
      {tab === 0 ? <ResourceDetails resource={resource} /> : null}
      {tab === 1 ? <Relations resource={resource} /> : null}
      {tab === 2 ? <Events items={events} loading={eventsLoading} /> : null}
      {tab === 3 ? <RawObject resource={resource} /> : null}
    </Box>
  </Paper>;
}

function ResourceDetails({resource}: {resource: InventoryResource}) {
  const entries = [
    ["名称", resource.ref.name], ["类型", resource.ref.kind], ["API 版本", resource.apiVersion || "—"],
    ["命名空间", resource.ref.namespace || "集群级"], ["状态", resource.stateText],
    ["就绪", resource.ready || "未提供"], ["节点", resource.node || "—"], ["IP 地址", resource.ip || "—"],
    ["创建时间", resource.createdAt ? new Date(resource.createdAt).toLocaleString() : "—"],
    ["资源版本", resource.resourceVersion || "—"], ["UID", resource.ref.uid],
    ["标签", Object.entries(resource.labels ?? {}).map(([key, value]) => `${key}=${value}`).join(", ") || "—"]
  ];
  return <Box sx={{display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", columnGap: 3, rowGap: .6}}>
    {entries.map(([label, value]) => <Box key={label} sx={{display: "grid", gridTemplateColumns: "86px 1fr", minWidth: 0}}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" noWrap title={value}>{value}</Typography>
    </Box>)}
    <Alert severity="info" icon={<InfoOutlined />} sx={{gridColumn: "1 / -1", py: 0, mt: .5}}>
      数据来自 Kubernetes API Informer 缓存；不读取 Secret 内容。未知状态不等于健康。
    </Alert>
  </Box>;
}

function Relations({resource}: {resource: InventoryResource}) {
  const items = [
    ...(resource.owners ?? []).map((owner) => ({type: "所有者", name: `${owner.kind}/${owner.name}`, uid: owner.uid})),
    ...(resource.relations ?? []).map((relation) => ({type: relationName(relation.type), name: `${relation.resource.kind}/${relation.resource.name}`, uid: relation.resource.uid}))
  ];
  if (items.length === 0) return <Typography color="text.secondary">当前快照中没有可确认的直接关系。</Typography>;
  return <Stack divider={<Divider flexItem />}>{items.map((item) => <Stack key={`${item.type}-${item.uid}`} direction="row" py={.7}>
    <Typography sx={{width: 120}} color="text.secondary">{item.type}</Typography>
    <Typography>{item.name}</Typography><Typography variant="body2" color="text.secondary" sx={{ml: 2}}>{item.uid}</Typography>
  </Stack>)}</Stack>;
}

function Events({items, loading}: {items: InventoryResource[]; loading: boolean}) {
  if (loading) return <CircularProgress size={22} />;
  if (items.length === 0) return <Typography color="text.secondary">缓存中没有与该 UID 直接关联的 Event；这不代表资源一定正常。</Typography>;
  return <Stack divider={<Divider flexItem />}>{items.map((item) => <Box key={item.ref.uid} py={.6}>
    <Stack direction="row" gap={1}><StateChip state={item.state} text={String(item.raw?.reason ?? item.stateText)} />
      <Typography variant="body2" color="text.secondary">{relativeTime(item.observed)}</Typography></Stack>
    <Typography variant="body2" sx={{mt: .3}}>{String(item.raw?.message ?? "")}</Typography>
  </Box>)}</Stack>;
}

function RawObject({resource}: {resource: InventoryResource}) {
  return <Box sx={{bgcolor: "#f7f7f9", borderRadius: 1.5, p: 1.2, border: "1px solid", borderColor: "divider"}}>
    <Stack direction="row" justifyContent="space-between" mb={1}>
      <Typography variant="body2" sx={{fontWeight: 650}}>已脱敏的 Kubernetes 对象</Typography>
      <Typography variant="caption" color="text.secondary">Secret 内容从不采集；敏感注解已过滤</Typography>
    </Stack>
    <pre style={{fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap"}}>{JSON.stringify(resource.raw ?? {}, null, 2)}</pre>
  </Box>;
}

function ResourceIcon({kind}: {kind: string}) {
  if (kind === "Service" || kind === "EndpointSlice" || kind === "Ingress" || kind === "NetworkPolicy") {
    return <LanOutlined sx={{fontSize: 19, color: "#007aff"}} />;
  }
  if (kind.includes("Volume") || kind === "StorageClass") {
    return <StorageOutlined sx={{fontSize: 19, color: "#007aff"}} />;
  }
  return <DataObjectOutlined sx={{fontSize: 19, color: "#007aff"}} />;
}

function StateLabel({resource}: {resource: InventoryResource}) {
  const meta = stateMeta[resource.state];
  return <Stack direction="row" alignItems="center" spacing={.6} sx={{color: meta.color}}>
    <meta.Icon sx={{fontSize: 17}} />
    <Typography variant="body2" color="inherit">{resource.ready ? `${resource.ready} ` : ""}{resource.stateText}</Typography>
  </Stack>;
}

function StateChip({state, text}: {state: ResourceState; text: string}) {
  const meta = stateMeta[state];
  return <Chip size="small" icon={<meta.Icon />} label={text} sx={{
    ml: 1, height: 24, color: meta.color, bgcolor: meta.bg,
    "& .MuiChip-icon": {fontSize: 15, color: meta.color}
  }} />;
}

function connectionLabel(status?: string) {
  switch (status) {
  case "connected": return "已连接";
  case "syncing": return "同步中";
  case "degraded": return "连接降级";
  default: return "未连接";
  }
}

function relationName(type: string) {
  const names: Record<string, string> = {
    "owned-by": "所有者", "represented-by": "由 EndpointSlice 表示",
    "selects": "选择 Pod", "represents": "表示 Service"
  };
  return names[type] ?? type;
}

function relativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "未知";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}

function exportResources(items: InventoryResource[]) {
  const blob = new Blob([JSON.stringify(items, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `kdiag-inventory-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
