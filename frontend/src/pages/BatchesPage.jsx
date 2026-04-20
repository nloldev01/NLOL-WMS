import React from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import BatchesTable from '../components/BatchesTable'

const BatchesPage = () => {
  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Stocks / Batches</p>
          <BatchesTable />
        </main>
      </div>
    </div>
  )
}

export default BatchesPage
