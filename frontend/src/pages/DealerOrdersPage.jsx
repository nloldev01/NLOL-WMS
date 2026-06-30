import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch, getApiError } from '../utils/api'

const PAGE_SIZE = 10

const STATUS_CONFIG = {
  draft:      { label: 'Draft',      color: 'bg-slate-100 text-slate-600' },
  submitted:  { label: 'Submitted',  color: 'bg-amber-50 text-amber-700' },
  approved:   { label: 'Approved',   color: 'bg-blue-50 text-blue-700' },
  rejected:   { label: 'Rejected',   color: 'bg-red-50 text-red-600' },
  dispatched: { label: 'Dispatched', color: 'bg-violet-50 text-violet-700' },
  received:   { label: 'Received',   color: 'bg-green-50 text-green-700' },
}

// Statuses offered in the filter dropdown (no 'draft' — orders are submitted on creation).
const FILTER_STATUSES = ['submitted', 'approved', 'rejected', 'dispatched', 'received']

const emptyForm = { customer: '', notes: '' }

export default function DealerOrdersPage() {
  const navigate = useNavigate()

  const [orders, setOrders]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [activeCard, setActiveCard] = useState('')
  const [page, setPage]             = useState(1)
  const [error, setError]           = useState('')
  const filterRef                   = useRef(null)

  const [customers, setCustomers]   = useState([])

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm]             = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError]   = useState('')

  // One-step create: items are built locally before the order is created.
  const [orderItems, setOrderItems] = useState([])

  const [detailOrder, setDetailOrder]   = useState(null)
  const [actionError, setActionError]   = useState('')

  // Product / variant catalog (used inside the create modal)
  const [finishedProducts, setFinishedProducts] = useState([])
  const [productSearch, setProductSearch]       = useState('')
  const [selectedProduct, setSelectedProduct]   = useState(null)
  const [productVariants, setProductVariants]   = useState([])
  const [variantQty, setVariantQty]             = useState({})
  const [productsLoading, setProductsLoading]   = useState(false)
  const [variantsLoading, setVariantsLoading]   = useState(false)
  const [catalogError, setCatalogError]         = useState('')

  // Create dispatch modal
  const [dispatchForm, setDispatchForm]         = useState({ vehicle_number: '', driver_name: '', notes: '' })
  const [dispatchOpen, setDispatchOpen]         = useState(false)
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false)
  const [dispatchError, setDispatchError]       = useState('')
  const [createdDispatch, setCreatedDispatch]   = useState(null)

  useEffect(() => { fetchOrders() }, [search, statusFilter])
  useEffect(() => { fetchCustomers(); fetchFinishedProducts() }, [])

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
      const res = await apiFetch(`/dispatch/dealer-orders/?${params}`)
      if (res?.ok) { const d = await res.json(); setOrders(Array.isArray(d) ? d : (d.results ?? [])) }
      else setOrders([])
    } catch { setError('Failed to load dealer orders') }
    finally { setLoading(false) }
  }

  const fetchCustomers = async () => {
    const res = await apiFetch('/users/dealers/')
    if (res?.ok) { const d = await res.json(); setCustomers(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const fetchFinishedProducts = async () => {
    setProductsLoading(true); setCatalogError('')
    try {
      const res = await apiFetch('/dispatch/catalog/products/')
      if (res?.ok) {
        const d = await res.json(); setFinishedProducts(Array.isArray(d) ? d : (d.results ?? []))
      } else {
        setCatalogError(await getApiError(res))
      }
    } catch { setCatalogError('Failed to load products.') }
    finally { setProductsLoading(false) }
  }

  const fetchProductVariants = async (productId) => {
    setVariantsLoading(true); setProductVariants([])
    try {
      const res = await apiFetch(`/dispatch/catalog/variants/?finished_product=${productId}`)
      if (res?.ok) { const d = await res.json(); setProductVariants(Array.isArray(d) ? d : (d.results ?? [])) }
      else setCatalogError(await getApiError(res))
    } finally { setVariantsLoading(false) }
  }

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }))

  const openCreate = () => {
    setForm(emptyForm); setFormError('')
    setOrderItems([]); setVariantQty({})
    setSelectedProduct(null); setProductVariants([]); setProductSearch('')
    setCreateOpen(true)
  }

  // ── Local (pre-create) item management ───────────────────────────────────────

  const addLocalItem = (variant, qty) => {
    const q = parseInt(qty, 10)
    if (!variant || !q || q <= 0) return
    setOrderItems(prev => {
      const idx = prev.findIndex(i => i.variant_id === variant.id)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], requested_quantity: copy[idx].requested_quantity + q }
        return copy
      }
      return [...prev, {
        variant_id:         variant.id,
        variant_label:      variant.display_label || variant.sku_code,
        sku_code:           variant.sku_code,
        finished_product:   variant.finished_product,
        requested_quantity: q,
      }]
    })
    setVariantQty(p => ({ ...p, [variant.id]: '' }))
  }

  const removeLocalItem = (variantId) => {
    setOrderItems(prev => prev.filter(i => i.variant_id !== variantId))
  }

  const handleCreate = async () => {
    if (!form.customer) { setFormError('Customer is required.'); return }
    if (orderItems.length === 0) { setFormError('Add at least one item.'); return }
    setSubmitting(true); setFormError('')
    try {
      const res = await apiFetch('/dispatch/dealer-orders/', {
        method: 'POST',
        body: JSON.stringify({
          customer: parseInt(form.customer),
          notes: form.notes,
          items: orderItems.map(i => ({
            finished_product_variant: i.variant_id,
            requested_quantity: i.requested_quantity,
          })),
        }),
      })
      if (res?.ok) {
        setCreateOpen(false); fetchOrders()
      } else setFormError(await getApiError(res))
    } catch { setFormError('Connection error') }
    finally { setSubmitting(false) }
  }

  const handleCreateDispatch = async () => {
    setDispatchSubmitting(true); setDispatchError('')
    try {
      const res = await apiFetch(`/dispatch/dealer-orders/${detailOrder.id}/create-dispatch/`, {
        method: 'POST',
        body: JSON.stringify(dispatchForm),
      })
      if (res?.ok) {
        const data = await res.json()
        setCreatedDispatch(data)
        setDispatchOpen(false)
        const orderRes = await apiFetch(`/dispatch/dealer-orders/${detailOrder.id}/`)
        if (orderRes?.ok) { setDetailOrder(await orderRes.json()) }
        fetchOrders()
      } else setDispatchError(await getApiError(res))
    } catch { setDispatchError('Connection error') }
    finally { setDispatchSubmitting(false) }
  }

  // ── Stats ────────────────────────────────────────────────────────────────────

  const stats = {
    total:      orders.length,
    submitted:  orders.filter(o => o.status === 'submitted').length,
    approved:   orders.filter(o => o.status === 'approved').length,
    done:       orders.filter(o => ['dispatched', 'received', 'rejected'].includes(o.status)).length,
  }

  const handleCardClick = (card) => {
    if (activeCard === card) { setActiveCard(''); setStatusFilter(''); setPage(1); return }
    setActiveCard(card); setPage(1)
    const map = { submitted: 'submitted', approved: 'approved', done: '', total: '' }
    setStatusFilter(map[card] ?? '')
  }

  const paginated  = orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE))

  const openDetail = (order) => {
    setDetailOrder(order)
    setActionError('')
    setCreatedDispatch(null)
  }

  // Derived values for the create modal browser
  const productItemCount = {}
  orderItems.forEach(i => {
    if (i.finished_product) productItemCount[i.finished_product] = (productItemCount[i.finished_product] || 0) + 1
  })
  const filteredProducts = productSearch.trim()
    ? finishedProducts.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    : finishedProducts
  const totalLocalItems = orderItems.length

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Sales / Dealer Orders</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label="Total"     value={stats.total}     valueColor="text-gray-800"   isActive={activeCard === 'total'}     onClick={() => handleCardClick('total')} />
            <StatCard label="Submitted" value={stats.submitted} valueColor="text-amber-700"  bg="bg-amber-50"  isActive={activeCard === 'submitted'} onClick={() => handleCardClick('submitted')} />
            <StatCard label="Approved"  value={stats.approved}  valueColor="text-blue-700"   bg="bg-blue-50"   isActive={activeCard === 'approved'}  onClick={() => handleCardClick('approved')} />
            <StatCard label="Done"      value={stats.done}      valueColor="text-green-700"  bg="bg-green-50"  isActive={activeCard === 'done'}      onClick={() => handleCardClick('done')} />
          </div>

          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Dealer Orders</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Dealer product requests awaiting approval and dispatch</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search orders…" className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-44" />
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
                          {FILTER_STATUSES.map(k => <option key={k} value={k}>{STATUS_CONFIG[k].label}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={openCreate} className="rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-orange-600 transition-colors">
                  + New Order
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
                    <th className="px-4 py-3">Order #</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400 italic">No dealer orders found.</td></tr>
                  ) : paginated.map((order, idx) => {
                    const sc = STATUS_CONFIG[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-500' }
                    return (
                      <tr key={order.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => openDetail(order)}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{order.order_number}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium text-gray-800">{order.customer_name}</div>
                          <div className="text-[9px] text-gray-400">{order.customer_code}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold ${order.total_items > 0 ? 'text-gray-800' : 'text-gray-300'}`}>{order.total_items}</span>
                          <span className="text-[10px] text-gray-400 ml-1">items</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${sc.color}`}>{sc.label}</span>
                        </td>
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

      {/* ── Create Modal — one step: pick products/variants + create ───────────── */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="text-base font-semibold text-gray-900">New Dealer Order</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Pick a customer, add products, then create — the order is submitted right away.</p>
              </div>
              <button onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            {/* Customer + notes */}
            <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Customer *</label>
                <select value={form.customer} onChange={e => set('customer', e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none">
                  <option value="">— Select customer —</option>
                  {customers.filter(u => u.customer_id).map(u => <option key={u.customer_id} value={u.customer_id}>{u.fullname} ({u.username})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Notes</label>
                <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes…" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none" />
              </div>
            </div>

            {formError && <div className="mx-6 mt-3 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex-shrink-0">{formError}</div>}
            {catalogError && <div className="mx-6 mt-3 p-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg flex-shrink-0">{catalogError}</div>}

            {/* 3-column browser */}
            <div className="flex flex-1 overflow-hidden min-h-0 border-t border-gray-100 mt-3">

              {/* Col 1: Products */}
              <div className="w-64 flex-shrink-0 flex flex-col border-r border-gray-100">
                <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 px-1">Products</p>
                  <div className="relative">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      placeholder="Filter products…"
                      className="w-full pl-7 pr-2 py-2 rounded-lg border border-gray-200 text-sm focus:border-orange-400 focus:outline-none bg-white"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {productsLoading ? (
                    <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
                  ) : filteredProducts.length === 0 ? (
                    <p className="text-sm text-gray-400 italic text-center py-8">No products</p>
                  ) : filteredProducts.map(p => {
                    const count = productItemCount[p.id] || 0
                    const isSelected = selectedProduct?.id === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedProduct(p); fetchProductVariants(p.id); setVariantQty({}) }}
                        className={`w-full text-left px-3 py-3 border-b border-gray-100 transition-all flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-orange-50 border-l-[3px] border-l-orange-400'
                            : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'
                        }`}
                      >
                        <span className={`text-sm leading-tight ${isSelected ? 'font-semibold text-orange-700' : count > 0 ? 'font-medium text-gray-800' : 'text-gray-600'}`}>
                          {p.name}
                        </span>
                        {count > 0 && (
                          <span className="flex-shrink-0 min-w-[20px] h-5 px-1 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">
                            {count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Col 2: Variants */}
              <div className="flex-1 flex flex-col border-r border-gray-100 min-w-0">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Variants</p>
                  <p className="text-sm font-semibold text-gray-700 mt-0.5 truncate">
                    {selectedProduct ? selectedProduct.name : '← Select a product'}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {!selectedProduct ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-sm text-gray-400 italic">Select a product to see its variants</p>
                    </div>
                  ) : variantsLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-sm text-gray-400">Loading variants…</p>
                    </div>
                  ) : productVariants.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-sm text-gray-400 italic">No variants available</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {productVariants.map(v => {
                        const existingItem = orderItems.find(i => i.variant_id === v.id)
                        return (
                          <div key={v.id} className={`px-4 py-3 transition-colors ${existingItem ? 'bg-green-50/60' : 'hover:bg-gray-50/80'}`}>
                            <div className="flex items-center gap-3">
                              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center border-2 ${existingItem ? 'bg-green-500 border-green-500' : 'border-gray-200 bg-white'}`}>
                                {existingItem && (
                                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-gray-800 leading-tight">{v.display_label || v.sku_code}</div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="font-mono text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">{v.sku_code}</span>
                                  {existingItem && (
                                    <span className="text-xs font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                                      {parseInt(existingItem.requested_quantity).toLocaleString()} in order
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <input
                                  type="number" min="1" step="1"
                                  value={variantQty[v.id] ?? ''}
                                  onChange={e => setVariantQty(p => ({ ...p, [v.id]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') addLocalItem(v, variantQty[v.id]) }}
                                  placeholder={existingItem ? '+more' : 'Qty'}
                                  className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right focus:border-orange-400 focus:outline-none"
                                />
                                <button
                                  onClick={() => addLocalItem(v, variantQty[v.id])}
                                  disabled={!variantQty[v.id] || parseInt(variantQty[v.id], 10) <= 0}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-40 whitespace-nowrap ${existingItem ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600'}`}
                                >
                                  + Add
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Col 3: Order contents (local) */}
              <div className="w-72 flex-shrink-0 flex flex-col bg-slate-50/50">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                    Order Contents
                    <span className="ml-1.5 px-1.5 py-0.5 bg-orange-500 text-white rounded-full text-xs font-bold">{totalLocalItems}</span>
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                  {orderItems.length === 0 ? (
                    <div className="h-full flex items-center justify-center py-8">
                      <p className="text-sm text-gray-400 italic text-center px-3">No items yet — browse and add variants</p>
                    </div>
                  ) : orderItems.map(item => (
                    <div key={item.variant_id} className="rounded-lg bg-white border border-gray-100 px-3 py-2.5 shadow-sm">
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-gray-800 leading-snug">{item.variant_label}</div>
                          <span className="font-mono text-[10px] text-orange-500">{item.sku_code}</span>
                        </div>
                        <button
                          onClick={() => removeLocalItem(item.variant_id)}
                          className="flex-shrink-0 text-red-300 hover:text-red-500 text-lg leading-none mt-0.5"
                        >×</button>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-400 uppercase tracking-wide">Requested</span>
                        <span className="text-sm font-bold text-gray-700">{parseInt(item.requested_quantity).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-slate-50/30 flex-shrink-0">
              <button onClick={() => setCreateOpen(false)} className="rounded-lg border border-gray-200 px-6 py-2 text-sm font-bold text-slate-500 hover:bg-white">Cancel</button>
              <button onClick={handleCreate} disabled={submitting || orderItems.length === 0} className="rounded-lg bg-orange-500 px-8 py-2 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-50 transition-all">
                {submitting ? 'Creating…' : `Create Order${totalLocalItems > 0 ? ` (${totalLocalItems} items)` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Dispatch sub-modal ─────────────────────────────────────────── */}
      {dispatchOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Create Dispatch Order</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">A draft dispatch will be created — scan items with batch codes on the Dispatch Orders page to confirm.</p>
              </div>
              <button onClick={() => setDispatchOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {dispatchError && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{dispatchError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Vehicle Number</label>
                  <input value={dispatchForm.vehicle_number} onChange={e => setDispatchForm(p => ({ ...p, vehicle_number: e.target.value }))} placeholder="e.g. BA 1234 PA" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Driver Name</label>
                  <input value={dispatchForm.driver_name} onChange={e => setDispatchForm(p => ({ ...p, driver_name: e.target.value }))} placeholder="Driver name" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Notes</label>
                <textarea rows={2} value={dispatchForm.notes} onChange={e => setDispatchForm(p => ({ ...p, notes: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-slate-50/30">
              <button onClick={() => setDispatchOpen(false)} className="rounded-lg border border-gray-200 px-6 py-2 text-sm font-bold text-slate-500 hover:bg-white">Cancel</button>
              <button onClick={handleCreateDispatch} disabled={dispatchSubmitting} className="rounded-lg bg-violet-500 px-8 py-2 text-sm font-bold text-white shadow-lg shadow-violet-200 hover:bg-violet-600 disabled:opacity-50 transition-all">
                {dispatchSubmitting ? 'Creating…' : 'Create Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal — info + items + actions ─────────────────────────────── */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetailOrder(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden"
            style={{ maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                <span className="font-mono text-sm font-bold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-100 flex-shrink-0">
                  {detailOrder.order_number}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${(STATUS_CONFIG[detailOrder.status] || {}).color}`}>
                  {(STATUS_CONFIG[detailOrder.status] || {}).label || detailOrder.status}
                </span>
                <span className="text-sm font-semibold text-gray-700 truncate">{detailOrder.customer_name}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">{detailOrder.customer_code}</span>
              </div>
              <button onClick={() => setDetailOrder(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-4 flex-shrink-0">×</button>
            </div>

            {actionError && (
              <div className="flex items-center justify-between gap-3 mx-6 mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700 flex-shrink-0">
                <span>{actionError}</span>
                <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
              </div>
            )}

            {createdDispatch && (
              <div className="flex items-center justify-between gap-3 mx-6 mt-3 rounded-lg bg-teal-50 border border-teal-200 px-4 py-2.5 flex-shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-teal-800">Dispatch created:</span>
                  <span className="font-mono text-xs font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-200">
                    {createdDispatch.dispatch_number}
                  </span>
                  <span className="text-xs text-teal-600">Scan items with batch codes to confirm.</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => navigate('/sales/dispatch')}
                    className="rounded-lg bg-violet-500 px-3 py-1 text-xs font-bold text-white hover:bg-violet-600"
                  >
                    Go to Dispatch
                  </button>
                  <button onClick={() => setCreatedDispatch(null)} className="text-teal-400 hover:text-teal-600 text-lg leading-none">×</button>
                </div>
              </div>
            )}

            <div className="flex flex-1 overflow-hidden min-h-0">

              {/* Left: order info */}
              <div className="w-56 flex-shrink-0 flex flex-col border-r border-gray-100 bg-gray-50/30 overflow-y-auto">
                <div className="p-5 space-y-4">
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Customer</p>
                    <p className="text-sm font-semibold text-gray-800 mt-1">{detailOrder.customer_name}</p>
                    <p className="text-[10px] text-gray-400">{detailOrder.customer_code}</p>
                  </div>
                  {detailOrder.created_by_name && (
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Created by</p>
                      <p className="text-xs text-gray-700 mt-0.5">{detailOrder.created_by_name}</p>
                    </div>
                  )}
                  {detailOrder.approved_by_name && (
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Approved by</p>
                      <p className="text-xs text-gray-700 mt-0.5">{detailOrder.approved_by_name}</p>
                    </div>
                  )}
                  {detailOrder.notes && (
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Notes</p>
                      <p className="text-xs text-gray-700 mt-0.5">{detailOrder.notes}</p>
                    </div>
                  )}
                  {detailOrder.rejection_reason && (
                    <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                      <p className="text-[9px] font-bold text-red-400 uppercase tracking-wide">Rejection Reason</p>
                      <p className="text-xs text-red-600 italic mt-0.5">{detailOrder.rejection_reason}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: items + actions */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">
                    Items
                    <span className="ml-1.5 px-1.5 py-0.5 bg-slate-400 text-white rounded-full text-[9px] font-bold">{detailOrder.total_items}</span>
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                  {detailOrder.items?.length === 0 ? (
                    <p className="text-xs text-gray-400 italic text-center py-8">No items recorded.</p>
                  ) : detailOrder.items?.map(item => (
                    <div key={item.id} className="rounded-xl border border-gray-100 bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-gray-800 truncate">{item.variant_label}</div>
                          <span className="font-mono text-[9px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">{item.sku_code}</span>
                        </div>
                        <div className="flex items-center gap-5 flex-shrink-0">
                          <div className="text-right">
                            <div className="text-[9px] text-gray-400 uppercase font-semibold">Requested</div>
                            <div className="text-sm font-bold text-gray-700">{parseFloat(item.requested_quantity).toLocaleString()}</div>
                          </div>
                          {item.approved_quantity != null && (
                            <div className="text-right">
                              <div className="text-[9px] text-blue-500 uppercase font-semibold">Approved</div>
                              <div className="text-sm font-bold text-blue-700">{parseFloat(item.approved_quantity).toLocaleString()}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action bar */}
                {!['dispatched', 'received', 'rejected'].includes(detailOrder.status) && (
                  <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
                    <button
                      onClick={() => { setDispatchForm({ vehicle_number: '', driver_name: '', notes: '' }); setDispatchError(''); setDispatchOpen(true) }}
                      disabled={detailOrder.total_items === 0}
                      className="rounded-lg bg-violet-500 px-5 py-2 text-xs font-bold text-white hover:bg-violet-600 disabled:opacity-50 transition-colors"
                    >
                      Dispatch
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
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
