import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch, getApiError } from '../utils/api'

const PAGE_SIZE = 10

const emptyForm = { customer: '', buyer_name: '', sale_date: '', notes: '' }

export default function DealerSalesPage() {
  const [sales, setSales]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [custFilter, setCustFilter] = useState('')
  const [confirmedFilter, setConfirmedFilter] = useState('')
  const [activeCard, setActiveCard] = useState('')
  const [page, setPage]             = useState(1)
  const [error, setError]           = useState('')

  const [customers, setCustomers]   = useState([])
  const [variants, setVariants]     = useState([])

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm]             = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError]   = useState('')

  const [detailSale, setDetailSale]     = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [actionError, setActionError]   = useState('')

  // QR / variant scan state inside drawer
  const [qrInput, setQrInput]       = useState('')
  const [qrLoading, setQrLoading]   = useState(false)
  const [qrResult, setQrResult]     = useState(null)
  const [qrError, setQrError]       = useState('')
  const [qrQty, setQrQty]           = useState('1')
  const qrInputRef                  = useRef(null)

  // manual add state
  const [addVariant, setAddVariant] = useState('')
  const [addQty, setAddQty]         = useState('')

  useEffect(() => { fetchSales() }, [search, custFilter, confirmedFilter])
  useEffect(() => { fetchCustomers(); fetchVariants() }, [])

  const fetchSales = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)          params.append('search', search)
      if (custFilter)      params.append('customer', custFilter)
      if (confirmedFilter) params.append('is_confirmed', confirmedFilter)
      const res = await apiFetch(`/dispatch/dealer-sales/?${params}`)
      if (res?.ok) { const d = await res.json(); setSales(Array.isArray(d) ? d : (d.results ?? [])) }
      else setSales([])
    } catch { setError('Failed to load dealer sales') }
    finally { setLoading(false) }
  }

  const fetchCustomers = async () => {
    const res = await apiFetch('/users/dealers/')
    if (res?.ok) { const d = await res.json(); setCustomers(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const fetchVariants = async () => {
    const res = await apiFetch('/master-data/finished-product-variants/?is_available=true')
    if (res?.ok) { const d = await res.json(); setVariants(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const refreshDetail = async (id) => {
    const res = await apiFetch(`/dispatch/dealer-sales/${id}/`)
    if (res?.ok) { const d = await res.json(); setDetailSale(d) }
  }

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }))

  const openCreate = () => {
    setForm({ ...emptyForm, sale_date: new Date().toISOString().slice(0, 10) })
    setFormError(''); setCreateOpen(true)
  }

  const handleCreate = async () => {
    if (!form.customer)   { setFormError('Customer is required.'); return }
    if (!form.sale_date)  { setFormError('Sale date is required.'); return }
    setSubmitting(true); setFormError('')
    const payload = {
      customer:   parseInt(form.customer),
      buyer_name: form.buyer_name,
      sale_date:  form.sale_date,
      notes:      form.notes,
    }
    try {
      const res = await apiFetch('/dispatch/dealer-sales/', { method: 'POST', body: JSON.stringify(payload) })
      if (res?.ok) {
        const data = await res.json()
        setCreateOpen(false); fetchSales()
        openDetail(data)
      } else setFormError(await getApiError(res))
    } catch { setFormError('Connection error') }
    finally { setSubmitting(false) }
  }

  // ── QR scan (inside drawer) ──────────────────────────────────────────────────

  const handleQrScan = async () => {
    const code = qrInput.trim()
    if (!code) return
    setQrLoading(true); setQrError(''); setQrResult(null)
    try {
      const res = await apiFetch(`/dispatch/dealer-orders/scan-qr/?qr=${encodeURIComponent(code)}`)
      if (res?.ok) { setQrResult(await res.json()) }
      else { setQrError(await getApiError(res)) }
    } catch { setQrError('Connection error') }
    finally { setQrLoading(false) }
  }

  const handleQrAdd = async () => {
    if (!qrResult || !detailSale) return
    const qty = parseFloat(qrQty)
    if (!qty || qty <= 0) { setQrError('Quantity must be greater than 0.'); return }
    setActionLoading('qr-add')
    try {
      const res = await apiFetch(`/dispatch/dealer-sales/${detailSale.id}/add-items/`, {
        method: 'POST',
        body: JSON.stringify({ items: [{ finished_product_variant: qrResult.variant_id, quantity: qty }] }),
      })
      if (res?.ok) {
        setDetailSale(await res.json())
        setQrResult(null); setQrInput(''); setQrError(''); setQrQty('1')
        setTimeout(() => qrInputRef.current?.focus(), 50)
      } else setQrError(await getApiError(res))
    } catch { setQrError('Failed to add item') }
    finally { setActionLoading(null) }
  }

  const handleManualAdd = async () => {
    if (!addVariant || !addQty) return
    const qty = parseFloat(addQty)
    if (!qty || qty <= 0) return
    setActionLoading('manual-add')
    try {
      const res = await apiFetch(`/dispatch/dealer-sales/${detailSale.id}/add-items/`, {
        method: 'POST',
        body: JSON.stringify({ items: [{ finished_product_variant: parseInt(addVariant), quantity: qty }] }),
      })
      if (res?.ok) { setDetailSale(await res.json()); setAddVariant(''); setAddQty('') }
      else setActionError(await getApiError(res))
    } catch { setActionError('Failed to add item') }
    finally { setActionLoading(null) }
  }

  const handleRemoveItem = async (itemId) => {
    if (!detailSale) return
    setActionLoading(`item-${itemId}`)
    try {
      const res = await apiFetch(`/dispatch/dealer-sales/${detailSale.id}/remove-item/${itemId}/`, { method: 'DELETE' })
      if (res?.ok) { setDetailSale(await res.json()) }
      else setActionError(await getApiError(res))
    } catch { setActionError('Failed to remove item') }
    finally { setActionLoading(null) }
  }

  const handleConfirm = async () => {
    if (!detailSale) return
    if (!window.confirm(`Confirm sale ${detailSale.sale_number}? This will deduct dealer stock.`)) return
    setActionError(''); setActionLoading('confirm')
    try {
      const res = await apiFetch(`/dispatch/dealer-sales/${detailSale.id}/confirm/`, { method: 'POST' })
      if (res?.ok) { setDetailSale(await res.json()); fetchSales() }
      else setActionError(await getApiError(res))
    } catch { setActionError('Connection error') }
    finally { setActionLoading(null) }
  }

  // ── Stats ────────────────────────────────────────────────────────────────────

  const stats = {
    total:     sales.length,
    pending:   sales.filter(s => !s.is_confirmed).length,
    confirmed: sales.filter(s => s.is_confirmed).length,
  }

  const handleCardClick = (card) => {
    if (activeCard === card) { setActiveCard(''); setConfirmedFilter(''); setPage(1); return }
    setActiveCard(card); setPage(1)
    if (card === 'pending')   setConfirmedFilter('false')
    else if (card === 'confirmed') setConfirmedFilter('true')
    else setConfirmedFilter('')
  }

  const paginated  = sales.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(sales.length / PAGE_SIZE))

  const openDetail = (sale) => {
    setDetailSale(sale)
    setQrResult(null); setQrInput(''); setQrError(''); setQrQty('1')
    setActionError(''); setAddVariant(''); setAddQty('')
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Sales / Dealer Sales</p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <StatCard label="Total"     value={stats.total}     valueColor="text-gray-800"   isActive={activeCard === 'total'}     onClick={() => handleCardClick('total')} />
            <StatCard label="Pending"   value={stats.pending}   valueColor="text-amber-700"  bg="bg-amber-50"  isActive={activeCard === 'pending'}   onClick={() => handleCardClick('pending')} />
            <StatCard label="Confirmed" value={stats.confirmed} valueColor="text-green-700"  bg="bg-green-50"  isActive={activeCard === 'confirmed'} onClick={() => handleCardClick('confirmed')} />
          </div>

          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Dealer Sales</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Record and track dealer outgoing sales</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search sales…" className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-44" />
                </div>
                <select value={custFilter} onChange={e => { setCustFilter(e.target.value); setPage(1) }} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
                  <option value="">All Dealers</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.customer_name}</option>)}
                </select>
                <button onClick={openCreate} className="rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-orange-600 transition-colors">
                  + New Sale
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
                    <th className="px-4 py-3">Sale #</th>
                    <th className="px-4 py-3">Dealer</th>
                    <th className="px-4 py-3">Buyer</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-400 italic">No dealer sales found.</td></tr>
                  ) : paginated.map((sale, idx) => (
                    <tr key={sale.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => openDetail(sale)}>
                      <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{sale.sale_number}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-gray-800">{sale.customer_name}</div>
                        <div className="text-[9px] text-gray-400">{sale.customer_code}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{sale.buyer_name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold ${sale.total_items > 0 ? 'text-gray-800' : 'text-gray-300'}`}>{sale.total_items}</span>
                        <span className="text-[10px] text-gray-400 ml-1">items</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{sale.sale_date}</td>
                      <td className="px-4 py-3">
                        {sale.is_confirmed
                          ? <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-green-50 text-green-700">Confirmed</span>
                          : <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700">Pending</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(sale.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {sales.length === 0 ? '0' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, sales.length)}`} of {sales.length} sales
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

      {/* ── Create Modal ─────────────────────────────────────────────────────────── */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">New Dealer Sale</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Add sale items after creating</p>
              </div>
              <button onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{formError}</div>}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Dealer *</label>
                <select value={form.customer} onChange={e => set('customer', e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none">
                  <option value="">— Select dealer —</option>
                  {customers.filter(u => u.customer_id).map(u => <option key={u.customer_id} value={u.customer_id}>{u.fullname} ({u.username})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Buyer Name</label>
                  <input value={form.buyer_name} onChange={e => set('buyer_name', e.target.value)} placeholder="Buyer / shop name" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Sale Date *</label>
                  <input type="date" value={form.sale_date} onChange={e => set('sale_date', e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none" />
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
                {submitting ? 'Creating…' : 'Create Sale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Drawer ─────────────────────────────────────────────────────────── */}
      {detailSale && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40" onClick={() => setDetailSale(null)}>
          <div className="bg-white h-full w-full max-w-2xl shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{detailSale.sale_number}</span>
                {detailSale.is_confirmed
                  ? <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-green-50 text-green-700">Confirmed</span>
                  : <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700">Pending</span>}
              </div>
              <button onClick={() => setDetailSale(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {actionError && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
                  <span>{actionError}</span>
                  <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <Row label="Dealer"    value={<span className="font-semibold">{detailSale.customer_name} <span className="text-gray-400 font-normal">({detailSale.customer_code})</span></span>} />
                <Row label="Buyer"     value={detailSale.buyer_name || '—'} />
                <Row label="Sale Date" value={detailSale.sale_date} />
                {detailSale.notes && <Row label="Notes" value={detailSale.notes} />}
                {detailSale.created_by_name && <Row label="Created by" value={detailSale.created_by_name} />}
              </div>

              {/* QR scan — pending only */}
              {!detailSale.is_confirmed && (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Scan QR Code</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        ref={qrInputRef}
                        value={qrInput}
                        onChange={e => setQrInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleQrScan() }}
                        placeholder="Scan QR or type SKU, press Enter…"
                        className="w-full px-3 py-2.5 rounded-lg border-2 border-orange-300 bg-orange-50/30 text-sm font-mono focus:border-orange-500 focus:outline-none"
                        autoFocus
                      />
                    </div>
                    <button onClick={handleQrScan} disabled={qrLoading || !qrInput.trim()} className="px-4 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 disabled:opacity-50">
                      {qrLoading ? '…' : 'Scan'}
                    </button>
                  </div>
                  {qrError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{qrError}</div>}
                  {qrResult && (
                    <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-3">
                      <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wide mb-1">Found: {qrResult.variant_label}</p>
                      <p className="text-[9px] text-gray-500 mb-2">SKU: {qrResult.sku_code}</p>
                      <div className="flex gap-2 items-center">
                        <input
                          type="number" min="0.01" step="0.01"
                          value={qrQty}
                          onChange={e => setQrQty(e.target.value)}
                          className="w-28 rounded-lg border border-teal-200 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
                          placeholder="Qty"
                        />
                        <button onClick={handleQrAdd} disabled={actionLoading === 'qr-add'} className="flex-1 rounded-lg bg-teal-500 py-1.5 text-xs font-bold text-white hover:bg-teal-600 disabled:opacity-50">
                          {actionLoading === 'qr-add' ? 'Adding…' : 'Add Item'}
                        </button>
                        <button onClick={() => { setQrResult(null); setQrInput(''); qrInputRef.current?.focus() }} className="text-gray-400 hover:text-gray-600 text-sm">×</button>
                      </div>
                    </div>
                  )}

                  {/* Manual add */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Or Add Manually</p>
                    <div className="flex gap-2">
                      <select value={addVariant} onChange={e => setAddVariant(e.target.value)} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-orange-500 outline-none">
                        <option value="">— Select product variant —</option>
                        {variants.map(v => <option key={v.id} value={v.id}>{v.sku_code} — {v.variant_label || v.sku_code}</option>)}
                      </select>
                      <input type="number" min="0.01" step="0.01" value={addQty} onChange={e => setAddQty(e.target.value)} placeholder="Qty" className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none" />
                      <button onClick={handleManualAdd} disabled={!addVariant || !addQty || actionLoading === 'manual-add'} className="px-4 rounded-lg bg-slate-600 text-white text-xs font-bold hover:bg-slate-700 disabled:opacity-50">
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Items list */}
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Items ({detailSale.total_items})</p>
                {detailSale.items?.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-gray-400 italic">
                    {!detailSale.is_confirmed ? 'No items yet — scan a QR code above or add manually.' : 'No items recorded.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detailSale.items?.map(item => (
                      <div key={item.id} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-gray-800 truncate">{item.variant_label}</div>
                            <span className="font-mono text-[9px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">{item.sku_code}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right">
                              <div className="text-[9px] text-gray-400 uppercase font-semibold">Qty</div>
                              <div className="text-xs font-bold text-gray-700">{parseFloat(item.quantity).toLocaleString()}</div>
                            </div>
                            {!detailSale.is_confirmed && (
                              <button onClick={() => handleRemoveItem(item.id)} disabled={actionLoading === `item-${item.id}`} className="text-red-400 hover:text-red-600 text-sm disabled:opacity-30" title="Remove">×</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm action */}
              {!detailSale.is_confirmed && detailSale.total_items > 0 && (
                <button
                  onClick={handleConfirm}
                  disabled={actionLoading === 'confirm'}
                  className="w-full rounded-lg bg-green-500 py-2.5 text-sm font-bold text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === 'confirm' ? 'Confirming…' : 'Confirm Sale (Deduct Dealer Stock)'}
                </button>
              )}
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
