import {
  AppBar, Box, Container, Drawer, List, ListItemButton, ListItemText,
  Toolbar, Typography
} from "@mui/material";
import {NavLink, Outlet} from "react-router-dom";

const navigation = [
  ["/", "集群概览"],
  ["/incidents", "Incidents"],
  ["/diagnose", "资源诊断"],
  ["/network", "网络诊断"],
  ["/replay", "历史回放"]
];

export function AppShell() {
  return (
    <Box sx={{display: "flex", minHeight: "100vh", bgcolor: "background.default"}}>
      <AppBar position="fixed" sx={{zIndex: (theme) => theme.zIndex.drawer + 1}}>
        <Toolbar>
          <Typography variant="h6" component="div">KDiag · 可解释 Kubernetes 诊断</Typography>
        </Toolbar>
      </AppBar>
      <Drawer variant="permanent" sx={{width: 224, "& .MuiDrawer-paper": {width: 224}}}>
        <Toolbar />
        <List component="nav" aria-label="主导航">
          {navigation.map(([to, label]) => (
            <ListItemButton key={to} component={NavLink} to={to}
              sx={{"&.active": {bgcolor: "action.selected", borderRight: 3, borderColor: "primary.main"}}}>
              <ListItemText primary={label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{flexGrow: 1, pt: 10, pb: 5}}>
        <Container maxWidth="xl"><Outlet /></Container>
      </Box>
    </Box>
  );
}

