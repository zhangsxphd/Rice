import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { DeviceManagementPage } from './pages/DeviceManagementPage.jsx';
import { ExportPage } from './pages/ExportPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/devices" element={<DeviceManagementPage />} />
        <Route path="/exports" element={<ExportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<DashboardPage />} />
      </Routes>
    </BrowserRouter>
  );
}
