import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch, getApiError } from '../utils/api'

const PAGE_SIZE = 10

const STATUS_CONFIG = {
  draft:             { label: 'Draft',             color: 'bg-slate-100 text-slate-600' },
  awaiting_kettle:   { label: 'Awaiting Kettle',   color: 'bg-amber-50 text-amber-700' },
  awaiting_assembly: { label: 'Awaiting Assembly', color: 'bg-blue-50 text-blue-700' },
  completed:         { label: 'Completed',         color: 'bg-green-50 text-green-700' },
  cancelled:         { label: 'Cancelled',         color: 'bg-red-50 text-red-600' },
}

const MODE_CONFIG = {
  direct:                  { label: 'Direct',       color: 'bg-teal-50 text-teal-700 border border-teal-200' },
  via_assembly:            { label: 'Via Assembly', color: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
  via_kettle_and_assembly: { label: 'Kettle+Asm',   color: 'bg-violet-50 text-violet-700 border border-violet-200' },
}

const MODE_LABELS = {
  direct:                  'Direct Repack',
  via_assembly:            'Via Assembly',
  via_kettle_and_assembly: 'Via Kettle & Assembly',
}

const emptyForm = {
  mode: 'direct',
  source_product: '',
  source_variant: '',
  source_batch: '',
  source_location: '',
  source_quantity: '',
  dest_product: '',
  destination_variant: '',
  output_quantity: '',
  destination_location: '',
  assembly_line: '',
  notes: '',
}

export default function RefillOrdersPage() {
  const [orders, setOrders]             = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filters, setFilters]           = useState({ status: '', mode: '' })
  const [filterOpen, setFilterOpen]     = useState(false)
  const [activeCard, setActiveCard]     = useState('')
  const [page, setPage]                 = useState(1)
  const [error, setError]               = useState('')
  const filterRef                       = useRef(null)

  const [finishedProducts, setFinishedProducts]       = useState([])
  const [srcVariants, setSrcVariants]                 = useState([])
  const [dstVariants, setDstVariants]                 = useState([])
  const [srcStock, setSrcStock]                       = useState([])
  const [locations, setLocations]                     = useState([])
  const [assemblyLines, setAssemblyLines]             = useState([])
  const [srcVariantsLoading, setSrcVariantsLoading]   = useState(false)
  const [dstVariantsLoading, setDstVariantsLoading]   = useState(false)
  const [srcStockLoading, setSrcStockLoading]         = useState(false)

  const [createOpen, setCreateOpen]   = useState(false)
  const [form, setForm]               = useState(emptyForm)
  const [submitting, setSubmitting]   = useState(false)
  const [formError, setFormError]     = useState('')

  const [actionLoading, setActionLoading] = useState(null)
  const [actionError, setActionError]     = useState('')

  const [detailOrder, setDetailOrder] = useState(null)

  useEffect(() => { fetchOrders() }, [search, filters])
  useEffect(() => { fetchFinishedProducts(); fetchLocations(); fetchAssemblyLines() }, [])

  useEffect(() => {
    const h = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    if (form.source_product) {
      fetchSrcVariants(form.source_product)
    } else {
      setSrcVariants([]); setSrcStock([])
      setForm(p => ({ ...p, source_variant: '', source_batch: '', source_location: '', source_quantity: '' }))
    }
  }, [form.source_product])

  useEffect(() => {
    if (form.source_variant) fetchSrcStock(form.source_variant)
    else { setSrcStock([]); setForm(p => ({ ...p, source_batch: '', source_location: '', source_quantity: '' })) }
  }, [form.source_variant])

  useEffect(() => {
    if (form.dest_product) fetchDstVariants(form.dest_product)
    else { setDstVariants([]); setForm(p => ({ ...p, destination_variant: '' })) }
  }, [form.dest_product])

  useEffect(() => {
    if (!form.source_variant || !form.destination_variant || !form.source_quantity) return
    const sv = srcVariants.find(v => String(v.id) === String(form.source_variant))
    const dv = dstVariants.find(v => String(v.id) === String(form.destination_variant))
    if (!sv || !dv || !sv.base_quantity || !dv.base_quantity) return
    const srcBase = finishedProducts.find(p => String(p.id) === String(form.source_product))?.base_product
    const dstBase = finishedProducts.find(p => String(p.id) === String(form.dest_product))?.base_product
    if (srcBase && dstBase && String(srcBase) === String(dstBase)) {
      const calc = (parseFloat(form.source_quantity) * parseFloat(sv.base_quantity)) / parseFloat(dv.base_quantity)
      if (!isNaN(calc)) setForm(p => ({ ...p, output_quantity: calc.toFixed(4) }))
    }
  }, [form.source_variant, form.destination_variant, form.source_quantity])

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)         params.append('search', search)
      if (filters.status) params.append('status', filters.status)
      if (filters.mode)   params.append('mode', filters.mode)
      const res = await apiFetch(`/refill/refill-orders/?${params}`)
      if (res?.ok) { const d = await res.json(); setOrders(Array.isArray(d) ? d : (d.results ?? [])) }
      else setOrders([])
    } catch { setError('Failed to load refill orders') }
    finally { setLoading(false) }
  }

  const fetchFinishedProducts = async () => {
    const res = await apiFetch('/master-data/finished-products/')
    if (res?.ok) { const d = await res.json(); setFinishedProducts(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const fetchLocations = async () => {
    const res = await apiFetch('/master-data/locations/?is_active=true')
    if (res?.ok) { const d = await res.json(); setLocations(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const fetchAssemblyLines = async () => {
    const res = await apiFetch('/master-data/locations/?type=assembly&is_active=true')
    if (res?.ok) { const d = await res.json(); setAssemblyLines(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const fetchSrcVariants = async (fpId) => {
    setSrcVariantsLoading(true)
    try {
      const res = await apiFetch(`/master-data/finished-product-variants/?finished_product=${fpId}&is_available=true`)
      if (res?.ok) { const d = await res.json(); setSrcVariants(Array.isArray(d) ? d : (d.results ?? [])) }
    } finally { setSrcVariantsLoading(false) }
  }

  const fetchDstVariants = async (fpId) => {
    setDstVariantsLoading(true)
    try {
      const res = await apiFetch(`/master-data/finished-product-variants/?finished_product=${fpId}&is_available=true`)
      if (res?.ok) { const d = await res.json(); setDstVariants(Array.isArray(d) ? d : (d.results ?? [])) }
    } finally { setDstVariantsLoading(false) }
  }

  const fetchSrcStock = async (variantId) => {
    setSrcStockLoading(true)
    try {
      const res = await apiFetch(`/products-stock/finished-product-stock/?finished_product_variant=${variantId}`)
      if (res?.ok) {
        const d = await res.json()
        setSrcStock((Array.isArray(d) ? d : (d.results ?? [])).filter(s => parseFloat(s.quantity) > 0))
      }
    } finally { setSrcStockLoading(false) }
  }

  const handleCardClick = (card) => {
    if (activeCard === card) {
      setActiveCard(''); setFilters(p => ({ ...p, status: '' })); setPage(1); return
    }
    setActiveCard(card); setPage(1)
    setFilters(p => ({ ...p, status: card === 'inProgress' ? '' : card === 'total' ? '' : card }))
  }

  const set = (field, value) => setForm(p => ({ ...p, [field]: value }))

  const openCreate = () => {
    setForm(emptyForm); setFormError(''); setCreateOpen(true)
    setSrcVariants([]); setDstVariants([]); setSrcStock([])
  }

  const handleCreate = async () => {
    if (!form.source_variant || !form.source_batch || !form.source_location || !form.source_quantity) {
      setFormError('Source variant, batch, location and quantity are required.'); return
    }
    if (!form.destination_variant || !form.destination_location) {
      setFormError('Destination variant and location are required.'); return
    }
    if (form.mode !== 'direct' && !form.assembly_line) {
      setFormError('Assembly line is required for Via Assembly and Via Kettle & Assembly modes.'); return
    }
    setSubmitting(true); setFormError('')
    const payload = {
      mode:                 form.mode,
      source_variant:       parseInt(form.source_variant),
      source_batch:         parseInt(form.source_batch),
      source_location:      parseInt(form.source_location),
      source_quantity:      parseFloat(form.source_quantity),
      destination_variant:  parseInt(form.destination_variant),
      destination_location: parseInt(form.destination_location),
      ...(form.mode !== 'direct' && form.assembly_line ? { assembly_location: parseInt(form.assembly_line) } : {}),
      ...(form.output_quantity ? { output_quantity: parseFloat(form.output_quantity) } : {}),
      notes: form.notes,
    }
    try {
      const res = await apiFetch('/refill/refill-orders/', { method: 'POST', body: JSON.stringify(payload) })
      if (res?.ok) { setCreateOpen(false); fetchOrders() }
      else setFormError(await getApiError(res))
    } catch { setFormError('Connection error — check your network') }
    finally { setSubmitting(false) }
  }

  const handleStart = async (order) => {
    if (!window.confirm(`Start ${order.refill_number}? This will deduct source stock immediately.`)) return
    setActionError(''); setActionLoading(order.id)
    try {
      const res = await apiFetch(`/refill/refill-orders/${order.id}/start/`, { method: 'POST' })
      if (res?.ok) fetchOrders()
      else setActionError(await getApiError(res))
    } catch { setActionError('Connection error') }
    finally { setActionLoading(null) }
  }

  const handleCancel = async (order) => {
    if (!window.confirm(`Cancel ${order.refill_number}?`)) return
    setActionError(''); setActionLoading(order.id)
    try {
      const res = await apiFetch(`/refill/refill-orders/${order.id}/cancel/`, { method: 'POST' })
      if (res?.ok) fetchOrders()
      else setActionError(await getApiError(res))
    } catch { setActionError('Connection error') }
    finally { setActionLoading(null) }
  }

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length
  const STATUS_SORT = { draft: 0, awaiting_kettle: 1, awaiting_assembly: 2, completed: 3, cancelled: 4 }
  const sorted = [...orders].sort((a, b) => (STATUS_SORT[a.status] ?? 5) - (STATUS_SORT[b.status] ?? 5))
  const displayed  = activeCard === 'inProgress'
    ? sorted.filter(o => o.status === 'awaiting_kettle' || o.status === 'awaiting_assembly')
    : sorted
  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE))
  const paginated  = displayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const selectedSrcStock = srcStock.find(
    s => String(s.batch) === String(form.source_batch) && String(s.location) === String(form.source_location)
  ) || srcStock.find(s => String(s.batch) === String(form.source_batch))

  const stats = {
    total:      orders.length,
    draft:      orders.filter(o => o.status === 'draft').length,
    inProgress: orders.filter(o => o.status === 'awaiting_kettle' || o.status === 'awaiting_assembly').length,
    completed:  orders.filter(o => o.status === 'completed').length,
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Packaging / Refill Orders</p>

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label="Total Orders" value={stats.total}      valueColor="text-gray-800"  isActive={activeCard === 'total'}      onClick={() => handleCardClick('total')} />
            <StatCard label="Draft"        value={stats.draft}      valueColor="text-slate-600" bg="bg-slate-50"  isActive={activeCard === 'draft'}       onClick={() => handleCardClick('draft')} />
            <StatCard label="In Progress"  value={stats.inProgress} valueColor="text-blue-700"  bg="bg-blue-50"   isActive={activeCard === 'inProgress'}  onClick={() => handleCardClick('inProgress')} />
            <StatCard label="Completed"    value={stats.completed}  valueColor="text-green-700" bg="bg-green-50"  isActive={activeCard === 'completed'}   onClick={() => handleCardClick('completed')} />
          </div>

          <div className="rounded-xl bg-white shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Refill Orders</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Convert finished product stock into a different variant or product</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                    placeholder="Search orders…"
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-44"
                  />
                </div>
                <div className="relative" ref={filterRef}>
                  <button
                    onClick={() => setFilterOpen(o => !o)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeFilterCount > 0 ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Filters {activeFilterCount > 0 && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] text-white font-semibold">{activeFilterCount}</span>
                    )}
                  </button>
                  {filterOpen && (
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-xl bg-white border border-gray-200 shadow-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">Filters</p>
                        {activeFilterCount > 0 && (
                          <button onClick={() => { setFilters({ status: '', mode: '' }); setPage(1) }} className="text-[10px] text-orange-500 hover:underline">Clear all</button>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Status</label>
                        <select value={filters.status} onChange={e => { setFilters(p => ({ ...p, status: e.target.value })); setActiveCard(''); setPage(1) }} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
                          <option value="">All</option>
                          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Mode</label>
                        <select value={filters.mode} onChange={e => { setFilters(p => ({ ...p, mode: e.target.value })); setPage(1) }} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
                          <option value="">All</option>
                          {Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={openCreate}
                  className="rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-orange-600 transition-colors"
                >
                  + New Refill Order
                </button>
              </div>
            </div>

            {actionError && (
              <div className="mx-6 mt-4 flex items-center justify-between gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
                <span>{actionError}</span>
                <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-600 text-lg leading-none flex-shrink-0">×</button>
              </div>
            )}

            {/* Table */}
            {loading ? (
              <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
            ) : error ? (
              <div className="p-10 text-center text-red-500 text-sm">{error}</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-primary text-white text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 w-10">No</th>
                    <th className="px-4 py-3">Refill #</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Destination</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Assembly Line</th>
                    <th className="px-4 py-3">Linked Order</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr><td colSpan={11} className="px-6 py-10 text-center text-gray-400 italic">No refill orders found.</td></tr>
                  ) : paginated.map((order, idx) => {
                    const sc = STATUS_CONFIG[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-500' }
                    const mc = MODE_CONFIG[order.mode]
                    const isLoading = actionLoading === order.id
                    return (
                      <tr
                        key={order.id}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setDetailOrder(order)}
                      >
                        <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{order.refill_number}</span>
                        </td>
                        <td className="px-4 py-3">
                          {mc
                            ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${mc.color}`}>{mc.label}</span>
                            : <span className="text-gray-400 text-xs">{order.mode}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium text-gray-800 max-w-[160px] truncate">{order.source_variant_label || '—'}</div>
                          {order.source_batch_code && (
                            <span className="font-mono text-[9px] text-orange-500 bg-orange-50 px-1 rounded">{order.source_batch_code}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium text-gray-800 max-w-[160px] truncate">{order.destination_variant_label || '—'}</div>
                          <div className="text-[9px] text-gray-400 truncate">{order.destination_location_name}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">In</div>
                          <div className="font-bold text-slate-700">{parseFloat(order.source_quantity).toLocaleString()}</div>
                          {order.output_quantity && (
                            <>
                              <div className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide mt-0.5">Out</div>
                              <div className="font-bold text-teal-600">{parseFloat(order.output_quantity).toLocaleString()}</div>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {order.assembly_location_name
                            ? <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{order.assembly_location_name}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {order.linked_assembly_number
                            ? <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">{order.linked_assembly_number}</span>
                            : order.linked_production_number
                            ? <span className="font-mono text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">{order.linked_production_number}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${sc.color}`}>{sc.label}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{new Date(order.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            {order.status === 'draft' && (
                              <>
                                <button
                                  onClick={() => handleStart(order)}
                                  disabled={isLoading}
                                  className="rounded-md bg-teal-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-teal-600 disabled:opacity-50"
                                >
                                  {isLoading ? '…' : 'Start'}
                                </button>
                                <button
                                  onClick={() => handleCancel(order)}
                                  disabled={isLoading}
                                  className="rounded-md bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {displayed.length === 0 ? '0' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, displayed.length)}`} of {displayed.length} orders
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

      {/* ── Create Modal ─────────────────────────────────────────────────── */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">New Refill Order</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Convert finished stock into a different variant or product</p>
              </div>
              <button onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {formError && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{formError}</div>
              )}

              {/* Mode */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Refill Mode</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(MODE_LABELS).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => set('mode', k)}
                      className={`inline-flex flex-col items-start px-3 py-2 rounded-lg border-2 text-xs font-bold transition-all ${
                        form.mode === k
                          ? 'border-orange-400 bg-orange-500 text-white shadow-sm shadow-orange-200'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
                      }`}
                    >
                      {v}
                      <span className={`text-[9px] font-normal mt-0.5 ${form.mode === k ? 'text-orange-100' : 'text-slate-400'}`}>
                        {k === 'direct' ? 'Immediate stock swap' : k === 'via_assembly' ? 'Unpack → Assembly' : 'Unpack → Kettle → Assembly'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* SOURCE */}
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-3">Source — stock to consume</p>

                <select
                  value={form.source_product}
                  onChange={e => set('source_product', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none mb-3"
                >
                  <option value="">Select finished product *</option>
                  {finishedProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>

                {/* Source variant pills */}
                {form.source_product && (
                  srcVariantsLoading ? (
                    <div className="p-2 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg mb-3">Loading variants...</div>
                  ) : srcVariants.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {srcVariants.map(v => {
                        const isSelected = String(form.source_variant) === String(v.id)
                        return (
                          <button key={v.id} type="button" onClick={() => set('source_variant', String(v.id))}
                            className={`inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition-all ${
                              isSelected
                                ? 'border-orange-400 bg-orange-500 text-white shadow-sm shadow-orange-200'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
                            }`}
                          >
                            {parseFloat(v.volume)}
                            <span className={`font-semibold ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>{(v.volume_unit_symbol || '').toUpperCase()}</span>
                            <span className={`text-[10px] font-normal ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>· {v.unit_name}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-1 mb-3">No variants found</p>
                  )
                )}

                {/* Stock tiles */}
                {srcStockLoading && <p className="text-[10px] text-gray-400 mb-2">Loading available stock…</p>}
                {srcStock.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] text-gray-400 mb-2">Click a tile to select batch &amp; location:</p>
                    <div className="flex flex-wrap gap-2">
                      {srcStock.map(s => {
                        const isSelected = String(s.batch) === String(form.source_batch)
                        return (
                          <button key={s.id} onClick={() => setForm(p => ({ ...p, source_batch: String(s.batch), source_location: String(s.location) }))}
                            className={`flex flex-col text-left p-2.5 rounded-lg border transition-all group min-w-[130px] text-[10px] ${
                              isSelected
                                ? 'bg-orange-50 border-orange-400 text-orange-800'
                                : 'bg-white border-gray-200 hover:border-teal-400 hover:bg-teal-50/40'
                            }`}
                          >
                            <div className="font-mono font-bold text-orange-600 mb-0.5">{s.batch_code || `Batch #${s.batch}`}</div>
                            <div className="text-gray-500 truncate">{s.location_name || `Loc #${s.location}`}</div>
                            <div className="font-bold text-gray-700 mt-1">{parseFloat(s.quantity).toLocaleString()} units</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {form.source_variant && !srcStockLoading && srcStock.length === 0 && (
                  <p className="text-[10px] text-amber-600 mb-3">No stock available for this variant.</p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                      Quantity to Refill *
                      {selectedSrcStock && <span className="font-normal ml-1 normal-case text-gray-400">(max: {parseFloat(selectedSrcStock.quantity).toLocaleString()})</span>}
                    </label>
                    <input
                      type="number" min="0" step="any"
                      value={form.source_quantity}
                      onChange={e => set('source_quantity', e.target.value)}
                      onWheel={e => e.target.blur()}
                      disabled={!form.source_batch}
                      placeholder={selectedSrcStock ? `Max ${parseFloat(selectedSrcStock.quantity).toLocaleString()}` : '0'}
                      className="w-full rounded-lg border-2 border-orange-300 bg-orange-50/40 px-4 py-2.5 text-base font-bold text-orange-700 focus:border-orange-500 outline-none disabled:opacity-50 disabled:bg-gray-50 disabled:border-gray-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Source Location</label>
                    <select
                      value={form.source_location}
                      onChange={e => set('source_location', e.target.value)}
                      disabled={!form.source_variant}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      <option value="">— Select location —</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* ASSEMBLY LINE — non-direct modes */}
              {form.mode !== 'direct' && (
                <>
                  <hr className="border-gray-100" />
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Assembly Line *</p>
                    {assemblyLines.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {assemblyLines.map(line => {
                          const isSelected = String(form.assembly_line) === String(line.id)
                          return (
                            <button key={line.id} type="button" onClick={() => set('assembly_line', String(line.id))}
                              className={`inline-flex flex-col items-start px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition-all ${
                                isSelected
                                  ? 'border-orange-400 bg-orange-500 text-white shadow-sm shadow-orange-200'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
                              }`}
                            >
                              {line.name}
                              {line.short_code && (
                                <span className={`text-[9px] font-normal mt-0.5 ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>{line.short_code}</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 italic">No assembly lines found.</p>
                    )}
                    <p className="text-[9px] text-gray-400 mt-1.5">Recovery stock lands here — appears in the Assembly Orders "Ready to Assemble" queue.</p>
                  </div>
                </>
              )}

              <hr className="border-gray-100" />

              {/* DESTINATION */}
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-3">Destination — output</p>

                <select
                  value={form.dest_product}
                  onChange={e => set('dest_product', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none mb-3"
                >
                  <option value="">Select finished product *</option>
                  {finishedProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>

                {/* Destination variant pills */}
                {form.dest_product && (
                  dstVariantsLoading ? (
                    <div className="p-2 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg mb-3">Loading variants...</div>
                  ) : dstVariants.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {dstVariants.map(v => {
                        const isSelected = String(form.destination_variant) === String(v.id)
                        return (
                          <button key={v.id} type="button" onClick={() => set('destination_variant', String(v.id))}
                            className={`inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition-all ${
                              isSelected
                                ? 'border-orange-400 bg-orange-500 text-white shadow-sm shadow-orange-200'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
                            }`}
                          >
                            {parseFloat(v.volume)}
                            <span className={`font-semibold ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>{(v.volume_unit_symbol || '').toUpperCase()}</span>
                            <span className={`text-[10px] font-normal ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>· {v.unit_name}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-1 mb-3">No variants found</p>
                  )
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Output Quantity</label>
                      {form.output_quantity && form.destination_variant && form.source_variant && (
                        <span className="text-[9px] text-teal-500 font-medium">auto-calculated</span>
                      )}
                    </div>
                    <input
                      type="number" min="0" step="any"
                      value={form.output_quantity}
                      onChange={e => set('output_quantity', e.target.value)}
                      onWheel={e => e.target.blur()}
                      placeholder="Auto or enter manually"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                    />
                    <p className="text-[9px] text-gray-400 mt-0.5">Auto-filled when source &amp; destination share the same base product.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Destination Location *</label>
                    <select
                      value={form.destination_location}
                      onChange={e => set('destination_location', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                    >
                      <option value="">— Select location —</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <textarea
                rows={2}
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Notes (optional)…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-slate-50/30">
              <button onClick={() => setCreateOpen(false)} className="rounded-lg border border-gray-200 px-6 py-2 text-sm font-bold text-slate-500 hover:bg-white">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting}
                className="rounded-lg bg-orange-500 px-8 py-2 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-50 active:scale-95 transition-all"
              >
                {submitting ? 'Creating…' : 'Create Refill Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Drawer ────────────────────────────────────────────────── */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setDetailOrder(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{detailOrder.refill_number}</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${(STATUS_CONFIG[detailOrder.status] || {}).color}`}>
                  {(STATUS_CONFIG[detailOrder.status] || {}).label || detailOrder.status}
                </span>
              </div>
              <button onClick={() => setDetailOrder(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-3 text-xs">
              <Row label="Mode" value={
                MODE_CONFIG[detailOrder.mode]
                  ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${MODE_CONFIG[detailOrder.mode].color}`}>{MODE_LABELS[detailOrder.mode]}</span>
                  : detailOrder.mode
              } />
              <hr className="border-gray-100" />
              <Row label="Source"    value={detailOrder.source_variant_label} />
              <Row label="Src Batch" value={<span className="font-mono text-orange-600">{detailOrder.source_batch_code}</span>} />
              <Row label="Src Loc"   value={detailOrder.source_location_name} />
              <Row label="Src Qty"   value={parseFloat(detailOrder.source_quantity).toLocaleString()} />
              <hr className="border-gray-100" />
              <Row label="Destination" value={detailOrder.destination_variant_label} />
              <Row label="Dst Loc"     value={detailOrder.destination_location_name} />
              <Row label="Output Qty"  value={detailOrder.output_quantity ? parseFloat(detailOrder.output_quantity).toLocaleString() : '—'} />
              {detailOrder.assembly_location_name && (
                <Row label="Assembly Line" value={
                  <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{detailOrder.assembly_location_name}</span>
                } />
              )}
              {detailOrder.recovery_batch_code && (
                <Row label="Recovery Batch" value={<span className="font-mono text-blue-600">{detailOrder.recovery_batch_code}</span>} />
              )}
              {detailOrder.linked_assembly_number && (
                <Row label="Assembly Order" value={<span className="font-mono text-indigo-600">{detailOrder.linked_assembly_number}</span>} />
              )}
              {detailOrder.linked_production_number && (
                <Row label="Production Order" value={<span className="font-mono text-amber-600">{detailOrder.linked_production_number}</span>} />
              )}
              {detailOrder.notes && <Row label="Notes" value={detailOrder.notes} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{label}</span>
      <span className="text-gray-800 text-right">{value || '—'}</span>
    </div>
  )
}

function StatCard({ label, value, valueColor, bg = 'bg-white', isActive, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl shadow-sm p-4 border cursor-pointer transition-all select-none ${
        isActive
          ? `${bg} border-orange-400 ring-2 ring-orange-200`
          : `${bg} border-gray-100 hover:border-orange-300 hover:shadow-md`
      }`}
    >
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-black ${valueColor}`}>{value}</p>
      {isActive && <p className="text-[9px] text-orange-500 font-semibold mt-1 uppercase tracking-wide">Filtered ×</p>}
    </div>
  )
}
