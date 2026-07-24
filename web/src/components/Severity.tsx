import {Chip} from "@mui/material";

const colors = {P0: "error", P1: "warning", P2: "info", P3: "default"} as const;

export function Severity({value}: {value: keyof typeof colors}) {
  return <Chip size="small" color={colors[value]} label={`${value} 严重度`} aria-label={`严重度 ${value}`} />;
}

