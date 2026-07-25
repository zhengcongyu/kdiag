import {Chip} from "@mui/material";
import {useLanguage} from "../i18n";

const colors = {P0: "error", P1: "warning", P2: "info", P3: "default"} as const;

export function Severity({value}: {value: keyof typeof colors}) {
  const {l} = useLanguage();
  return <Chip size="small" color={colors[value]} label={`${value} ${l("严重度", "severity")}`}
    aria-label={`${l("严重度", "Severity")} ${value}`} />;
}
