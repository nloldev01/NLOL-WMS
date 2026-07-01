import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { hasAccess, getUserRole } from '../utils/api'

import {
  HomeIcon,
  DocumentDuplicateIcon,
  CubeIcon,
  ArchiveBoxIcon,
  UserGroupIcon,
  CpuChipIcon,
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
  CreditCardIcon,
  FingerPrintIcon,
  WrenchScrewdriverIcon,
  CubeTransparentIcon,
  Bars3Icon,
  XMarkIcon,
  CircleStackIcon,
} from '@heroicons/react/24/outline'

const Sidebar = () => {
  const [expandedItems, setExpandedItems] = useState({})
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handler = () => setMobileOpen(true)
    window.addEventListener('sidebar-open', handler)
    return () => window.removeEventListener('sidebar-open', handler)
  }, [])

  const iconMap = {
    dashboard: HomeIcon,
    'master-data': DocumentDuplicateIcon,
    'raw-inventories': CubeIcon,
    stocks: ArchiveBoxIcon,
    users: UserGroupIcon,
    machines: CpuChipIcon,
    products: ShoppingBagIcon,
    'purchase-orders': ClipboardDocumentListIcon,
    'counter-sales': CreditCardIcon,
    'stock-identity': FingerPrintIcon,
    production: WrenchScrewdriverIcon,
    packaging: CubeTransparentIcon,
    consumables: WrenchScrewdriverIcon,
    sales: CreditCardIcon,
    system: CircleStackIcon,
  }

  const menuData = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      path: '/dashboard',
    },
    // The consumables manager and assembly roles keep master_data view access (so
    // location & material pickers load) but shouldn't see the Master Data / Base Product pages.
    ...(hasAccess('master_data') && !['consumables_handler', 'assembly'].includes(getUserRole()) ? [
      { id: 'master-data', label: 'Master Data', path: '/master-data' },
      { id: 'products',    label: 'Base Products', path: '/products' },
    ] : []),
    // Assembly keeps base_product_stock/inventory_core read access for its own
    // pickers & production queue, but shouldn't see the whole Stocks section.
    ...((hasAccess('raw_material_stock') || hasAccess('base_product_stock') || hasAccess('inventory_tools') || hasAccess('inventory_core')) && getUserRole() !== 'assembly' ? [{
      id: 'stocks',
      label: 'Stocks',
      children: [
        ...(hasAccess('raw_material_stock') || hasAccess('base_product_stock') || hasAccess('finished_product_stock') ? [{ id: 'bulk-purchase', label: 'Bulk Purchase Entry', path: '/stock/bulk-purchase' }] : []),
        ...(hasAccess('base_product_stock')  ? [{ id: 'product-stock', label: 'Base Product Stock', path: '/stock/products' }] : []),
        ...(hasAccess('raw_material_stock')  ? [{ id: 'raw-material-stock', label: 'Raw Material Stock', path: '/stock/raw-materials' }] : []),
        ...(hasAccess('base_product_stock')  ? [{ id: 'product-stock-logs', label: 'Base Product Logs', path: '/stock/product-logs' }] : []),
        ...(hasAccess('raw_material_stock')  ? [{ id: 'raw-material-stock-logs', label: 'Raw Material Logs', path: '/stock/raw-materials-logs' }] : []),
        ...(hasAccess('inventory_tools') && getUserRole() !== 'consumables_handler' ? [{ id: 'batches', label: 'Batches', path: '/stock/batches' }] : []),
        ...(hasAccess('inventory_tools')     ? [{ id: 'inventory-explorer', label: 'Inventory Explorer', path: '/stock/inventory-explorer' }] : []),
        ...(hasAccess('inventory_tools')     ? [{ id: 'lpn-finder', label: 'LPN Finder', path: '/stock/lpn-finder' }] : []),
        ...(hasAccess('inventory_core')      ? [{ id: 'pallets', label: 'Pallets', path: '/inventory/pallets' }] : []),
        ...(hasAccess('inventory_core')      ? [{ id: 'scanner',        label: 'Scanner',        path: '/inventory/scanner' }] : []),
      ],
    }] : []),
    ...(hasAccess('users') ? [{
      id: 'users',
      label: 'Users',
      children: [
        { id: 'user-list', label: 'User List', path: '/users' },
        { id: 'user-roles', label: 'Roles & Permissions', path: '/users/roles' },
      ],
    }] : []),
    ...(hasAccess('production') || hasAccess('first_fill_test') ? [{
      id: 'production',
      label: 'Production',
      children: [
        ...(hasAccess('production') ? [
          { id: 'production-dashboard', label: 'Overview', path: '/production/dashboard' },
          { id: 'production-kettles', label: 'Kettles', path: '/production/kettles' },
          { id: 'production-vertical-tanks', label: 'Vertical Tanks', path: '/production/vertical-tanks' },
          { id: 'production-storage-tanks', label: 'Storage Tanks', path: '/production/storage-tanks' },
          ...(hasAccess('production_recipes') ? [{ id: 'recipes', label: 'Product Recipes', path: '/production/recipes' }] : []),
          { id: 'kettle-logs', label: 'Kettle Logs', path: '/production/kettle-logs' },
        ] : []),
        ...(hasAccess('first_fill_test') ? [{ id: 'first-fill-test', label: 'First Fill Test', path: '/production/first-fill-test' }] : []),
      ],
    }] : []),
    ...(hasAccess('assembly') || hasAccess('packaging') || hasAccess('finished_product_stock') ? [{
      id: 'packaging',
      label: 'Packaging',
      children: [
        ...(hasAccess('packaging')              ? [{ id: 'finished-products', label: 'Finished Products', path: '/packaging/finished-products' }] : []),
        ...(hasAccess('packaging')              ? [{ id: 'packaging-orders', label: 'Packaging Orders', path: '/packaging/orders' }] : []),
        ...(hasAccess('assembly')               ? [{ id: 'assembly-orders', label: 'Assembly', path: '/packaging/assembly' }] : []),
        ...(hasAccess('refill')                 ? [{ id: 'refill-orders',   label: 'Refill Orders', path: '/packaging/refill-orders' }] : []),
        ...(hasAccess('finished_product_stock') ? [{ id: 'finished-product-stock', label: 'FP Stock', path: '/packaging/finished-product-stock' }] : []),
        ...(hasAccess('finished_product_stock') ? [{ id: 'finished-product-logs', label: 'FP Movements', path: '/packaging/finished-product-logs' }] : []),
      ],
    }] : []),
    ...(hasAccess('consumables') ? [{
      id: 'consumables',
      label: 'Consumables Request',
      path: '/consumables',
    }] : []),
    ...(hasAccess('sales') || hasAccess('dispatch') ? [{
      id: 'sales',
      label: 'Sales',
      children: [
        ...(hasAccess('sales')    ? [{ id: 'sales-dashboard', label: 'Dashboard',      path: '/sales/dashboard' }] : []),
        ...(hasAccess('sales')    ? [{ id: 'sales-customers', label: 'Customers',       path: '/sales/customers' }] : []),
        ...(hasAccess('sales')    ? [{ id: 'sales-bills',     label: 'Sales Bills',     path: '/sales/bills' }] : []),
        ...(hasAccess('dispatch') ? [{ id: 'dispatch',        label: 'Dispatch Orders', path: '/sales/dispatch' }] : []),
        ...(hasAccess('dispatch') ? [{ id: 'dealer-orders', label: 'Dealer Orders',   path: '/sales/dealer-orders' }] : []),
        ...(hasAccess('dispatch') ? [{ id: 'dealer-stock',  label: 'Dealer Stock',    path: '/sales/dealer-stock' }] : []),
        ...(hasAccess('dispatch') ? [{ id: 'dealer-sales',  label: 'Dealer Sales',    path: '/sales/dealer-sales' }] : []),
      ],
    }] : []),
    ...(getUserRole() === 'superadmin' ? [{
      id: 'system',
      label: 'System',
      children: [
        { id: 'backups', label: 'Backup & Restore', path: '/system/backups' },
      ],
    }] : []),
  ]

  const toggleExpand = (id) => {
    setExpandedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const closeMobile = () => {
    setMobileOpen(false)
    setExpandedItems({})
  }

  const MenuItem = ({ item, isNested = false }) => {
    const hasChildren = item.children && item.children.length > 0
    const isExpanded = expandedItems[item.id]
    const IconComponent = iconMap[item.id]

    const desktopInner = (
      <>
        <span className="flex items-center justify-center w-8 h-8 rounded-md flex-shrink-0">
          {IconComponent ? <IconComponent className="w-5 h-5 text-black" /> : <div className="w-5 h-5" />}
        </span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-1 truncate">
          {item.label}
        </span>
        {hasChildren && (
          <span className={`opacity-0 group-hover:opacity-100 transition-all duration-200 text-xs ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        )}
      </>
    )

    const mobileInner = (
      <>
        <span className="flex items-center justify-center w-8 h-8 rounded-md flex-shrink-0">
          {IconComponent ? <IconComponent className="w-5 h-5 text-black" /> : <div className="w-5 h-5" />}
        </span>
        <span className="flex-1 truncate">{item.label}</span>
        {hasChildren && (
          <span className={`transition-transform duration-200 text-xs ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
        )}
      </>
    )

    const baseClass = `flex items-center px-3 py-2.5 text-sm text-gray-700
      hover:bg-[rgba(126,126,126,0.08)] hover:text-gray-900 cursor-pointer
      rounded-lg transition-colors duration-150 ${isNested ? 'ml-4' : ''}`

    return (
      <>
        <li key={item.id}>
          {item.path && !hasChildren ? (
            <>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `${baseClass} hidden md:flex ${isActive ? 'bg-orange-50 text-orange-600 font-medium' : ''}`
                }
              >
                {desktopInner}
              </NavLink>
              <NavLink
                to={item.path}
                onClick={closeMobile}
                className={({ isActive }) =>
                  `${baseClass} flex md:hidden ${isActive ? 'bg-orange-50 text-orange-600 font-medium' : ''}`
                }
              >
                {mobileInner}
              </NavLink>
            </>
          ) : (
            <div className={`${baseClass} flex`} onClick={() => hasChildren && toggleExpand(item.id)}>
              <span className="md:hidden flex items-center gap-2 flex-1">{mobileInner}</span>
              <span className="hidden md:flex items-center gap-2 flex-1">{desktopInner}</span>
            </div>
          )}
        </li>

        {hasChildren && isExpanded && (
          <ul className="space-y-1">
            {item.children.map((child) => (
              <MenuItem key={child.id} item={child} isNested={true} />
            ))}
          </ul>
        )}
      </>
    )
  }

  const handleMouseLeave = () => {
    setExpandedItems({})
  }

  return (
    <>
      <style>
        {`
          .sidebar::-webkit-scrollbar { width: 0px; }
          .sidebar:hover::-webkit-scrollbar { width: 4px; }
          .sidebar::-webkit-scrollbar-track { background: transparent; }
          .sidebar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 2px; }
          .sidebar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.3); }
        `}
      </style>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={closeMobile}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`sidebar md:hidden fixed left-0 top-0 h-screen w-72 bg-white border-r border-gray-200 py-5 shadow-lg overflow-y-auto z-50 transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between mb-6 px-4">
          <img src={`${import.meta.env.BASE_URL}images/gulf-logo.svg`} alt="Logo" className="h-10 w-10" />
          <button onClick={closeMobile} className="p-1 rounded-lg hover:bg-gray-100" aria-label="Close menu">
            <XMarkIcon className="w-6 h-6 text-gray-600" />
          </button>
        </div>
        <ul className="space-y-1 px-2">
          {menuData.map((item) => (
            <MenuItem key={item.id} item={item} />
          ))}
        </ul>
      </aside>

      {/* Desktop sidebar */}
      <aside
        className="sidebar group fixed left-0 top-0 h-screen w-16 hover:w-64 transition-all duration-300 bg-white border-r border-gray-200 py-5 shadow-sm overflow-y-auto z-40 hidden md:block"
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex items-center justify-center mb-6 px-4">
          <img src={`${import.meta.env.BASE_URL}images/gulf-logo.svg`} alt="Logo" className="h-10 w-10" />
        </div>
        <ul className="space-y-4 px-2">
          {menuData.map((item) => (
            <MenuItem key={item.id} item={item} />
          ))}
        </ul>
      </aside>
    </>
  )
}

export default Sidebar
