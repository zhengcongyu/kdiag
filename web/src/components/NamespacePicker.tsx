import {Alert, MenuItem, Skeleton, TextField} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {api} from "../api";

interface NamespacePickerProps {
  value: string;
  disabled?: boolean;
  onChange: (namespace: string) => void;
}

export function NamespacePicker({value, disabled, onChange}: NamespacePickerProps) {
  const query = useQuery({
    queryKey: ["cluster-overview"],
    queryFn: api.clusterOverview,
    refetchInterval: 15_000
  });
  if (query.isLoading) return <Skeleton variant="rounded" height={56} aria-label="Namespace 加载中" />;
  if (query.error) return <Alert severity="error">无法读取 Namespace：{(query.error as Error).message}</Alert>;
  const namespaces = query.data?.facets.namespaces ?? [];
  return (
    <TextField
      select
      fullWidth
      label="Namespace"
      value={value}
      disabled={disabled || namespaces.length === 0}
      helperText={disabled ? "集群级资源不需要 Namespace" : `实时读取，共 ${namespaces.length} 项`}
      onChange={(event) => onChange(event.target.value)}
      inputProps={{"aria-label": "Namespace"}}
    >
      {namespaces.map((namespace) => <MenuItem key={namespace} value={namespace}>{namespace}</MenuItem>)}
    </TextField>
  );
}
