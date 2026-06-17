import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch, getApiError } from '../utils/api'

const PAGE_SIZE = 10

const STATUS_CONFIG = {
  draft:      { label: 'Draft',      color: 'bg-slate-100 text-slate-600' },
  dispatched: { label: 'Dispatched', color: 'bg-violet-50 text-violet-700' },
  received:   { label: 'Received',   color: 'bg-green-50 text-green-700' },
  rejected:   { label: 'Rejected',   color: 'bg-red-50 text-red-600' },
  cancelled:  { label: 'Cancelled',  color: 'bg-gray-100 text-gray-400' },
}

const emptyForm = { customer: '', vehicle_number: '', driver_name: '', notes: '' }

export default function DispatchOrdersPage() {
  const [orders, setOrders]             = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [filterOpen, setFilterOpen]     = useState(false)
  const [activeCard, setActiveCard]     = useState('')
  const [page, setPage]                 = useState(1)
  const [error, setError]               = useState('')
  const filterRef                       = useRef(null)

  const [customers, setCustomers]       = useState([])
  const [dealerOrders, setDealerOrders] = useState([])

  const [createOpen, setCreateOpen]   = useState(false)
  const [form, setForm]               = useState(emptyForm)
  const [fromDealerOrder, setFromDealerOrder] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [formError, setFormError]     = useState('')

  const [detailOrder, setDetailOrder]       = useState(null)
  const [actionLoading, setActionLoading]   = useState(null)
  const [actionError, setActionError]       = useState('')

  // QR scan state
  const [qrInput, setQrInput]   = useState('')
  const [qrLoading, setQrLoading] = useState(false)
  const [qrResult, setQrResult] = useState(null)
  const [qrError, setQrError]   = useState('')
  const [qrQty, setQrQty]       = useState('1')
  const qrInputRef              = useRef(null)

  // Edit quantity for an item
  const [editingQty, setEditingQty]   = useState({}) // { itemId: value }

  // Received / reject notes
  const [receivedNotes, setReceivedNotes] = useState('')
  const [rejectNotes, setRejectNotes]     = useState('')
  const [showReceiveForm, setShowReceiveForm] = useState(false)
  const [showRejectForm, setShowRejectForm]   = useState(false)

  useEffect(() => { fetchOrders() }, [search, statusFilter])
  useEffect(() => { fetchCustomers(); fetchDealerOrders() }, [])

  useEffect(() => {
    const h = e => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)       params.append('search', search)
      if (statusFilter) params.append('status', statusFilter)
      const res = await apiFetch(`/dispatch/dispatch-orders/?${params}`)
      if (res?.ok) { const d = await res.json(); setOrders(Array.isArray(d) ? d : (d.results ?? [])) }
      else setOrders([])
    } catch { setError('Failed to load dispatch orders') }
    finally { setLoading(false) }
  }

  const fetchCustomers = async () => {
    const res = await apiFetch('/users/dealers/')
    if (res?.ok) { const d = await res.json(); setCustomers(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const fetchDealerOrders = async () => {
    const res = await apiFetch('/dispatch/dealer-orders/')
    if (res?.ok) { const d = await res.json(); setDealerOrders(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }))

  const openCreate = () => {
    setForm(emptyForm); setFromDealerOrder(''); setFormError(''); setCreateOpen(true)
  }

  const handleCreate = async () => {
    if (!form.customer && !fromDealerOrder) { setFormError('Customer or Dealer Order is required.'); return }
    setSubmitting(true); setFormError('')
    try {
      let endpoint, payload
      if (fromDealerOrder) {
        // Use create-dispatch action on the dealer order — auto-populates items
        const selected = dealerOrders.find(o => String(o.id) === String(fromDealerOrder))
        endpoint = `/dispatch/dealer-orders/${fromDealerOrder}/create-dispatch/`
        payload  = {
          vehicle_number: form.vehicle_number,
          driver_name:    form.driver_name,
          notes:          form.notes,
        }
        const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(payload) })
        if (res?.ok) {
          const data = await res.json()
          setCreateOpen(false); fetchOrders(); fetchDealerOrders()
          openDetail(data)
        } else setFormError(await getApiError(res))
      } else {
        payload = {
          customer:       parseInt(form.customer),
          vehicle_number: form.vehicle_number,
          driver_name:    form.driver_name,
          notes:          form.notes,
        }
        const res = await apiFetch('/dispatch/dispatch-orders/', { method: 'POST', body: JSON.stringify(payload) })
        if (res?.ok) {
          const data = await res.json()
          setCreateOpen(false); fetchOrders()
          openDetail(data)
        } else setFormError(await getApiError(res))
      }
    } catch { setFormError('Connection error') }
    finally { setSubmitting(false) }
  }

  // ── QR scan (upsert-scan) ────────────────────────────────────────────────────

  const handleQrScan = async () => {
    const code = qrInput.trim()
    if (!code) return

    // Pallet fast-path: PAL-XXXXXXXX bulk-adds all FIN items
    if (code.startsWith('PAL-')) {
      setQrLoading(true); setQrError(''); setQrResult(null)
      try {
        const res = await apiFetch(`/dispatch/dispatch-orders/${detailOrder.id}/upsert-scan/`, {
          method: 'POST',
          body: JSON.stringify({ pallet_code: code }),
        })
        if (res?.ok) {
          setDetailOrder(await res.json())
          setQrInput(''); setQrError('')
          setTimeout(() => qrInputRef.current?.focus(), 50)
        } else setQrError(await getApiError(res))
      } catch { setQrError('Connection error') }
      finally { setQrLoading(false) }
      return
    }

    setQrLoading(true); setQrError(''); setQrResult(null)
    try {
      const res = await apiFetch(`/dispatch/dispatch-orders/scan-qr/?qr=${encodeURIComponent(code)}`)
      if (res?.ok) { setQrResult(await res.json()) }
      else { setQrError(await getApiError(res)) }
    } catch { setQrError('Connection error') }
    finally { setQrLoading(false) }
  }

  const handleUpsertScan = async () => {
    if (!qrResult || !detailOrder) return
    const qty = parseFloat(qrQty)
    if (!qty || qty <= 0) { setQrError('Quantity must be > 0.'); return }
    setActionLoading('qr-upsert')
    try {
      const res = await apiFetch(`/dispatch/dispatch-orders/${detailOrder.id}/upsert-scan/`, {
        method: 'POST',
        body: JSON.stringify({
          variant_id: qrResult.variant_id,
          batch_id:   qrResult.batch_id,
          quantity:   qty,
        }),
      })
      if (res?.ok) {
        setDetailOrder(await res.json())
        setQrResult(null); setQrInput(''); setQrError(''); setQrQty('1')
        setTimeout(() => qrInputRef.current?.focus(), 50)
      } else setQrError(await getApiError(res))
    } catch { setQrError('Failed to add scan') }
    finally { setActionLoading(null) }
  }

  const handleRemoveItem = async (itemId) => {
    if (!detailOrder) return
    setActionLoading(`item-${itemId}`)
    try {
      const res = await apiFetch(`/dispatch/dispatch-orders/${detailOrder.id}/remove-item/${itemId}/`, { method: 'DELETE' })
      if (res?.ok) { setDetailOrder(await res.json()) }
      else setActionError(await getApiError(res))
    } catch { setActionError('Failed to remove item') }
    finally { setActionLoading(null) }
  }

  const handleUpdateItemQty = async (itemId) => {
    const qty = parseFloat(editingQty[itemId])
    if (!qty || qty <= 0) return
    setActionLoading(`edit-${itemId}`)
    try {
      const res = await apiFetch(`/dispatch/dispatch-orders/${detailOrder.id}/update-item/${itemId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: qty }),
      })
      if (res?.ok) {
        setDetailOrder(await res.json())
        setEditingQty(p => { const n = { ...p }; delete n[itemId]; return n })
      } else setActionError(await getApiError(res))
    } catch { setActionError('Failed to update item') }
    finally { setActionLoading(null) }
  }

  // ── Status transitions ───────────────────────────────────────────────────────

  const handleDispatch = async () => {
    if (!window.confirm(`Dispatch ${detailOrder?.dispatch_number}? This will deduct stock from inventory.`)) return
    setActionError(''); setActionLoading('dispatch')
    try {
      const res = await apiFetch(`/dispatch/dispatch-orders/${detailOrder.id}/dispatch/`, { method: 'POST' })
      if (res?.ok) { setDetailOrder(await res.json()); fetchOrders() }
      else setActionError(await getApiError(res))
    } catch { setActionError('Connection error') }
    finally { setActionLoading(null) }
  }

  const handleConfirmReceived = async () => {
    setActionError(''); setActionLoading('confirm-received')
    try {
      const res = await apiFetch(`/dispatch/dispatch-orders/${detailOrder.id}/confirm-received/`, {
        method: 'POST',
        body: JSON.stringify({ notes: receivedNotes }),
      })
      if (res?.ok) {
        setDetailOrder(await res.json()); fetchOrders()
        setShowReceiveForm(false); setReceivedNotes('')
      } else setActionError(await getApiError(res))
    } catch { setActionError('Connection error') }
    finally { setActionLoading(null) }
  }

  const handleRejectDelivery = async () => {
    setActionError(''); setActionLoading('reject-delivery')
    try {
      const res = await apiFetch(`/dispatch/dispatch-orders/${detailOrder.id}/reject-delivery/`, {
        method: 'POST',
        body: JSON.stringify({ notes: rejectNotes }),
      })
      if (res?.ok) {
        setDetailOrder(await res.json()); fetchOrders()
        setShowRejectForm(false); setRejectNotes('')
      } else setActionError(await getApiError(res))
    } catch { setActionError('Connection error') }
    finally { setActionLoading(null) }
  }

  const handleCancel = async () => {
    if (!window.confirm(`Cancel ${detailOrder?.dispatch_number}?`)) return
    setActionError(''); setActionLoading('cancel')
    try {
      const res = await apiFetch(`/dispatch/dispatch-orders/${detailOrder.id}/cancel/`, { method: 'POST' })
      if (res?.ok) { setDetailOrder(await res.json()); fetchOrders() }
      else setActionError(await getApiError(res))
    } catch { setActionError('Connection error') }
    finally { setActionLoading(null) }
  }

  // ── Stats ────────────────────────────────────────────────────────────────────

  const stats = {
    total:      orders.length,
    draft:      orders.filter(o => o.status === 'draft').length,
    dispatched: orders.filter(o => o.status === 'dispatched').length,
    received:   orders.filter(o => o.status === 'received').length,
    rejected:   orders.filter(o => ['rejected', 'cancelled'].includes(o.status)).length,
  }

  const handleCardClick = (card) => {
    if (activeCard === card) { setActiveCard(''); setStatusFilter(''); setPage(1); return }
    setActiveCard(card); setPage(1)
    const map = { draft: 'draft', dispatched: 'dispatched', received: 'received', rejected: 'rejected', total: '' }
    setStatusFilter(map[card] ?? '')
  }

  const paginated  = orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE))

  const openDetail = (order) => {
    setDetailOrder(order)
    setQrResult(null); setQrInput(''); setQrError(''); setQrQty('1')
    setActionError(''); setEditingQty({})
    setShowReceiveForm(false); setShowRejectForm(false)
    setReceivedNotes(''); setRejectNotes('')
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Sales / Dispatch Orders</p>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <StatCard label="Total"      value={stats.total}      valueColor="text-gray-800"   isActive={activeCard === 'total'}      onClick={() => handleCardClick('total')} />
            <StatCard label="Draft"      value={stats.draft}      valueColor="text-slate-600"  bg="bg-slate-50"  isActive={activeCard === 'draft'}      onClick={() => handleCardClick('draft')} />
            <StatCard label="Dispatched" value={stats.dispatched} valueColor="text-violet-700" bg="bg-violet-50" isActive={activeCard === 'dispatched'} onClick={() => handleCardClick('dispatched')} />
            <StatCard label="Received"   value={stats.received}   valueColor="text-green-700"  bg="bg-green-50"  isActive={activeCard === 'received'}   onClick={() => handleCardClick('received')} />
            <StatCard label="Rejected"   value={stats.rejected}   valueColor="text-red-600"    bg="bg-red-50"    isActive={activeCard === 'rejected'}   onClick={() => handleCardClick('rejected')} />
          </div>

          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Dispatch Orders</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Track outgoing finished goods to dealers</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search dispatch…" className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-44" />
                </div>
                <div className="relative" ref={filterRef}>
                  <button
                    onClick={() => setFilterOpen(o => !o)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                  >
                    Filters {statusFilter && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] text-white font-semibold">1</span>}
                  </button>
                  {filterOpen && (
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-48 rounded-xl bg-white border border-gray-200 shadow-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">Filters</p>
                        {statusFilter && <button onClick={() => { setStatusFilter(''); setActiveCard(''); setPage(1) }} className="text-[10px] text-orange-500 hover:underline">Clear</button>}
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Status</label>
                        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setActiveCard(''); setPage(1) }} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
                          <option value="">All</option>
                          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={openCreate} className="rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-orange-600 transition-colors">
                  + New Dispatch
                </button>
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
                    <th className="px-4 py-3">Dispatch #</th>
                    <th className="px-4 py-3">Dealer Order</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3">Vehicle</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Dispatched</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr><td colSpan={9} className="px-6 py-10 text-center text-gray-400 italic">No dispatch orders found.</td></tr>
                  ) : paginated.map((order, idx) => {
                    const sc = STATUS_CONFIG[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-500' }
                    return (
                      <tr key={order.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => openDetail(order)}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{order.dispatch_number}</span>
                        </td>
                        <td className="px-4 py-3">
                          {order.dealer_order_number
                            ? <span className="font-mono text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{order.dealer_order_number}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium text-gray-800">{order.customer_name}</div>
                          <div className="text-[9px] text-gray-400">{order.customer_code}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold ${order.total_items > 0 ? 'text-gray-800' : 'text-gray-300'}`}>{order.total_items}</span>
                          <span className="text-[10px] text-gray-400 ml-1">items</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{order.vehicle_number || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${sc.color}`}>{sc.label}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{order.dispatched_at ? new Date(order.dispatched_at).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{new Date(order.created_at).toLocaleDateString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {orders.length === 0 ? '0' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, orders.length)}`} of {orders.length} orders
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

      {/* ── Create Modal ──────────────────────────────────────────────────────── */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">New Dispatch Order</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Link to an approved dealer order or create standalone</p>
              </div>
              <button onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{formError}</div>}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">From Dealer Order (auto-fill items)</label>
                <select value={fromDealerOrder} onChange={e => { setFromDealerOrder(e.target.value); if (e.target.value) setForm(p => ({ ...p, customer: '' })) }} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none">
                  <option value="">— No dealer order (standalone) —</option>
                  {dealerOrders.map(o => <option key={o.id} value={o.id}>{o.order_number} · {o.customer_name} ({o.total_items} items)</option>)}
                </select>
              </div>

              {!fromDealerOrder && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Customer *</label>
                  <select value={form.customer} onChange={e => set('customer', e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none">
                    <option value="">— Select customer —</option>
                    {customers.filter(u => u.customer_id).map(u => <option key={u.customer_id} value={u.customer_id}>{u.fullname} ({u.username})</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Vehicle Number</label>
                  <input value={form.vehicle_number} onChange={e => set('vehicle_number', e.target.value)} placeholder="e.g. BA 1234 PA" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Driver Name</label>
                  <input value={form.driver_name} onChange={e => set('driver_name', e.target.value)} placeholder="Driver name" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes…" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-slate-50/30">
              <button onClick={() => setCreateOpen(false)} className="rounded-lg border border-gray-200 px-6 py-2 text-sm font-bold text-slate-500 hover:bg-white">Cancel</button>
              <button onClick={handleCreate} disabled={submitting} className="rounded-lg bg-orange-500 px-8 py-2 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-50 transition-all">
                {submitting ? 'Creating…' : 'Create Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Drawer ─────────────────────────────────────────────────────── */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40" onClick={() => setDetailOrder(null)}>
          <div className="bg-white h-full w-full max-w-2xl shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{detailOrder.dispatch_number}</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${(STATUS_CONFIG[detailOrder.status] || {}).color}`}>
                  {(STATUS_CONFIG[detailOrder.status] || {}).label || detailOrder.status}
                </span>
                {detailOrder.dealer_order_number && (
                  <span className="font-mono text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                    {detailOrder.dealer_order_number}
                  </span>
                )}
              </div>
              <button onClick={() => setDetailOrder(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {actionError && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
                  <span>{actionError}</span>
                  <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <Row label="Customer"      value={<span className="font-semibold">{detailOrder.customer_name} <span className="text-gray-400 font-normal">({detailOrder.customer_code})</span></span>} />
                <Row label="Vehicle"       value={detailOrder.vehicle_number || '—'} />
                <Row label="Driver"        value={detailOrder.driver_name || '—'} />
                {detailOrder.dispatched_by_name && <Row label="Dispatched by" value={detailOrder.dispatched_by_name} />}
                {detailOrder.dispatched_at      && <Row label="Dispatched at" value={new Date(detailOrder.dispatched_at).toLocaleString()} />}
                {detailOrder.notes              && <Row label="Notes"         value={detailOrder.notes} />}
                {detailOrder.dealer_notes       && <Row label="Dealer notes"  value={<span className="italic text-gray-600">{detailOrder.dealer_notes}</span>} />}
              </div>

              {/* ── Dealer Order Reference ───────────────────────────────────── */}
              {detailOrder.dealer_order_items?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                    Dealer Order Reference
                    {detailOrder.dealer_order_number && (
                      <span className="ml-1.5 font-mono text-[9px] font-normal text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                        {detailOrder.dealer_order_number}
                      </span>
                    )}
                  </p>
                  <div className="space-y-1.5">
                    {detailOrder.dealer_order_items.map(ref => {
                      const scannedQty = (detailOrder.items || [])
                        .filter(i => i.finished_product_variant === ref.finished_product_variant)
                        .reduce((sum, i) => sum + parseFloat(i.quantity), 0)
                      const targetQty = parseFloat(ref.approved_quantity ?? ref.requested_quantity)
                      const fulfilled = scannedQty >= targetQty
                      const pct = targetQty > 0 ? Math.min(100, Math.round((scannedQty / targetQty) * 100)) : 0
                      return (
                        <div
                          key={ref.id}
                          className={`rounded-lg border px-3 py-2 ${fulfilled ? 'border-green-200 bg-green-50/40' : 'border-amber-100 bg-amber-50/30'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-gray-800 truncate">{ref.variant_label}</div>
                              <span className="font-mono text-[9px] text-orange-500 bg-orange-50 px-1 py-0.5 rounded border border-orange-100">{ref.sku_code}</span>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-[9px] text-gray-400 uppercase font-semibold">Scanned / Target</div>
                              <div className={`text-xs font-bold ${fulfilled ? 'text-green-700' : 'text-amber-700'}`}>
                                {scannedQty.toLocaleString()} / {targetQty.toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <div className="mt-1.5 h-1 rounded-full bg-gray-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${fulfilled ? 'bg-green-500' : 'bg-amber-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── QR scanner (draft only) ──────────────────────────────────── */}
              {detailOrder.status === 'draft' && (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Scan QR Code</p>
                  <p className="text-[9px] text-gray-400">Format: SKU_CODE or SKU_CODE|BATCH_CODE for items; PAL-XXXXXXXX to bulk-add a pallet.</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.24M16.243 17.657l1.414-1.414M6.343 6.343L4.929 4.929M6.343 17.657l-1.414-1.414M17.657 6.343l1.414-1.414" />
                      </svg>
                      <input
                        ref={qrInputRef}
                        value={qrInput}
                        onChange={e => setQrInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleQrScan() }}
                        placeholder="Scan QR or type SKU[|BATCH], press Enter…"
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border-2 border-orange-300 bg-orange-50/30 text-sm font-mono focus:border-orange-500 focus:outline-none"
                        autoFocus
                      />
                    </div>
                    <button onClick={handleQrScan} disabled={qrLoading || !qrInput.trim()} className="px-4 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 disabled:opacity-50 transition-colors">
                      {qrLoading ? '…' : 'Scan'}
                    </button>
                  </div>
                  {qrError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{qrError}</div>}

                  {qrResult && (
                    <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-3">
                      <p className="text-[10px] font-bold text-teal-700 uppercase mb-0.5">{qrResult.variant_label}</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <span className="font-mono text-[9px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">{qrResult.sku_code}</span>
                        {qrResult.batch_code && <span className="font-mono text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">Batch: {qrResult.batch_code}</span>}
                      </div>
                      <div className="flex gap-2 items-center">
                        <input
                          type="number" min="0.01" step="0.01"
                          value={qrQty}
                          onChange={e => setQrQty(e.target.value)}
                          className="w-28 rounded-lg border border-teal-200 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
                          placeholder="Qty"
                        />
                        <button onClick={handleUpsertScan} disabled={actionLoading === 'qr-upsert'} className="flex-1 rounded-lg bg-teal-500 py-1.5 text-xs font-bold text-white hover:bg-teal-600 disabled:opacity-50">
                          {actionLoading === 'qr-upsert' ? 'Adding…' : 'Add / Increment'}
                        </button>
                        <button onClick={() => { setQrResult(null); setQrInput(''); qrInputRef.current?.focus() }} className="text-gray-400 hover:text-gray-600 text-sm">×</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Items list ───────────────────────────────────────────────── */}
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Items ({detailOrder.total_items})</p>
                {detailOrder.items?.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-gray-400 italic">
                    {detailOrder.status === 'draft' ? 'No items yet — scan QR codes above.' : 'No items recorded.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detailOrder.items?.map(item => {
                      const isEditing = item.id in editingQty
                      return (
                        <div key={item.id} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-gray-800 truncate">{item.variant_label}</div>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                <span className="font-mono text-[9px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">{item.sku_code}</span>
                                {item.batch_code && <span className="font-mono text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">Batch: {item.batch_code}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {detailOrder.status === 'draft' && isEditing ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number" min="0.01" step="0.01"
                                    value={editingQty[item.id]}
                                    onChange={e => setEditingQty(p => ({ ...p, [item.id]: e.target.value }))}
                                    className="w-20 rounded border border-orange-200 px-2 py-0.5 text-xs text-right focus:outline-none"
                                  />
                                  <button onClick={() => handleUpdateItemQty(item.id)} disabled={actionLoading === `edit-${item.id}`} className="text-teal-600 hover:text-teal-700 text-xs font-bold">✓</button>
                                  <button onClick={() => setEditingQty(p => { const n = { ...p }; delete n[item.id]; return n })} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                                </div>
                              ) : (
                                <div className="text-right">
                                  <div className="text-[9px] text-gray-400 uppercase font-semibold">Qty</div>
                                  <div className="text-xs font-bold text-gray-700 flex items-center gap-1">
                                    {parseFloat(item.quantity).toLocaleString()}
                                    {detailOrder.status === 'draft' && (
                                      <button
                                        onClick={() => setEditingQty(p => ({ ...p, [item.id]: item.quantity }))}
                                        className="text-gray-300 hover:text-gray-500 text-[10px] ml-0.5"
                                        title="Edit qty"
                                      >✎</button>
                                    )}
                                  </div>
                                </div>
                              )}
                              {detailOrder.status === 'draft' && !isEditing && (
                                <button onClick={() => handleRemoveItem(item.id)} disabled={actionLoading === `item-${item.id}`} className="text-red-400 hover:text-red-600 text-sm disabled:opacity-30 ml-1" title="Remove">×</button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* ── Confirm received form ────────────────────────────────────── */}
              {detailOrder.status === 'dispatched' && showReceiveForm && (
                <div className="space-y-2 rounded-lg border border-green-200 bg-green-50/30 p-4">
                  <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">Confirm Receipt</p>
                  <textarea rows={2} value={receivedNotes} onChange={e => setReceivedNotes(e.target.value)} placeholder="Optional notes about receipt…" className="w-full rounded-lg border border-green-200 px-3 py-2 text-sm focus:border-green-400 outline-none resize-none" />
                  <div className="flex gap-2">
                    <button onClick={handleConfirmReceived} disabled={actionLoading === 'confirm-received'} className="flex-1 rounded-lg bg-green-500 py-2 text-xs font-bold text-white hover:bg-green-600 disabled:opacity-50">
                      {actionLoading === 'confirm-received' ? 'Confirming…' : 'Confirm Received'}
                    </button>
                    <button onClick={() => setShowReceiveForm(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-gray-500 hover:bg-white">Cancel</button>
                  </div>
                </div>
              )}

              {/* ── Reject delivery form ─────────────────────────────────────── */}
              {detailOrder.status === 'dispatched' && showRejectForm && (
                <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/30 p-4">
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide">Reject Delivery</p>
                  <textarea rows={2} value={rejectNotes} onChange={e => setRejectNotes(e.target.value)} placeholder="Reason for rejecting the delivery…" className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm focus:border-red-400 outline-none resize-none" />
                  <div className="flex gap-2">
                    <button onClick={handleRejectDelivery} disabled={actionLoading === 'reject-delivery'} className="flex-1 rounded-lg bg-red-500 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50">
                      {actionLoading === 'reject-delivery' ? 'Processing…' : 'Reject Delivery'}
                    </button>
                    <button onClick={() => setShowRejectForm(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-gray-500 hover:bg-white">Cancel</button>
                  </div>
                </div>
              )}

              {/* ── Action buttons ───────────────────────────────────────────── */}
              <div className="flex flex-wrap gap-2 pt-2">
                {detailOrder.status === 'draft' && (
                  <>
                    <button
                      onClick={handleDispatch}
                      disabled={actionLoading === 'dispatch' || detailOrder.total_items === 0}
                      className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-bold text-white hover:bg-violet-600 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === 'dispatch' ? '…' : 'Dispatch (Deduct Stock)'}
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={actionLoading === 'cancel'}
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                )}
                {detailOrder.status === 'dispatched' && !showReceiveForm && !showRejectForm && (
                  <>
                    <button
                      onClick={() => setShowReceiveForm(true)}
                      className="rounded-lg bg-green-500 px-4 py-2 text-xs font-bold text-white hover:bg-green-600 transition-colors"
                    >
                      Confirm Received
                    </button>
                    <button
                      onClick={() => setShowRejectForm(true)}
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Reject Delivery
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-gray-800">{value || '—'}</span>
    </div>
  )
}

function StatCard({ label, value, valueColor, bg = 'bg-white', isActive, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl shadow-sm p-4 border cursor-pointer transition-all select-none ${
        isActive ? `${bg} border-orange-400 ring-2 ring-orange-200` : `${bg} border-gray-100 hover:border-orange-300 hover:shadow-md`
      }`}
    >
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-black ${valueColor}`}>{value}</p>
      {isActive && <p className="text-[9px] text-orange-500 font-semibold mt-1 uppercase tracking-wide">Filtered ×</p>}
    </div>
  )
}
