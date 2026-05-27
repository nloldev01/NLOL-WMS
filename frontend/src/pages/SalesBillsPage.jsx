import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import SalesBillsTable from '../components/SalesBillsTable'

const SalesBillsPage = () => {
  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="ml-16">
        <Topbar />
        <main className="p-6 space-y-4">
          <div className="rounded-xl bg-white shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Sales Bills</h2>
            <p className="text-sm text-slate-500 mt-1">View, search, and upload sales invoices.</p>
          </div>
          <SalesBillsTable />
        </main>
      </div>
    </div>
  )
}

export default SalesBillsPage
