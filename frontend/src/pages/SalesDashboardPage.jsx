import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import SalesDashboard from '../components/SalesDashboard'

const SalesDashboardPage = () => {
  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">
          <div className="rounded-xl bg-white shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Sales Overview</h2>
            <p className="text-sm text-slate-500 mt-1">A summary of recent sales activity and performance.</p>
          </div>
          <SalesDashboard />
        </main>
      </div>
    </div>
  )
}

export default SalesDashboardPage
