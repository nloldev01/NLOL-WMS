import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UserPage from './pages/UserPage';
import MasterDataPage from './pages/MasterDataPage';
import ErrorPage from './pages/ErrorPage';
import ProductPage from './pages/ProductPage';
import RawMaterialStockPage from './pages/RawMaterialStockPage';
import StockMovementPage from './pages/StockMovementPage';
import ProductStockPage from './pages/ProductStockPage';
import ProductMovementPage from './pages/ProductMovementPage';
import BatchesPage from './pages/BatchesPage';
import InventoryExplorerPage from './pages/InventoryExplorerPage';
import LPNFinderPage from './pages/LPNFinderPage';

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
        <Route path="/products" element={<ProductPage />} />
        <Route path="/stock/raw-materials" element={<RawMaterialStockPage />} />
        <Route path="/stock/raw-materials-logs" element={<StockMovementPage />} />
        <Route path="/stock/products" element={<ProductStockPage />} />
        <Route path="/stock/product-logs" element={<ProductMovementPage />} />
        <Route path="/stock/batches" element={<BatchesPage />} />
        <Route path="/stock/inventory-explorer" element={<InventoryExplorerPage />} />
        <Route path="/stock/lpn-finder" element={<LPNFinderPage />} />

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