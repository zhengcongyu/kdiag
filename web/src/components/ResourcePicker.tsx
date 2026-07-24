import {Alert, MenuItem, Skeleton, TextField} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {api} from "../api";
import type {InventoryResource} from "../types";

interface ResourcePickerProps {
  kind: string;
  namespace?: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (resource?: InventoryResource) => void;
}

export function ResourcePicker({
  kind, namespace, label, value, disabled, onChange
}: ResourcePickerProps) {
  const query = useQuery({
    queryKey: ["resource-options", kind, namespace ?? ""],
    queryFn: () => api.inventory({kind, namespace, limit: 500}),
    enabled: Boolean(kind) && (kind === "Node" || Boolean(namespace)),
    refetchInterval: 15_000
  });

  if (query.isLoading) {
    return <Skeleton variant="rounded" height={56} aria-label={`${label}加载中`} />;
  }
  if (query.error) {
    return <Alert severity="error">无法读取{label}：{(query.error as Error).message}</Alert>;
  }

  const items = query.data?.items ?? [];
  return (
    <TextField
      select
      fullWidth
      required
      label={label}
      value={value}
      disabled={disabled || items.length === 0}
      helperText={items.length === 0 ? `当前集群没有匹配的 ${kind}` : `实时读取，共 ${items.length} 项`}
      onChange={(event) => onChange(items.find((item) => item.ref.uid === event.target.value))}
      slotProps={{select: {"aria-label": label}}}
    >
      {items.map((item) => (
        <MenuItem key={item.ref.uid} value={item.ref.uid}>
          {item.ref.name}{item.node ? ` · ${item.node}` : ""}
        </MenuItem>
      ))}
    </TextField>
  );
}
