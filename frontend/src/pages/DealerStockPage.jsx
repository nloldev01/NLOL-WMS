import { useState, useEffect } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch } from '../utils/api'

const PAGE_SIZE = 20

export default function DealerStockPage() {
  const [stock, setStock]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [customers, setCustomers]   = useState([])
  const [custFilter, setCustFilter] = useState('')
  const [page, setPage]             = useState(1)
  const [error, setError]           = useState('')

  useEffect(() => { fetchCustomers() }, [])
  useEffect(() => { fetchStock() }, [search, custFilter])

  const fetchStock = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)     params.append('search', search)
      if (custFilter) params.append('customer', custFilter)
      const res = await apiFetch(`/dispatch/dealer-stock/?${params}`)
      if (res?.ok) { const d = await res.json(); setStock(Array.isArray(d) ? d : (d.results ?? [])) }
      else setStock([])
    } catch { setError('Failed to load dealer stock') }
    finally { setLoading(false) }
  }

  const fetchCustomers = async () => {
    const res = await apiFetch('/users/dealers/')
    if (res?.ok) { const d = await res.json(); setCustomers(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const paginated  = stock.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(stock.length / PAGE_SIZE))

  const totalQty = stock.reduce((sum, s) => sum + parseFloat(s.quantity || 0), 0)

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Sales / Dealer Stock</p>

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <StatCard label="Total Entries"  value={stock.length}           valueColor="text-gray-800" />
            <StatCard label="Total Quantity" value={totalQty.toLocaleString()} valueColor="text-violet-700" bg="bg-violet-50" />
            <StatCard label="Dealers"        value={new Set(stock.map(s => s.customer)).size} valueColor="text-teal-700" bg="bg-teal-50" />
          </div>

          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Dealer Stock</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Current inventory held by dealers</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                    placeholder="Search stock…"
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-44"
                  />
                </div>
                <select
                  value={custFilter}
                  onChange={e => { setCustFilter(e.target.value); setPage(1) }}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="">All Dealers</option>
                  {customers.filter(u => u.customer_id).map(u => <option key={u.customer_id} value={u.customer_id}>{u.fullname}</option>)}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-gray-400 text-sm">Loading…</div>
            ) : error ? (
              <div className="p-10 text-center text-red-500 text-sm">{error}</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-primary text-white text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 w-10">No</th>
                    <th className="px-4 py-3">Dealer</th>
                    <th className="px-4 py-3">Product / Variant</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400 italic">No dealer stock found.</td></tr>
                  ) : paginated.map((s, idx) => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-semibold text-gray-800">{s.customer_name}</div>
                        <div className="text-[9px] text-gray-400">{s.customer_code}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">{s.variant_label}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">{s.sku_code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-violet-700">{parseFloat(s.quantity).toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(s.updated_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {stock.length === 0 ? '0' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, stock.length)}`} of {stock.length} entries
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)} className={`w-7 h-7 rounded text-xs font-medium ${page === p ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{p}</button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">›</button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function StatCard({ label, value, valueColor, bg = 'bg-white' }) {
  return (
    <div className={`rounded-xl shadow-sm p-4 border border-gray-100 ${bg}`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-black ${valueColor}`}>{value}</p>
    </div>
  )
}
