import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import CustomersTable from '../components/CustomersTable'
import { useState } from 'react'
import SalesBulkUploadModal from '../components/SalesBulkUploadModal'

const SalesCustomersPage = () => {
  const [showBulkUpload, setShowBulkUpload] = useState(false)

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="ml-16">
        <Topbar />
        <main className="p-6 space-y-4">
          <div className="rounded-xl bg-white shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Sales Customers</h2>
            <p className="text-sm text-slate-500 mt-1">Manage customers, add new accounts, and import customer lists.</p>
          </div>
          <CustomersTable onBulkUpload={() => setShowBulkUpload(true)} />
        </main>
      </div>
      {showBulkUpload && (
        <SalesBulkUploadModal
          onClose={() => setShowBulkUpload(false)}
          onUploadSuccess={() => setShowBulkUpload(false)}
        />
      )}
    </div>
  )
}

export default SalesCustomersPage
