import {Navigate, Route, Routes} from "react-router-dom";
import {AppShell} from "./components/AppShell";
import {DiagnosePage} from "./pages/DiagnosePage";
import {IncidentDetailPage} from "./pages/IncidentDetailPage";
import {IncidentsPage} from "./pages/IncidentsPage";
import {NetworkPage} from "./pages/NetworkPage";
import {OverviewPage} from "./pages/OverviewPage";
import {ReplayPage} from "./pages/ReplayPage";
import {ClusterPage} from "./pages/ClusterPage";
import {PolicyPage, ReportsPage, SettingsPage, TopologyPage} from "./pages/OperationsPages";

export function App() {
  return <Routes>
    <Route element={<AppShell />}>
      <Route index element={<ClusterPage />} />
      <Route path="overview" element={<OverviewPage />} />
      <Route path="cluster" element={<Navigate to="/" replace />} />
      <Route path="incidents" element={<IncidentsPage />} />
      <Route path="incidents/:id" element={<IncidentDetailPage />} />
      <Route path="diagnose" element={<DiagnosePage />} />
      <Route path="diagnose/:id" element={<DiagnosePage />} />
      <Route path="network" element={<NetworkPage />} />
      <Route path="network/:id" element={<NetworkPage />} />
      <Route path="replay" element={<ReplayPage />} />
      <Route path="policies" element={<PolicyPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="topology" element={<TopologyPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>;
}
