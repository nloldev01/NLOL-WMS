import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch } from '../utils/api'

const PAGE_SIZE = 10

const RawMaterialStockPage = () => {
  const [stocks, setStocks]       = useState([])
  const [materials, setMaterials] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [error, setError]         = useState('')
  const [filters, setFilters]     = useState({ material__type: '', location: '' })
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  useEffect(() => {
    fetchStocks()
    fetchMaterials()
    fetchLocations()
  }, [])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target))
        setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchStocks = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/raw-materials-stock/stock/')
      if (res && res.ok) {
        const data = await res.json()
        setStocks(Array.isArray(data) ? data : (data.results ?? []))
      } else {
        setStocks([])
      }
    } catch {
      setStocks([])
      setError('Failed to load stock data')
    } finally {
      setLoading(false)
    }
  }

  const fetchMaterials = async () => {
    try {
      const res = await apiFetch('/master-data/raw-materials-and-consumables/')
      if (res && res.ok) {
        const data = await res.json()
        setMaterials(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch { console.error('Failed to load materials') }
  }

  const fetchLocations = async () => {
    try {
      const res = await apiFetch('/raw-materials-stock/locations/')
      if (res && res.ok) {
        const data = await res.json()
        setLocations(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch { console.error('Failed to load locations') }
  }

  // Filter + search
  const filtered = stocks.filter(s => {
    const matchesSearch =
      s.material_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.location_name?.toLowerCase().includes(search.toLowerCase())
    const matchesType     = !filters.material__type || s.material_type === filters.material__type
    const matchesLocation = !filters.location       || String(s.location) === filters.location
    return matchesSearch && matchesType && matchesLocation
  })

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Badge color based on quantity
  const getStockBadge = (qty) => {
    if (qty <= 0)  return 'bg-red-50 text-red-600'
    if (qty < 50)  return 'bg-yellow-50 text-yellow-600'
    return 'bg-green-50 text-green-600'
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="ml-16">
        <Topbar />
        <main className="p-6">

          {/* Breadcrumb */}
          <p className="text-xs text-gray-400 mb-3">Raw Materials / Stock</p>

          {/* Card */}
          <div className="rounded-xl bg-white shadow-sm">

            {/* Table Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Raw Material Stock</h2>
              <div className="flex items-center gap-3">

                {/* Record Movement button — links to movements page */}
                <a
                  href="/stock/raw-materials-logs"
                  className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Record Movement
                </a>

                {/* Search */}
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                    placeholder="Search material or location..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-52"
                  />
                </div>

                {/* Filter */}
                <div className="relative" ref={filterRef}>
                  <button
                    onClick={() => setFilterOpen(o => !o)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeFilterCount > 0
                        ? 'border-orange-400 bg-orange-50 text-orange-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4-2A1 1 0 018 17v-3.586L3.293 6.707A1 1 0 013 6V4z" />
                    </svg>
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] text-white font-semibold">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>

                  {filterOpen && (
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl bg-white border border-gray-200 shadow-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">Filters</p>
                        {activeFilterCount > 0 && (
                          <button
                            onClick={() => { setFilters({ material__type: '', location: '' }); setPage(1) }}
                            className="text-[10px] text-orange-500 hover:underline"
                          >
                            Clear all
                          </button>
                        )}
                      </div>

                      {/* Type */}
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Type</label>
                        <select
                          value={filters.material__type}
                          onChange={e => { setFilters(f => ({ ...f, material__type: e.target.value })); setPage(1) }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        >
                          <option value="">All</option>
                          <option value="Raw Material">Raw Material</option>
                          <option value="Consumable">Consumable</option>
                        </select>
                      </div>

                      {/* Location */}
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Location</label>
                        <select
                          value={filters.location}
                          onChange={e => { setFilters(f => ({ ...f, location: e.target.value })); setPage(1) }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        >
                          <option value="">All</option>
                          {locations.map(l => <option key={l.id} value={String(l.id)}>{l.full_path || l.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-primary text-white text-xs uppercase">
                  <tr>
                    <th className="px-6 py-3 w-10">No</th>
                    <th className="px-6 py-3">Material</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Location</th>
                    <th className="px-6 py-3">Quantity</th>
                    <th className="px-6 py-3">Unit</th>
                    <th className="px-6 py-3">Last Updated</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-gray-400">No stock entries found</td>
                    </tr>
                  ) : paginated.map((stock, idx) => (
                    <tr key={stock.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">{stock.material_name}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                          stock.material_type === 'Raw Material'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-purple-50 text-purple-600'
                        }`}>
                          {stock.material_type}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-500">{stock.location_name}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${getStockBadge(stock.quantity)}`}>
                          {parseFloat(stock.quantity).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="px-2 py-0.5 rounded-md bg-orange-50 text-orange-600 text-xs font-medium">
                          {stock.unit || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-400 text-xs">
                        {stock.updated_at ? new Date(stock.updated_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-6 py-3">
                        <a
                          href={`/stock/raw-materials-logs?material=${stock.material}&location=${stock.location}`}
                          className="rounded-md bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600"
                        >
                          View Log
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded text-xs font-medium ${
                      page === p ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >{p}</button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >›</button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default RawMaterialStockPage
