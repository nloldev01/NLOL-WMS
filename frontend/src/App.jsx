import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
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
import BulkPurchasePage from './pages/BulkPurchasePage';
import BatchesPage from './pages/BatchesPage';
import InventoryExplorerPage from './pages/InventoryExplorerPage';
import LPNFinderPage from './pages/LPNFinderPage';
import ProductRecipePage from './pages/ProductRecipePage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import ProductionDashboardPage from './pages/ProductionDashboardPage';
import FirstFillTestPage from './pages/FirstFillTestPage';
import KettlesDashboardPage from './pages/KettlesDashboardPage';
import VerticalTanksDashboardPage from './pages/VerticalTanksDashboardPage';
import StorageTanksDashboardPage from './pages/StorageTanksDashboardPage';
import SalesDashboardPage from './pages/SalesDashboardPage';
import SalesCustomersPage from './pages/SalesCustomersPage';
import SalesBillsPage from './pages/SalesBillsPage';
import KettleLogsPage from './pages/KettleLogsPage';
import FinishedProductsPage from './pages/FinishedProductsPage';
import FinishedProductStockPage from './pages/FinishedProductStockPage';
import FinishedProductMovementPage from './pages/FinishedProductMovementPage';
import PackagingOrdersPage from './pages/PackagingOrdersPage';
import AssemblyOrdersPage from './pages/AssemblyOrdersPage'
import RefillOrdersPage from './pages/RefillOrdersPage';
import DispatchOrdersPage from './pages/DispatchOrdersPage';
import DealerOrdersPage from './pages/DealerOrdersPage';
import DealerStockPage from './pages/DealerStockPage';
import DealerSalesPage from './pages/DealerSalesPage';
import RolesPermissionsPage from './pages/RolesPermissionsPage';
import BackupRestorePage from './pages/BackupRestorePage';
import PalletsPage from './pages/PalletsPage';
import ScannerPage from './pages/ScannerPage';

const PR = ({ module, minAccess, children }) => (
  <ProtectedRoute module={module} minAccess={minAccess}>{children}</ProtectedRoute>
)

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<PR>{<ChangePasswordPage />}</PR>} />

        {/* Dashboard — all authenticated users */}
        <Route path="/dashboard" element={<PR module="dashboard"><DashboardPage /></PR>} />

        {/* User management — superadmin only */}
        <Route path="/users"       element={<PR module="users"><UserPage /></PR>} />
        <Route path="/users/roles" element={<PR module="users"><RolesPermissionsPage /></PR>} />

        {/* System — superadmin only (gated inside the page) */}
        <Route path="/system/backups" element={<PR><BackupRestorePage /></PR>} />

        {/* Master data */}
        <Route path="/master-data" element={<PR module="master_data"><MasterDataPage /></PR>} />
        <Route path="/products"    element={<PR module="master_data"><ProductPage /></PR>} />

        {/* Raw material stock */}
        <Route path="/stock/raw-materials"      element={<PR module="raw_material_stock"><RawMaterialStockPage /></PR>} />
        <Route path="/stock/raw-materials-logs" element={<PR module="raw_material_stock"><StockMovementPage /></PR>} />

        {/* Base product stock */}
        <Route path="/stock/products"    element={<PR module="base_product_stock"><ProductStockPage /></PR>} />
        <Route path="/stock/product-logs" element={<PR module="base_product_stock"><ProductMovementPage /></PR>} />

        {/* Bulk purchase entry — spans raw material / base product / finished product stock */}
        <Route path="/stock/bulk-purchase" element={<PR><BulkPurchasePage /></PR>} />

        {/* Inventory tools */}
        <Route path="/stock/batches"            element={<PR module="inventory_tools"><BatchesPage /></PR>} />
        <Route path="/stock/inventory-explorer" element={<PR module="inventory_tools"><InventoryExplorerPage /></PR>} />
        <Route path="/stock/lpn-finder"         element={<PR module="inventory_tools"><LPNFinderPage /></PR>} />
        <Route path="/inventory/pallets"        element={<PR module="inventory_core"><PalletsPage /></PR>} />
        <Route path="/inventory/scanner"        element={<PR module="inventory_core"><ScannerPage /></PR>} />

        {/* Production */}
        <Route path="/production/dashboard"     element={<PR module="production"><ProductionDashboardPage /></PR>} />
        <Route path="/production/kettles"       element={<PR module="production"><KettlesDashboardPage /></PR>} />
        <Route path="/production/vertical-tanks" element={<PR module="production"><VerticalTanksDashboardPage /></PR>} />
        <Route path="/production/storage-tanks" element={<PR module="production"><StorageTanksDashboardPage /></PR>} />
        <Route path="/production/recipes"       element={<PR module="production_recipes"><ProductRecipePage /></PR>} />
        <Route path="/production/kettle-logs"   element={<PR module="production"><KettleLogsPage /></PR>} />
        <Route path="/production/first-fill-test" element={<PR module="first_fill_test"><FirstFillTestPage /></PR>} />

        {/* Packaging / Finished products */}
        <Route path="/packaging/finished-products"      element={<PR module="packaging"><FinishedProductsPage /></PR>} />
        <Route path="/packaging/orders"                 element={<PR module="packaging"><PackagingOrdersPage /></PR>} />
        <Route path="/packaging/assembly"               element={<PR module="assembly"><AssemblyOrdersPage /></PR>} />
        <Route path="/packaging/refill-orders"          element={<PR module="refill"><RefillOrdersPage /></PR>} />
        <Route path="/packaging/finished-product-stock" element={<PR module="finished_product_stock"><FinishedProductStockPage /></PR>} />
        <Route path="/packaging/finished-product-logs"  element={<PR module="finished_product_stock"><FinishedProductMovementPage /></PR>} />

        {/* Sales */}
        <Route path="/sales" element={<Navigate to="/sales/dashboard" replace />} />
        <Route path="/sales/dashboard"  element={<PR module="sales"><SalesDashboardPage /></PR>} />
        <Route path="/sales/customers"  element={<PR module="sales"><SalesCustomersPage /></PR>} />
        <Route path="/sales/bills"      element={<PR module="sales"><SalesBillsPage /></PR>} />
        <Route path="/sales/dispatch"       element={<PR module="dispatch"><DispatchOrdersPage /></PR>} />
        <Route path="/sales/dealer-orders" element={<PR module="dispatch"><DealerOrdersPage /></PR>} />
        <Route path="/sales/dealer-stock"  element={<PR module="dispatch"><DealerStockPage /></PR>} />
        <Route path="/sales/dealer-sales"  element={<PR module="dispatch"><DealerSalesPage /></PR>} />

        {/* Error pages */}
        <Route path="/403" element={<ErrorPage type="403" />} />
        <Route path="/404" element={<ErrorPage type="404" />} />
        <Route path="/500" element={<ErrorPage type="500" />} />
        <Route path="*"    element={<Navigate to="/404" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
