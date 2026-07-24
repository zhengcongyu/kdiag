import {Box, Divider, List, ListItemButton, ListItemIcon, ListItemText, MenuItem, Select, Stack, Typography} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {
  AccountTreeOutlined, AnalyticsOutlined, BugReportOutlined, DashboardOutlined,
  DnsOutlined, HistoryOutlined, HubOutlined, NotificationsNoneOutlined,
  PolicyOutlined, SettingsOutlined, TroubleshootOutlined
} from "@mui/icons-material";
import {NavLink, Outlet} from "react-router-dom";
import {api} from "../api";
import {useLanguage} from "../i18n";

const navigation = [
  ["/", "cluster", DashboardOutlined],
  ["/diagnose", "diagnose", TroubleshootOutlined],
  ["/incidents", "incidents", NotificationsNoneOutlined],
  ["/network", "network", HubOutlined],
  ["/replay", "replay", HistoryOutlined],
  ["/overview", "overview", AnalyticsOutlined]
] as const;

export function AppShell() {
  const {language, setLanguage, t} = useLanguage();
  const cluster = useQuery({
    queryKey: ["cluster-overview"],
    queryFn: api.clusterOverview,
    staleTime: 10_000
  });
  const connection = cluster.data?.connection;
  const connected = connection?.status === "connected";
  return (
    <Box sx={{display: "flex", minHeight: "100vh", bgcolor: "background.default"}}>
      <Box component="aside" sx={{
        width: 188, flexShrink: 0, borderRight: "1px solid", borderColor: "divider",
        bgcolor: "#fbfbfd", position: "fixed", inset: "0 auto 0 0", display: "flex", flexDirection: "column",
        zIndex: 10
      }}>
        <Box sx={{height: 60, px: 2.25, display: "flex", alignItems: "center", gap: 1.1}}>
          <Box sx={{width: 28, height: 28, borderRadius: 2, bgcolor: "primary.main", color: "white", display: "grid", placeItems: "center"}}>
            <DnsOutlined sx={{fontSize: 18}} />
          </Box>
          <Typography variant="h6" sx={{fontSize: 19}}>KDiag</Typography>
        </Box>
        <List component="nav" aria-label="???" sx={{px: 1, pt: 1}}>
          {navigation.map(([to, key, Icon]) => (
            <ListItemButton key={to as string} component={NavLink} to={to as string} end={to === "/"}
              sx={{borderRadius: 1.5, minHeight: 42, mb: .35, px: 1.25,
                "&.active": {bgcolor: "#e8f1ff", color: "primary.main"},
                "&:focus-visible": {outline: "2px solid #007aff", outlineOffset: 1}}}>
              <ListItemIcon sx={{minWidth: 34, color: "inherit"}}><Icon sx={{fontSize: 19}} /></ListItemIcon>
              <ListItemText primary={t(key)} slotProps={{primary: {fontSize: 14, fontWeight: 550}}} />
            </ListItemButton>
          ))}
        </List>
        <Divider sx={{mx: 1.5, my: 1}} />
        <List sx={{px: 1}}>
          {([
            ["/policies", "policies", PolicyOutlined],
            ["/reports", "reports", BugReportOutlined],
            ["/topology", "topology", AccountTreeOutlined],
            ["/settings", "settings", SettingsOutlined]
          ] as const).map(([to, key, Icon]) => (
            <ListItemButton key={to as string} component={NavLink} to={to as string}
              sx={{borderRadius: 1.5, "&.active": {bgcolor: "#e8f1ff", color: "primary.main"}}}>
              <ListItemIcon sx={{minWidth: 34, color: "inherit"}}><Icon sx={{fontSize: 19}} /></ListItemIcon>
              <ListItemText primary={t(key)} />
            </ListItemButton>
          ))}
        </List>
        <Box sx={{mt: "auto", p: 1.5}}>
          <Box sx={{p: 1.2, border: "1px solid", borderColor: "divider", borderRadius: 1.5, bgcolor: "#fff", mb: 1}}>
            <Stack direction="row" alignItems="center" gap={.7}>
              <Box sx={{width: 8, height: 8, borderRadius: "50%", bgcolor: connected ? "success.main" : "warning.main"}} />
              <Typography variant="body2" sx={{fontWeight: 650}} noWrap>{connection?.name ?? "local-k8s"}</Typography>
            </Stack>
            <Typography variant="caption" color={connected ? "success.main" : "text.secondary"}>
              {connected ? t("connected") : connection?.status === "syncing" ? t("syncing") : t("unavailable")}
            </Typography>
            <Typography component="div" variant="caption" color="text.secondary" sx={{mt: .5}}>
              {connection?.serverVersion ?? "??????"}
            </Typography>
          </Box>
          <Select size="small" fullWidth value={language} aria-label={t("language")}
            onChange={(event) => setLanguage(event.target.value as "zh-CN" | "en")} sx={{mb: 1, fontSize: 12}}>
            <MenuItem value="zh-CN">{t("chinese")}</MenuItem>
            <MenuItem value="en">{t("english")}</MenuItem>
          </Select>
          <Typography variant="caption" color="text.secondary">KDiag v0.4.0</Typography>
        </Box>
      </Box>
      <Box component="main" sx={{ml: "188px", minWidth: 0, width: "calc(100% - 188px)"}}>
        <Outlet />
      </Box>
    </Box>
  );
}
