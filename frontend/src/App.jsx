import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UserPage from './pages/UserPage';
import MasterDataPage from './pages/MasterDataPage';
import ErrorPage from './pages/ErrorPage';

export const BASE_URL = 'http://localhost:8000/api';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Core Routes */}
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/users" element={<UserPage />} />
        <Route path="/master-data" element={<MasterDataPage />} />

        {/* Error Pages */}
        <Route path="/403" element={<ErrorPage type="403" />} />
        <Route path="/404" element={<ErrorPage type="404" />} />
        <Route path="/500" element={<ErrorPage type="500" />} />

        {/* Catch-all route redirects to 404 */}
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;