import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import UnitsTable from '../components/UnitsTable' // or wherever you place it
import FiscalYearsTable from '../components/FiscalYearsTable'
import AssetsTable from '../components/AssetsTable'
import LocationsTable from '../components/LocationTable'
import RawMaterialsTable from '../components/RawMaterialsTable'
import ProductGroupsTable from '../components/ProductGroupsTable'
import ProductSegmentsTable from '../components/ProductSegmentsTable'
import ProductSubGroupsTable from '../components/ProductSubGroupsTable'
import SuppliersTable from '../components/SuppliersTable'
import { useState } from 'react'

const MASTER_ITEMS = [
  { key: 'units', label: 'Units', color: '#14b8a6' },
  { key: 'fiscal-years', label: 'Fiscal Years', color: '#a855f7' },
  { key: 'assets', label: 'Assets', color: '#f43f5e' },
  { key: 'locations', label: 'Locations', color: '#3b82f6' },
  { key: 'raw-materials', label: 'Raw Materials and Consumables', color: '#f59e0b' },
  { key: 'product-groups', label: 'Product Groups', color: '#22c55e' },
  { key: 'product-sub-groups', label: 'Product Sub-Groups', color: '#8b5cf6' },
  { key: 'product-segments', label: 'Product Segments', color: '#ec4899' },
  { key: 'suppliers', label: 'Suppliers', color: '#ec4899' },

  // { key: 'roles',        label: 'Roles',        color: '#3b82f6' },
  // { key: 'departments',  label: 'Departments',  color: '#22c55e' },
  // { key: 'branches',     label: 'Branches',     color: '#8b5cf6' },
  // { key: 'positions',    label: 'Positions',    color: '#ec4899' },
  // { key: 'categories',   label: 'Categories',   color: '#6b7280' },
  // { key: 'status-codes', label: 'Status Codes', color: '#f59e0b' },
]

const MasterDataPage = () => {
  const [selected, setSelected] = useState('users')

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="ml-16">
        <Topbar />
        <main className="p-6 space-y-4">

          {/* Selector */}
          <div className="rounded-xl bg-white shadow-sm px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-gray-400 whitespace-nowrap">Select Master Data:</span>
              {MASTER_ITEMS.map(item => (
                <button
                  key={item.key}
                  onClick={() => setSelected(item.key)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors
                    ${selected === item.key
                      ? 'bg-orange-50 border-orange-300 text-orange-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-white hover:border-gray-400 hover:text-gray-800'
                    }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {selected === 'units' && <UnitsTable />}
          {selected === 'fiscal-years' && <FiscalYearsTable />}
          {selected === 'assets' && <AssetsTable />}
          {selected === 'locations' && <LocationsTable />}
          {selected === 'raw-materials' && <RawMaterialsTable />}
          {selected === 'product-groups' && <ProductGroupsTable />}
          {selected === 'product-sub-groups' && <ProductSubGroupsTable />}
          {selected === 'product-segments' && <ProductSegmentsTable />}
          {selected === 'suppliers' && <SuppliersTable />}

          {/* {selected === 'users'        && <UsersTable />}
          {selected === 'roles'        && <RolesTable />}
          {selected === 'departments'  && <DepartmentsTable />}
          {selected === 'branches'     && <BranchesTable />}
          {selected === 'positions'    && <PositionsTable />}
          {selected === 'categories'   && <CategoriesTable />}
          {selected === 'status-codes' && <StatusCodesTable />} */}

        </main>
      </div>
    </div>
  )
}

export default MasterDataPage
