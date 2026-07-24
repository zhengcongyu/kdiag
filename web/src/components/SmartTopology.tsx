import {useMemo, useState} from "react";
import {Background, Controls, MarkerType, ReactFlow} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Box, Button, Card, CardContent, Chip, Divider, Stack, Typography
} from "@mui/material";
import {
  CheckCircleOutline, ErrorOutline, HelpOutline, ReportProblemOutlined
} from "@mui/icons-material";
import type {GraphSnapshot, ResourceState, TopologyNodeState} from "../types";

const meta: Record<string, {label: string; color: string; bg: string; Icon: typeof CheckCircleOutline}> = {
  critical: {label: "故障", color: "#c43228", bg: "#fff0ef", Icon: ErrorOutline},
  warning: {label: "需关注", color: "#9a5b00", bg: "#fff7e8", Icon: ReportProblemOutlined},
  suspected: {label: "疑似", color: "#9a5b00", bg: "#fff7e8", Icon: ReportProblemOutlined},
  affected: {label: "受影响", color: "#6f42c1", bg: "#f5f0ff", Icon: ReportProblemOutlined},
  healthy: {label: "健康", color: "#16833d", bg: "#edf8f0", Icon: CheckCircleOutline},
  unknown: {label: "未知", color: "#6e6e73", bg: "#f2f2f7", Icon: HelpOutline},
  observed: {label: "已采集", color: "#44617b", bg: "#eef4f8", Icon: HelpOutline}
};

export function SmartTopology({topology, height = 520}: {topology?: GraphSnapshot; height?: number}) {
  const [focusIssues, setFocusIssues] = useState(false);
  const [selectedUID, setSelectedUID] = useState("");
  const states = useMemo(() => new Map(
    (topology?.nodeStates ?? []).map((item) => [item.resource.uid, item])
  ), [topology]);
  const visibleUIDs = useMemo(() => {
    if (!focusIssues) return new Set((topology?.nodes ?? []).map((item) => item.uid));
    const issues = new Set((topology?.nodeStates ?? [])
      .filter((item) => !["healthy"].includes(item.state)).map((item) => item.resource.uid));
    (topology?.edges ?? []).forEach((edge) => {
      if (issues.has(edge.from.uid) || issues.has(edge.to.uid)) {
        issues.add(edge.from.uid);
        issues.add(edge.to.uid);
      }
    });
    return issues;
  }, [focusIssues, topology]);
  const nodes = useMemo(() => (topology?.nodes ?? []).filter((item) => visibleUIDs.has(item.uid)).map((resource) => {
    const state = states.get(resource.uid) ?? fallbackState(resource);
    const style = meta[state.state] ?? meta.unknown;
    const column = kindColumn(resource.kind);
    const peers = (topology?.nodes ?? []).filter((item) => kindColumn(item.kind) === column);
    const row = Math.max(0, peers.findIndex((item) => item.uid === resource.uid));
    return {
      id: resource.uid,
      position: {x: column * 245, y: row * 132},
      style: {
        width: 205, border: `1.5px solid ${style.color}`, borderRadius: 16,
        background: style.bg, boxShadow: selectedUID === resource.uid ? `0 0 0 3px ${style.color}33` : "0 6px 18px rgba(0,0,0,.05)"
      },
      data: {label: <Stack spacing={.55} sx={{textAlign: "left"}}>
        <Stack direction="row" gap={.7} alignItems="center">
          <style.Icon sx={{fontSize: 17, color: style.color}} />
          <Typography variant="caption" sx={{color: style.color, fontWeight: 700}}>{style.label}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ml: "auto"}}>{resource.kind}</Typography>
        </Stack>
        <Typography noWrap sx={{fontWeight: 700}} title={resource.name}>{resource.name}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap>{state.stateText || "尚未评估"}</Typography>
      </Stack>}
    };
  }), [selectedUID, states, topology, visibleUIDs]);
  const edges = useMemo(() => (topology?.edges ?? [])
    .filter((edge) => visibleUIDs.has(edge.from.uid) && visibleUIDs.has(edge.to.uid))
    .map((edge, index) => {
      const unhealthy = states.get(edge.from.uid)?.state === "critical" || states.get(edge.to.uid)?.state === "critical";
      return {
        id: `${index}-${edge.from.uid}-${edge.to.uid}`, source: edge.from.uid, target: edge.to.uid,
        label: relationLabel(edge.relation), markerEnd: {type: MarkerType.ArrowClosed},
        animated: false, style: {stroke: unhealthy ? "#c43228" : "#a8adb7", strokeWidth: unhealthy ? 2.2 : 1.2},
        labelStyle: {fontSize: 11, fill: unhealthy ? "#c43228" : "#6e6e73"}
      };
    }), [states, topology, visibleUIDs]);
  const selected = states.get(selectedUID);

  if (!topology?.nodes?.length) {
    return <Card variant="outlined"><CardContent>
      <Typography color="text.secondary">当前没有可展示的拓扑数据。缺少关系不代表资源一定没有外部依赖。</Typography>
    </CardContent></Card>;
  }
  return <Stack spacing={1.5}>
    <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
      {Object.entries(meta).filter(([key]) => ["critical", "warning", "affected", "healthy", "observed", "unknown"].includes(key))
        .map(([key, item]) => <Chip key={key} size="small" icon={<item.Icon />}
          label={item.label} sx={{color: item.color, bgcolor: item.bg, "& .MuiChip-icon": {color: item.color}}} />)}
      <Button size="small" variant={focusIssues ? "contained" : "outlined"} sx={{ml: "auto"}}
        onClick={() => setFocusIssues((value) => !value)}>
        {focusIssues ? "显示完整局部图" : "只看故障链路"}
      </Button>
    </Stack>
    <Box sx={{height, border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden", bgcolor: "#fbfcfe"}}>
      <ReactFlow nodes={nodes} edges={edges} fitView minZoom={.35} maxZoom={1.5}
        onNodeClick={(_, node) => setSelectedUID(node.id)} aria-label="资源健康拓扑图">
        <Background gap={22} size={1} color="#e7e9ee" /><Controls />
      </ReactFlow>
    </Box>
    {selected ? <Card variant="outlined"><CardContent>
      <Stack direction={{xs: "column", md: "row"}} gap={2} alignItems={{md: "center"}}>
        <Box sx={{flex: 1}}>
          <Typography variant="overline">所选资源</Typography>
          <Typography variant="h6">{selected.resource.kind}/{selected.resource.name}</Typography>
          <Typography color="text.secondary">{selected.summary || selected.stateText}</Typography>
        </Box>
        <Divider orientation="vertical" flexItem />
        <Typography sx={{fontWeight: 650}}>状态：{selected.stateText}</Typography>
      </Stack>
    </CardContent></Card> : null}
  </Stack>;
}

function fallbackState(resource: GraphSnapshot["nodes"][number]): TopologyNodeState {
  return {resource, state: "unknown" as ResourceState, stateText: "尚未评估"};
}

function kindColumn(kind: string) {
  if (kind === "Deployment") return 0;
  if (kind === "ReplicaSet") return 1;
  if (kind === "Pod") return 2;
  if (kind === "Service" || kind === "PersistentVolumeClaim") return 3;
  if (kind === "EndpointSlice" || kind === "Node") return 4;
  return 2;
}

function relationLabel(value: string) {
  return ({
    owns: "拥有", selects: "选择", "represented-by": "对应端点",
    "scheduled-on": "调度到", mounts: "挂载"
  } as Record<string, string>)[value] ?? value;
}
