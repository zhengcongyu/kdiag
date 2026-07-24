import {Alert, Box, CircularProgress, Typography} from "@mui/material";

export function LoadingState({label = "正在加载诊断数据"}: {label?: string}) {
  return <Box role="status" sx={{display: "flex", gap: 2, alignItems: "center", py: 5}}>
    <CircularProgress size={24} /><Typography>{label}</Typography>
  </Box>;
}

export function EmptyState({title, detail}: {title: string; detail: string}) {
  return <Box sx={{border: "1px dashed", borderColor: "divider", borderRadius: 2, p: 5}}>
    <Typography variant="h6">{title}</Typography><Typography color="text.secondary">{detail}</Typography>
  </Box>;
}

export function ErrorState({error}: {error: Error}) {
  return <Alert severity="error"><strong>数据加载失败。</strong> {error.message}</Alert>;
}

