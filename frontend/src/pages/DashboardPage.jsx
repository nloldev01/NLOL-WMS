import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'

const DashboardPage = () => {
  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="ml-16">
        <Topbar />
        <main className="p-6">
          <div className="rounded-xl bg-white shadow-sm p-6 h-24 mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Dashboard</h2>
            <p className="text-gray-600 mt-1">Welcome to NLOL WMS admin panel.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((item) => (
              <div key={item} className="rounded-xl bg-white shadow-sm p-5">
                <h3 className="text-lg font-medium text-gray-800">Widget {item}</h3>
                <p className="text-sm text-gray-500 mt-2">Placeholder content for dashboard card {item}.</p>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}

export default DashboardPage
