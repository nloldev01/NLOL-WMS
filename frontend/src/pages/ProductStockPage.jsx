import React, { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch } from '../utils/api'

const PAGE_SIZE = 10

const ProductStockPage = () => {
  const [stocks, setStocks]       = useState([])
  const [products, setProducts]   = useState([])
  const [locations, setLocations] = useState([])
  const [filterBatches, setFilterBatches] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [filters, setFilters]     = useState({ location: '', product: '', batch: '' })
  const [filterOpen, setFilterOpen] = useState(false)
  const [expandedProduct, setExpandedProduct] = useState(null)
  const filterRef = useRef(null)

  useEffect(() => {
    fetchProducts()
    fetchLocations()
  }, [])

  useEffect(() => {
    fetchStocks()
  }, [search, filters])

  useEffect(() => {
    fetchFilterBatches(filters.product)
  }, [filters.product])

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
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (filters.location) params.append('location', filters.location)
      if (filters.product)  params.append('product',  filters.product)
      if (filters.batch)    params.append('batch',    filters.batch)

      const res = await apiFetch(`/products-stock/stock/?${params.toString()}`)
      if (res && res.ok) {
        const data = await res.json()
        setStocks(Array.isArray(data) ? data : (data.results ?? []))
      } else {
        setStocks([])
      }
    } catch {
      setStocks([])
    } finally {
      setLoading(false)
    }
  }

  const fetchProducts = async () => {
    try {
      const res = await apiFetch('/master-data/products/')
      if (res && res.ok) {
        const data = await res.json()
        setProducts(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch { console.error('Failed to load products') }
  }

  const fetchLocations = async () => {
    try {
      const res = await apiFetch('/master-data/locations/')
      if (res && res.ok) {
        const data = await res.json()
        setLocations(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch { console.error('Failed to load locations') }
  }

  const fetchFilterBatches = async (pid) => {
    try {
      let q = '?batch_type=PRD'
      if (pid) q += `&product=${pid}`
      const res = await apiFetch(`/inventory-core/batches/${q}`)
      if (res && res.ok) {
        const data = await res.json()
        setFilterBatches(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch { console.error('Failed to load filter batches') }
  }

  // Group by product, summing quantities; skip zero-stock entries
  const grouped = {}
  stocks.forEach(s => {
    const qty = parseFloat(s.quantity) || 0
    if (qty <= 0) return
    if (!grouped[s.product]) {
      grouped[s.product] = { product: s.product, product_name: s.product_name, unit: s.unit, total: 0, locations: {} }
    }
    grouped[s.product].total += qty
    const loc = s.location_name || 'Unknown'
    grouped[s.product].locations[loc] = (grouped[s.product].locations[loc] || 0) + qty
  })
  const groupedList = Object.values(grouped)
  const maxTotal = Math.max(1, ...groupedList.map(g => g.total))

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length
  const totalPages = Math.max(1, Math.ceil(groupedList.length / PAGE_SIZE))
  const paginated  = groupedList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const toggleExpand = (productId) =>
    setExpandedProduct(p => p === productId ? null : productId)

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Base Products / Stock</p>

          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Base Product Stock Levels</h2>
              <div className="flex items-center gap-3">

                <a
                  href="/stock/product-logs"
                  className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Record Production
                </a>

                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                    placeholder="Search product..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-52"
                  />
                </div>

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
                            onClick={() => { setFilters({ location: '', product: '', batch: '' }); setPage(1) }}
                            className="text-[10px] text-orange-500 hover:underline"
                          >
                            Clear all
                          </button>
                        )}
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Base Product</label>
                        <select
                          value={filters.product}
                          onChange={e => { setFilters(f => ({ ...f, product: e.target.value, batch: '' })); setPage(1) }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        >
                          <option value="">All Products</option>
                          {products.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Batch</label>
                        <select
                          value={filters.batch}
                          onChange={e => { setFilters(f => ({ ...f, batch: e.target.value })); setPage(1) }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        >
                          <option value="">All Batches</option>
                          {filterBatches.map(b => (
                            <option key={b.id} value={String(b.id)}>
                              {b.batch_code} ({parseFloat(b.current_stock).toLocaleString()} qty)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Location</label>
                        <select
                          value={filters.location}
                          onChange={e => { setFilters(f => ({ ...f, location: e.target.value })); setPage(1) }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        >
                          <option value="">All Locations</option>
                          {locations.map(l => <option key={l.id} value={String(l.id)}>{l.full_path || l.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-primary text-white text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 w-8"></th>
                    <th className="px-6 py-3">Product</th>
                    <th className="px-6 py-3">Total Quantity</th>
                    <th className="px-6 py-3">Locations</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-gray-400">No base product stock found</td>
                    </tr>
                  ) : paginated.map(group => {
                    const isExpanded = expandedProduct === group.product
                    const locEntries = Object.entries(group.locations).sort((a, b) => b[1] - a[1])
                    const maxLocQty = Math.max(1, ...locEntries.map(([, q]) => q))

                    return (
                      <React.Fragment key={group.product}>
                        <tr
                          onClick={() => toggleExpand(group.product)}
                          className={`border-b border-gray-100 cursor-pointer transition-colors ${isExpanded ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                        >
                          <td className="px-4 py-4 text-center">
                            <svg
                              className={`w-3.5 h-3.5 text-gray-400 transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </td>
                          <td className="px-6 py-4 font-semibold text-gray-900">{group.product_name}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-lg font-bold text-gray-800">{group.total.toLocaleString()}</span>
                              <span className="text-xs text-gray-400">{group.unit}</span>
                            </div>
                            <div className="mt-1.5 h-1.5 w-36 rounded-full bg-gray-100">
                              <div
                                className="h-1.5 rounded-full bg-orange-400 transition-all"
                                style={{ width: `${Math.min(100, (group.total / maxTotal) * 100)}%` }}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-400">
                            {locEntries.length} location{locEntries.length !== 1 ? 's' : ''}
                          </td>
                          <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                            <a
                              href={`/stock/product-logs?product=${group.product}`}
                              className="rounded-md bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600 inline-block"
                            >
                              View Log
                            </a>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="border-b border-gray-100 bg-orange-50/50">
                            <td colSpan={5} className="px-8 pb-5 pt-3">
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
                                Stock by Location
                              </p>
                              <div className="space-y-2.5 max-w-xl">
                                {locEntries.map(([loc, qty]) => (
                                  <div key={loc} className="flex items-center gap-3">
                                    <span className="text-xs text-gray-600 w-44 truncate shrink-0" title={loc}>{loc}</span>
                                    <div className="flex-1 h-2 rounded-full bg-gray-200">
                                      <div
                                        className="h-2 rounded-full bg-orange-400 transition-all"
                                        style={{ width: `${(qty / maxLocQty) * 100}%` }}
                                      />
                                    </div>
                                    <span className="text-xs font-semibold text-gray-700 w-24 text-right shrink-0">
                                      {qty.toLocaleString()} <span className="font-normal text-gray-400">{group.unit}</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Showing {groupedList.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, groupedList.length)} of {groupedList.length} products
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

export default ProductStockPage
