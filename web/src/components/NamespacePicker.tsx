import {Alert, MenuItem, Skeleton, TextField} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {api} from "../api";
import {useLanguage} from "../i18n";

interface NamespacePickerProps {
  value: string;
  disabled?: boolean;
  onChange: (namespace: string) => void;
}

export function NamespacePicker({value, disabled, onChange}: NamespacePickerProps) {
  const {language} = useLanguage();
  const query = useQuery({
    queryKey: ["cluster-overview"],
    queryFn: api.clusterOverview,
    refetchInterval: 15_000
  });
  if (query.isLoading) return <Skeleton variant="rounded" height={56} aria-label="Namespace 加载中" />;
  if (query.error) return <Alert severity="error">{language === "zh-CN" ? "无法读取 Namespace：" : "Unable to read Namespaces: "}{(query.error as Error).message}</Alert>;
  const namespaces = query.data?.facets.namespaces ?? [];
  return (
    <TextField
      select
      fullWidth
      label="Namespace"
      value={value}
      disabled={disabled || namespaces.length === 0}
      helperText={disabled ? (language === "zh-CN" ? "集群级资源不需要 Namespace" : "Cluster-scoped resources do not use a Namespace") :
        (language === "zh-CN" ? `实时读取，共 ${namespaces.length} 项` : `${namespaces.length} live options`)}
      onChange={(event) => onChange(event.target.value)}
      inputProps={{"aria-label": "Namespace"}}
    >
      {namespaces.map((namespace) => <MenuItem key={namespace} value={namespace}>{namespace}</MenuItem>)}
    </TextField>
  );
}
