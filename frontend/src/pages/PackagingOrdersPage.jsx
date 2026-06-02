import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch } from '../utils/api'
import BatchSuccessModal from '../components/BatchSuccessModal'

const PAGE_SIZE = 10

const STATUS_CONFIG = {
  draft:       { label: 'Draft',       color: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'In Progress', color: 'bg-blue-50 text-blue-700' },
  completed:   { label: 'Completed',   color: 'bg-green-50 text-green-700' },
  cancelled:   { label: 'Cancelled',   color: 'bg-red-50 text-red-600' },
}

const PackagingOrdersPage = () => {
  const [orders, setOrders]                     = useState([])
  const [assemblyOrders, setAssemblyOrders]     = useState([])
  const [loading, setLoading]                   = useState(true)
  const [search, setSearch]                     = useState('')
  const [page, setPage]                         = useState(1)
  const [error, setError]                       = useState('')
  const [filters, setFilters]                   = useState({ status: '' })
  const [filterOpen, setFilterOpen]             = useState(false)
  const filterRef                               = useRef(null)

  const [createOpen, setCreateOpen]             = useState(false)
  const [formAssemblyOrder, setFormAssemblyOrder] = useState('')
  const [formNotes, setFormNotes]               = useState('')
  const [submitting, setSubmitting]             = useState(false)
  const [formError, setFormError]               = useState('')

  const [completeTarget, setCompleteTarget]     = useState(null)
  const [stickerConfirmed, setStickerConfirmed] = useState(false)
  const [completing, setCompleting]             = useState(false)
  const [completeError, setCompleteError]       = useState('')
  const [successLog, setSuccessLog]             = useState(null)

  useEffect(() => { fetchOrders(); fetchAssemblyOrders() }, [])
  useEffect(() => { fetchOrders() }, [search, filters])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (filters.status) params.append('status', filters.status)
      const res = await apiFetch(`/packaging/packaging-orders/?${params.toString()}`)
      if (res?.ok) { const d = await res.json(); setOrders(Array.isArray(d) ? d : (d.results ?? [])) }
      else setOrders([])
    } catch { setError('Failed to load packaging orders') }
    finally { setLoading(false) }
  }

  const fetchAssemblyOrders = async () => {
    const res = await apiFetch('/assembly/assembly-orders/?status=assembled')
    if (res?.ok) { const d = await res.json(); setAssemblyOrders(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length
  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE))
  const paginated  = orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const selectedAssembly = assemblyOrders.find(a => String(a.id) === String(formAssemblyOrder))

  const handleCreate = async () => {
    setSubmitting(true); setFormError('')
    try {
      const payload = {
        assembly_order:  formAssemblyOrder ? parseInt(formAssemblyOrder) : null,
        operator_notes:  formNotes,
      }
      const res = await apiFetch('/packaging/packaging-orders/', { method: 'POST', body: JSON.stringify(payload) })
      if (res?.ok) {
        fetchOrders()
        setCreateOpen(false); setFormAssemblyOrder(''); setFormNotes('')
      } else {
        const errData = await res.json()
        setFormError(errData.detail || Object.entries(errData).map(([k, v]) => `${k}: ${Array.isArray(v) ? v[0] : v}`).join('; ') || 'Check your inputs')
      }
    } catch { setFormError('Connection error') }
    finally { setSubmitting(false) }
  }

  const handleStart = async (order) => {
    const res = await apiFetch(`/packaging/packaging-orders/${order.id}/start/`, { method: 'POST' })
    if (res?.ok) fetchOrders()
  }

  const handleCancelOrder = async (order) => {
    if (!window.confirm(`Cancel order ${order.order_number}?`)) return
    const res = await apiFetch(`/packaging/packaging-orders/${order.id}/cancel/`, { method: 'POST' })
    if (res?.ok) fetchOrders()
  }

  const openCompleteModal = (order) => {
    setCompleteTarget(order); setStickerConfirmed(false); setCompleteError('')
  }

  const handleComplete = async () => {
    if (!completeTarget) return
    setCompleting(true); setCompleteError('')
    try {
      const res = await apiFetch(`/packaging/packaging-orders/${completeTarget.id}/complete/`, {
        method: 'POST',
        body: JSON.stringify({ sticker_confirmed: stickerConfirmed }),
      })
      if (res?.ok) {
        const data = await res.json()
        fetchOrders()
        setCompleteTarget(null)
        if (data.batch_code || data.lpn_code) setSuccessLog(data)
      } else {
        const errData = await res.json()
        setCompleteError(errData.detail || errData.error || 'Failed to complete labeling')
      }
    } catch { setCompleteError('Connection error') }
    finally { setCompleting(false) }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Packaging / Packaging Orders</p>

          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Packaging Orders</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Label / finalize filled products — generates LPN for tracking</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => { setCreateOpen(true); setFormError(''); setFormAssemblyOrder(''); setFormNotes('') }} className="flex items-center gap-1.5 rounded-lg bg-orange-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-orange-600">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  New Order
                </button>
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search order..." className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-44" />
                </div>
                <div className="relative" ref={filterRef}>
                  <button onClick={() => setFilterOpen(o => !o)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${activeFilterCount > 0 ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    Filters {activeFilterCount > 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] text-white font-semibold">{activeFilterCount}</span>}
                  </button>
                  {filterOpen && (
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-xl bg-white border border-gray-200 shadow-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">Status</p>
                        {activeFilterCount > 0 && <button onClick={() => { setFilters({ status: '' }); setPage(1) }} className="text-[10px] text-orange-500 hover:underline">Clear</button>}
                      </div>
                      <select value={filters.status} onChange={e => { setFilters({ status: e.target.value }); setPage(1) }} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
                        <option value="">All</option>
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
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
                    <th className="px-4 py-3 w-10">No</th>
                    <th className="px-4 py-3">Order #</th>
                    <th className="px-4 py-3">Assembly Order</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Destination</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Batch / LPN</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr><td colSpan={10} className="px-6 py-10 text-center text-gray-400">No packaging orders found</td></tr>
                  ) : paginated.map((order, idx) => {
                    const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft
                    return (
                      <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{order.order_number}</span>
                        </td>
                        <td className="px-4 py-3">
                          {order.assembly_order_number ? (
                            <span className="font-mono text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">{order.assembly_order_number}</span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 text-sm">{order.finished_product_name || '—'}</div>
                          <div className="text-[10px] text-gray-400">{order.finished_product_variant_label}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{order.destination_location_name || '—'}</td>
                        <td className="px-4 py-3 font-bold text-slate-800 text-xs">
                          {order.assembled_quantity != null
                            ? <>{parseFloat(order.assembled_quantity).toLocaleString()} <span className="font-normal text-gray-400">{order.volume_unit_symbol} {order.unit_name}</span></>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${statusCfg.color}`}>{statusCfg.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            {order.produced_batch_code ? (
                              <span className="font-mono text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 w-fit">{order.produced_batch_code}</span>
                            ) : <span className="text-gray-300 text-[10px]">No batch yet</span>}
                            {order.produced_lpn_code && (
                              <span className="font-mono text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 w-fit">{order.produced_lpn_code}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{new Date(order.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {order.status === 'draft' && (
                              <button onClick={() => handleStart(order)} className="rounded-md bg-blue-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-blue-600">Start</button>
                            )}
                            {order.status === 'in_progress' && (
                              <button onClick={() => openCompleteModal(order)} className="rounded-md bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-amber-600">Label</button>
                            )}
                            {order.status !== 'completed' && order.status !== 'cancelled' && (
                              <button onClick={() => handleCancelOrder(order)} className="rounded-md bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-600 hover:bg-red-100">Cancel</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">Showing {orders.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, orders.length)} of {orders.length}</p>
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

      {/* Create Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">New Packaging Order</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Link to an assembly run to apply labels</p>
              </div>
              <button onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{formError}</div>}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Assembly Order *</label>
                <select value={formAssemblyOrder} onChange={e => setFormAssemblyOrder(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none font-mono">
                  <option value="">Select completed assembly order</option>
                  {assemblyOrders.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.assembly_number} — {a.finished_product_name} {a.finished_product_variant_label}
                      {a.actual_quantity ? ` (${parseFloat(a.actual_quantity).toLocaleString()} ${a.unit_name})` : ''}
                      {a.produced_batch_code ? ` · ${a.produced_batch_code}` : ''}
                    </option>
                  ))}
                </select>
                {assemblyOrders.length === 0 && (
                  <p className="text-[10px] text-amber-600 mt-1">No completed assembly orders found. Complete an assembly first.</p>
                )}
              </div>

              {selectedAssembly && (
                <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wide mb-1">Assembly Details</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-teal-600">Product</span>
                    <span className="font-medium text-teal-800">{selectedAssembly.finished_product_name} · {selectedAssembly.finished_product_variant_label}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-teal-600">Assembled</span>
                    <span className="font-bold text-teal-800">{parseFloat(selectedAssembly.actual_quantity || 0).toLocaleString()} {selectedAssembly.volume_unit_symbol} {selectedAssembly.unit_name}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-teal-600">Location</span>
                    <span className="font-medium text-teal-800">{selectedAssembly.destination_location_name}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-teal-600">Batch</span>
                    <span className="font-mono font-bold text-teal-800">{selectedAssembly.produced_batch_code}</span>
                  </div>
                  {selectedAssembly.added_sticker && (
                    <div className="mt-1 px-2 py-1 rounded bg-amber-50 border border-amber-100">
                      <p className="text-[10px] text-amber-700 font-semibold">Sticker required: {selectedAssembly.sticker_name || '—'}</p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Operator Notes</label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} placeholder="Instructions..." className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-slate-50/30">
              <button onClick={() => setCreateOpen(false)} className="rounded-lg border border-gray-200 px-6 py-2 text-sm font-bold text-slate-500 hover:bg-white">Cancel</button>
              <button onClick={handleCreate} disabled={submitting || !formAssemblyOrder} className="rounded-lg bg-orange-500 px-8 py-2 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-50 active:scale-95 transition-all">
                {submitting ? 'Creating...' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete (Label) Modal */}
      {completeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Apply Label & Complete</h3>
              <button onClick={() => setCompleteTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {completeError && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{completeError}</div>}
              <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Order</span>
                  <span className="font-mono font-bold text-orange-600">{completeTarget.order_number}</span>
                </div>
                {completeTarget.assembly_order_number && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Assembly</span>
                    <span className="font-mono font-bold text-teal-600">{completeTarget.assembly_order_number}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Product</span>
                  <span className="font-medium text-gray-800">{completeTarget.finished_product_name}</span>
                </div>
                {completeTarget.assembled_quantity != null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Quantity</span>
                    <span className="font-bold text-gray-900">{parseFloat(completeTarget.assembled_quantity).toLocaleString()} <span className="font-normal text-gray-400">{completeTarget.volume_unit_symbol} {completeTarget.unit_name}</span></span>
                  </div>
                )}
              </div>

              {completeTarget.added_sticker && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-[11px] font-bold text-amber-700 mb-2">Sticker: {completeTarget.sticker_name || 'Required'}</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={stickerConfirmed} onChange={e => setStickerConfirmed(e.target.checked)} className="w-4 h-4 rounded border-amber-300 text-amber-500 focus:ring-amber-200" />
                    <span className="text-xs font-semibold text-amber-800">Sticker has been applied to all units</span>
                  </label>
                </div>
              )}

              <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-100">
                <p className="text-[10px] text-indigo-700">Completing will generate an LPN label for this batch. Use the QR code to scan and track the product.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-slate-50/30">
              <button onClick={() => setCompleteTarget(null)} className="rounded-lg border border-gray-200 px-5 py-2 text-sm font-bold text-slate-500 hover:bg-white">Cancel</button>
              <button
                onClick={handleComplete}
                disabled={completing || (completeTarget.added_sticker && !stickerConfirmed)}
                className="rounded-lg bg-amber-500 px-6 py-2 text-sm font-bold text-white shadow-lg shadow-amber-200 hover:bg-amber-600 disabled:opacity-50 active:scale-95 transition-all"
              >
                {completing ? 'Labeling...' : 'Apply Label & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {successLog && (
        <BatchSuccessModal log={successLog} onClose={() => setSuccessLog(null)} />
      )}
    </div>
  )
}

export default PackagingOrdersPage
