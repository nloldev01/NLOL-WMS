import { useState } from 'react'
import { NavLink } from 'react-router-dom'

import {
  HomeIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  CubeIcon,
  ArchiveBoxIcon,
  UserGroupIcon,
  CpuChipIcon,
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  CreditCardIcon,
  MapIcon,
  FingerPrintIcon,
  BeakerIcon,
  WrenchScrewdriverIcon
} from '@heroicons/react/24/outline'

const Sidebar = () => {
  const [expandedItems, setExpandedItems] = useState({})

  const iconMap = {
    dashboard: HomeIcon,
    system: Cog6ToothIcon,
    'master-data': DocumentDuplicateIcon,
    'raw-inventories': CubeIcon,
    stocks: ArchiveBoxIcon,
    users: UserGroupIcon,
    machines: CpuChipIcon,
    products: ShoppingBagIcon,
    'purchase-orders': ClipboardDocumentListIcon,
    'system-logs': ExclamationTriangleIcon,
    'counter-sales': CreditCardIcon,
    // 'inventory-explorer': MapIcon,
    'stock-identity': FingerPrintIcon,
    production: WrenchScrewdriverIcon,
  }

  const menuData = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      path: '/dashboard',
    },
    {
      id: 'system',
      label: 'System',
      children: [
        { id: 'system-config', label: 'Configuration', path: '/system/config' },
        { id: 'system-backup', label: 'Backup', path: '/system/backup' },
        { id: 'system-logs', label: 'Logs', path: '/system/logs' },
      ],
    },
    {
      id: 'master-data',
      label: 'Master Data',
      path: '/master-data'
    },
    {
      id: 'products',
      label: 'Products',
      path: '/products',
    },
    {
      id: 'stocks',
      label: 'Stocks',
      children: [
        { id: 'product-stock', label: 'Product Stock', path: '/stock/products' },
        { id: 'raw-material-stock', label: 'Raw Material Stock', path: '/stock/raw-materials' },
        { id: 'product-stock-logs', label: 'Product Stock Logs', path: '/stock/product-logs' },
        { id: 'raw-material-stock-logs', label: 'Raw Material Stock Logs', path: '/stock/raw-materials-logs' },
        { id: 'batches', label: 'Batches', path: '/stock/batches' },
        { id: 'inventory-explorer', label: 'Inventory Explorer', path: '/stock/inventory-explorer' },
        { id: 'lpn-finder', label: 'LPN Finder', path: '/stock/lpn-finder' },
      ],
    },  
    {
      id: 'users',
      label: 'Users',
      children: [
        { id: 'user-list', label: 'User List', path: '/users' },
        { id: 'user-roles', label: 'Roles & Permissions', path: '/users/roles' },
      ],
    },
    {
      id: 'production',
      label: 'Production',
      children: [
        { id: 'recipes', label: 'Product Recipes', path: '/production/recipes' },
      ],
    },
    { id: 'machines', label: 'Machines', path: '/machines' },
    { id: 'purchase-orders', label: 'Purchase Orders', path: '/purchase-orders' },
    { id: 'system-logs', label: 'System Logs', path: '/system/logs' },
    { id: 'counter-sales', label: 'Counter Sales', path: '/counter-sales' },
  ]

  const toggleExpand = (id) => {
    setExpandedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const MenuItem = ({ item, isNested = false }) => {
    const hasChildren = item.children && item.children.length > 0
    const isExpanded = expandedItems[item.id]
    const IconComponent = iconMap[item.id]

    const inner = (
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

    const baseClass = `flex items-center px-2 py-2 text-sm text-gray-700 
      hover:bg-[rgba(126,126,126,0.08)] hover:text-gray-900 cursor-pointer 
      rounded-lg transition-colors duration-150 ${isNested ? 'ml-4' : ''}`

    return (
      <>
        <li key={item.id}>
          {item.path && !hasChildren ? (
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                `${baseClass} ${isActive ? 'bg-orange-50 text-orange-600 font-medium' : ''}`
              }
            >
              {inner}
            </NavLink>
          ) : (
            <div className={baseClass} onClick={() => hasChildren && toggleExpand(item.id)}>
              {inner}
            </div>
          )}
        </li>

        {hasChildren && isExpanded && (
          <ul className="space-y-2">
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
          .sidebar::-webkit-scrollbar {
            width: 0px;
          }
          .sidebar:hover::-webkit-scrollbar {
            width: 4px;
          }
          .sidebar::-webkit-scrollbar-track {
            background: transparent;
          }
          .sidebar::-webkit-scrollbar-thumb {
            background: rgba(0, 0, 0, 0.2);
            border-radius: 2px;
          }
          .sidebar::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 0, 0, 0.3);
          }
        `}
      </style>
      <aside
        className="sidebar group fixed left-0 top-0 h-screen w-16 hover:w-64 transition-all duration-300 bg-white border-r border-gray-200 py-5 shadow-sm overflow-y-auto z-40"
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex items-center justify-center mb-6 px-4">
          <img src="/images/gulf-logo.svg" alt="Logo" className="h-10 w-10" />
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
