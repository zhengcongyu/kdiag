import {Navigate, Route, Routes} from "react-router-dom";
import {AppShell} from "./components/AppShell";
import {DiagnosePage} from "./pages/DiagnosePage";
import {IncidentDetailPage} from "./pages/IncidentDetailPage";
import {IncidentsPage} from "./pages/IncidentsPage";
import {NetworkPage} from "./pages/NetworkPage";
import {OverviewPage} from "./pages/OverviewPage";
import {ReplayPage} from "./pages/ReplayPage";
import {ClusterPage} from "./pages/ClusterPage";

export function App() {
  return <Routes>
    <Route element={<AppShell />}>
      <Route index element={<ClusterPage />} />
      <Route path="overview" element={<OverviewPage />} />
      <Route path="cluster" element={<Navigate to="/" replace />} />
      <Route path="incidents" element={<IncidentsPage />} />
      <Route path="incidents/:id" element={<IncidentDetailPage />} />
      <Route path="diagnose" element={<DiagnosePage />} />
      <Route path="network" element={<NetworkPage />} />
      <Route path="replay" element={<ReplayPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>;
}
