import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import Pagination from '../components/Pagination'
import PageSizeSelector, { DEFAULT_PAGE_SIZE } from '../components/PageSizeSelector'
import { apiFetch, getApiError, hasAccess } from '../utils/api'

const STATUS_CONFIG = {
  draft:      { label: 'Draft',      color: 'bg-slate-100 text-slate-600' },
  submitted:  { label: 'Submitted',  color: 'bg-amber-50 text-amber-700' },
  approved:   { label: 'Approved',   color: 'bg-blue-50 text-blue-700' },
  rejected:   { label: 'Rejected',   color: 'bg-red-50 text-red-600' },
  dispatched: { label: 'Dispatched', color: 'bg-violet-50 text-violet-700' },
  returned:   { label: 'Returned',   color: 'bg-green-50 text-green-700' },
}

const emptyForm = { source_location: '', assembly_reference: '', notes: '', items: [] }

export default function ConsumablesPage() {
  const canWrite = hasAccess('consumables', 'full')

  const [requests, setRequests]   = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState(DEFAULT_PAGE_SIZE)
  const filterRef                 = useRef(null)

  const [consumables, setConsumables] = useState([])
  const [locations, setLocations]     = useState([])
  const [assemblyLocations, setAssemblyLocations] = useState([])

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm]             = useState(emptyForm)
  const [createItem, setCreateItem] = useState({ material: '', requested_quantity: '' })
  const [sourceStock, setSourceStock] = useState({})   // material_id -> available qty at source
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError]   = useState('')

  // Detail modal
  const [detail, setDetail]             = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [actionError, setActionError]   = useState('')

  // Add-item form (draft)
  const [newItem, setNewItem]   = useState({ material: '', requested_quantity: '' })
  // Approve / dispatch / return inputs
  const [approveItems, setApproveItems] = useState({})
  const [usedItems, setUsedItems]       = useState({})
  const [destination, setDestination]   = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject]     = useState(false)

  useEffect(() => { fetchConsumables(); fetchLocations(); fetchAssemblyLocations() }, [])
  useEffect(() => { setPage(1) }, [search, statusFilter, pageSize])
  useEffect(() => { const t = setTimeout(fetchRequests, 250); return () => clearTimeout(t) }, [page, search, statusFilter, pageSize])

  useEffect(() => {
    const h = e => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Seed per-item inputs whenever the detail request changes
  useEffect(() => {
    if (!detail) return
    const ap = {}, us = {}
    detail.items?.forEach(i => {
      ap[i.id] = i.approved_quantity ?? i.requested_quantity
      us[i.id] = i.used_quantity ?? i.dispatched_quantity ?? 0
    })
    setApproveItems(ap); setUsedItems(us)
    setDestination(''); setShowReject(false); setRejectReason('')
    setNewItem({ material: '', requested_quantity: '' })
  }, [detail?.id, detail?.status])

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', page)
      params.append('page_size', pageSize)
      if (search)       params.append('search', search)
      if (statusFilter) params.append('status', statusFilter)
      const res = await apiFetch(`/consumables/requests/?${params}`)
      if (res?.ok) {
        const d = await res.json()
        setRequests(Array.isArray(d) ? d : (d.results ?? []))
        setTotalCount(Array.isArray(d) ? d.length : (d.count ?? 0))
      } else { setRequests([]); setTotalCount(0) }
    } catch { setError('Failed to load consumable requests') }
    finally { setLoading(false) }
  }

  const fetchConsumables = async () => {
    const res = await apiFetch('/master-data/raw-materials-and-consumables/?type=consumable')
    if (res?.ok) { const d = await res.json(); setConsumables(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const fetchLocations = async () => {
    const res = await apiFetch('/master-data/locations/?is_active=true')
    if (res?.ok) { const d = await res.json(); setLocations(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const fetchAssemblyLocations = async () => {
    const res = await apiFetch('/master-data/locations/?type=assembly&is_active=true')
    if (res?.ok) { const d = await res.json(); setAssemblyLocations(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  // Available consumable stock at the selected source location (summed per material)
  const fetchSourceStock = async (locationId) => {
    setSourceStock({})
    if (!locationId) return
    const res = await apiFetch(`/raw-materials-stock/stock/?location=${locationId}&material__type=consumable&page_size=200`)
    if (res?.ok) {
      const d = await res.json()
      const rows = Array.isArray(d) ? d : (d.results ?? [])
      const map = {}
      rows.forEach(r => { map[r.material] = (map[r.material] || 0) + parseFloat(r.quantity || 0) })
      setSourceStock(map)
    }
  }

  const set = (f, v) => {
    setForm(p => ({ ...p, [f]: v }))
    if (f === 'source_location') fetchSourceStock(v)
  }

  const openCreate = () => { setForm(emptyForm); setCreateItem({ material: '', requested_quantity: '' }); setSourceStock({}); setFormError(''); setCreateOpen(true) }

  const addCreateRow = () => {
    const q = parseFloat(createItem.requested_quantity)
    if (!createItem.material || !q || q <= 0) return
    const mat = consumables.find(c => String(c.id) === String(createItem.material))
    const avail = sourceStock[parseInt(createItem.material)] ?? 0
    const already = form.items.filter(i => String(i.material) === String(createItem.material))
      .reduce((s, i) => s + parseFloat(i.requested_quantity), 0)
    if (q + already > avail) {
      setFormError(`Only ${avail.toLocaleString()} ${mat?.unit_symbol || ''} of ${mat?.name} available at the source location.`)
      return
    }
    setFormError('')
    setForm(p => {
      // merge with an existing row for the same consumable
      const existing = p.items.find(i => String(i.material) === String(createItem.material))
      const items = existing
        ? p.items.map(i => String(i.material) === String(createItem.material)
            ? { ...i, requested_quantity: parseFloat(i.requested_quantity) + q } : i)
        : [...p.items, { material: parseInt(createItem.material), requested_quantity: q, name: mat?.name, unit_symbol: mat?.unit_symbol }]
      return { ...p, items }
    })
    setCreateItem({ material: '', requested_quantity: '' })
  }

  const removeCreateRow = (materialId) =>
    setForm(p => ({ ...p, items: p.items.filter(i => String(i.material) !== String(materialId)) }))

  const handleCreate = async () => {
    if (!form.source_location) { setFormError('Source location is required.'); return }
    if (form.items.length === 0) { setFormError('Add at least one consumable.'); return }
    setSubmitting(true); setFormError('')
    try {
      const res = await apiFetch('/consumables/requests/', {
        method: 'POST',
        body: JSON.stringify({
          source_location: parseInt(form.source_location),
          assembly_reference: form.assembly_reference,
          notes: form.notes,
          items: form.items.map(i => ({ material: i.material, requested_quantity: i.requested_quantity })),
        }),
      })
      if (res?.ok) { const data = await res.json(); setCreateOpen(false); fetchRequests(); openDetail(data) }
      else setFormError(await getApiError(res))
    } catch { setFormError('Connection error') }
    finally { setSubmitting(false) }
  }

  const openDetail = (req) => { setDetail(req); setActionError('') }
  const refreshDetail = (data) => { setDetail(data); fetchRequests() }

  const handleAddItem = async () => {
    const q = parseFloat(newItem.requested_quantity)
    if (!newItem.material || !q || q <= 0) return
    setActionLoading('add-item')
    try {
      const res = await apiFetch(`/consumables/requests/${detail.id}/add-items/`, {
        method: 'POST',
        body: JSON.stringify({ items: [{ material: parseInt(newItem.material), requested_quantity: q }] }),
      })
      if (res?.ok) { setDetail(await res.json()); setNewItem({ material: '', requested_quantity: '' }) }
      else setActionError(await getApiError(res))
    } catch { setActionError('Failed to add item') }
    finally { setActionLoading(null) }
  }

  const handleRemoveItem = async (itemId) => {
    setActionLoading(`item-${itemId}`)
    try {
      const res = await apiFetch(`/consumables/requests/${detail.id}/remove-item/${itemId}/`, { method: 'DELETE' })
      if (res?.ok) setDetail(await res.json())
      else setActionError(await getApiError(res))
    } catch { setActionError('Failed to remove item') }
    finally { setActionLoading(null) }
  }

  const doAction = async (endpoint, body, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setActionError(''); setActionLoading(endpoint)
    try {
      const res = await apiFetch(`/consumables/requests/${detail.id}/${endpoint}/`, {
        method: 'POST',
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      if (res?.ok) refreshDetail(await res.json())
      else setActionError(await getApiError(res))
    } catch { setActionError('Connection error') }
    finally { setActionLoading(null) }
  }

  const handleSubmit  = () => doAction('submit', null, `Submit request ${detail?.request_number}?`)
  const handleApprove = () => {
    const items = Object.entries(approveItems).map(([id, aq]) => ({ id: parseInt(id), approved_quantity: parseFloat(aq) || 0 }))
    doAction('approve', { items })
  }
  const handleReject = () => {
    if (!rejectReason.trim()) { setActionError('Rejection reason is required.'); return }
    doAction('reject', { reason: rejectReason })
  }
  const handleDispatch = () => {
    if (!destination) { setActionError('Select a destination (assembly / in-use) location.'); return }
    doAction('dispatch', { destination_location: parseInt(destination) }, 'Dispatch consumables out of stock to the selected location?')
  }
  const handleRecordReturn = () => {
    const items = Object.entries(usedItems).map(([id, uq]) => ({ id: parseInt(id), used_quantity: parseFloat(uq) || 0 }))
    doAction('record-return', { items }, 'Record return? Used quantities will be consumed, the rest returned to stock.')
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const num = (v) => v == null ? '—' : parseFloat(v).toLocaleString(undefined, { maximumFractionDigits: 4 })

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Consumables / Requests</p>

          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Consumable Requests</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Request → approve → dispatch → use → return unused</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search requests…" className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-44" />
                </div>
                <div className="relative" ref={filterRef}>
                  <button onClick={() => setFilterOpen(o => !o)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    Filters {statusFilter && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] text-white font-semibold">1</span>}
                  </button>
                  {filterOpen && (
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-48 rounded-xl bg-white border border-gray-200 shadow-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">Filters</p>
                        {statusFilter && <button onClick={() => setStatusFilter('')} className="text-[10px] text-orange-500 hover:underline">Clear</button>}
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Status</label>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
                          <option value="">All</option>
                          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                {canWrite && (
                  <button onClick={openCreate} className="rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-orange-600 transition-colors">+ New Request</button>
                )}
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
                    <th className="px-4 py-3">Request #</th>
                    <th className="px-4 py-3">Assembly Ref</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3 text-right">Sent</th>
                    <th className="px-4 py-3 text-right">Used</th>
                    <th className="px-4 py-3 text-right">Returned</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {requests.length === 0 ? (
                    <tr><td colSpan={9} className="px-6 py-10 text-center text-gray-400 italic">No consumable requests found.</td></tr>
                  ) : requests.map((req, idx) => {
                    const sc = STATUS_CONFIG[req.status] || { label: req.status, color: 'bg-gray-100 text-gray-500' }
                    const dispatched = ['dispatched', 'returned'].includes(req.status)
                    const returned   = req.status === 'returned'
                    return (
                      <tr key={req.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => openDetail(req)}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * pageSize + idx + 1}</td>
                        <td className="px-4 py-3"><span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{req.request_number}</span></td>
                        <td className="px-4 py-3 text-xs text-gray-700">{req.assembly_reference || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3"><span className="text-xs font-bold text-gray-800">{req.total_items}</span> <span className="text-[10px] text-gray-400">items</span></td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-violet-700">{dispatched ? num(req.total_dispatched) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-amber-700">{returned ? num(req.total_used) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-green-700">{returned ? num(req.total_returned) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${sc.color}`}>{sc.label}</span></td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{new Date(req.created_at).toLocaleDateString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {totalCount === 0 ? 0 : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)}`} of {totalCount}
              </p>
              <div className="flex items-center gap-4">
                <PageSizeSelector pageSize={pageSize} onChange={setPageSize} />
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── Create Modal ── */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">New Consumable Request</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Add consumable line items after creating</p>
              </div>
              <button onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{formError}</div>}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Source Location *</label>
                <select value={form.source_location} onChange={e => set('source_location', e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none">
                  <option value="">— Select location —</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.full_path || l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Assembly Reference</label>
                <input value={form.assembly_reference} onChange={e => set('assembly_reference', e.target.value)} placeholder="e.g. assembly job / batch note" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes…" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none resize-none" />
              </div>

              {/* Consumable line items */}
              <div className="rounded-lg border border-gray-100 bg-slate-50/40 p-3">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Consumables *</label>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <select value={createItem.material} onChange={e => setCreateItem(p => ({ ...p, material: e.target.value }))} disabled={!form.source_location} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none disabled:bg-gray-50 disabled:text-gray-400">
                      <option value="">{form.source_location ? '— Select consumable —' : '— Select source location first —'}</option>
                      {consumables.map(c => {
                        const avail = sourceStock[c.id] ?? 0
                        return <option key={c.id} value={c.id} disabled={avail <= 0}>{c.name}{c.unit_symbol ? ` (${c.unit_symbol})` : ''} — {avail.toLocaleString()} available</option>
                      })}
                    </select>
                  </div>
                  <div className="w-24">
                    <input type="number" min="0" step="any" value={createItem.requested_quantity} onChange={e => setCreateItem(p => ({ ...p, requested_quantity: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCreateRow() } }} placeholder="Qty" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-right focus:border-orange-500 outline-none" />
                  </div>
                  <button type="button" onClick={addCreateRow} disabled={!createItem.material || !createItem.requested_quantity} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-40">+ Add</button>
                </div>
                {form.items.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {form.items.map(i => (
                      <div key={i.material} className="flex items-center justify-between rounded-lg bg-white border border-gray-100 px-3 py-1.5">
                        <span className="text-xs font-medium text-gray-800">{i.name} <span className="text-gray-400">{i.unit_symbol}</span></span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-gray-700">{parseFloat(i.requested_quantity).toLocaleString()}</span>
                          <button type="button" onClick={() => removeCreateRow(i.material)} className="text-red-300 hover:text-red-500 text-lg leading-none">×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-slate-50/30">
              <button onClick={() => setCreateOpen(false)} className="rounded-lg border border-gray-200 px-6 py-2 text-sm font-bold text-slate-500 hover:bg-white">Cancel</button>
              <button onClick={handleCreate} disabled={submitting} className="rounded-lg bg-orange-500 px-8 py-2 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-50 transition-all">
                {submitting ? 'Creating…' : `Create Request${form.items.length ? ` (${form.items.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                <span className="font-mono text-sm font-bold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-100">{detail.request_number}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${(STATUS_CONFIG[detail.status] || {}).color}`}>{(STATUS_CONFIG[detail.status] || {}).label || detail.status}</span>
                {detail.assembly_reference && <span className="text-sm font-semibold text-gray-700 truncate">{detail.assembly_reference}</span>}
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-4">×</button>
            </div>

            {actionError && (
              <div className="flex items-center justify-between gap-3 mx-6 mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
                <span>{actionError}</span>
                <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {/* Info row */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-6 py-4 bg-gray-50/40 border-b border-gray-100 text-xs">
                <div><p className="text-[9px] font-bold text-gray-400 uppercase">Source</p><p className="text-gray-700 mt-0.5">{detail.source_location_name}</p></div>
                <div><p className="text-[9px] font-bold text-gray-400 uppercase">Destination</p><p className="text-gray-700 mt-0.5">{detail.destination_location_name || '—'}</p></div>
                <div><p className="text-[9px] font-bold text-gray-400 uppercase">Created by</p><p className="text-gray-700 mt-0.5">{detail.created_by_name || '—'}</p></div>
                {detail.notes && <div className="col-span-full"><p className="text-[9px] font-bold text-gray-400 uppercase">Notes</p><p className="text-gray-700 mt-0.5">{detail.notes}</p></div>}
                {detail.rejection_reason && <div className="col-span-full rounded-lg border border-red-100 bg-red-50 px-3 py-2"><p className="text-[9px] font-bold text-red-400 uppercase">Rejection Reason</p><p className="text-red-600 italic mt-0.5">{detail.rejection_reason}</p></div>}
              </div>

              {/* Add item (draft only) */}
              {detail.status === 'draft' && canWrite && (
                <div className="flex items-end gap-2 px-6 py-3 border-b border-gray-100">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Consumable</label>
                    <select value={newItem.material} onChange={e => setNewItem(p => ({ ...p, material: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none">
                      <option value="">— Select consumable —</option>
                      {consumables.map(c => <option key={c.id} value={c.id}>{c.name}{c.unit_symbol ? ` (${c.unit_symbol})` : ''}</option>)}
                    </select>
                  </div>
                  <div className="w-28">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Quantity</label>
                    <input type="number" min="0" step="any" value={newItem.requested_quantity} onChange={e => setNewItem(p => ({ ...p, requested_quantity: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') handleAddItem() }} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-right focus:border-orange-500 outline-none" />
                  </div>
                  <button onClick={handleAddItem} disabled={!newItem.material || !newItem.requested_quantity || actionLoading === 'add-item'} className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-40">+ Add</button>
                </div>
              )}

              {/* Items table */}
              <div className="px-6 py-3">
                <table className="w-full text-xs text-left">
                  <thead className="text-gray-400 uppercase text-[9px]">
                    <tr>
                      <th className="py-2">Consumable</th>
                      <th className="py-2 text-right">Requested</th>
                      <th className="py-2 text-right">Approved</th>
                      <th className="py-2 text-right">Dispatched</th>
                      <th className="py-2 text-right">Used</th>
                      <th className="py-2 text-right">Returned</th>
                      {detail.status === 'draft' && canWrite && <th className="py-2 w-8"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {detail.items?.length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center text-gray-400 italic">No items yet.</td></tr>
                    ) : detail.items?.map(item => (
                      <tr key={item.id}>
                        <td className="py-2 font-medium text-gray-800">{item.material_name} <span className="text-gray-400">{item.unit_symbol}</span></td>
                        <td className="py-2 text-right text-gray-700">{num(item.requested_quantity)}</td>
                        <td className="py-2 text-right">
                          {detail.status === 'submitted' && canWrite ? (
                            <input type="number" min="0" step="any" value={approveItems[item.id] ?? ''} onChange={e => setApproveItems(p => ({ ...p, [item.id]: e.target.value }))} className="w-20 rounded-lg border border-blue-200 px-2 py-1 text-xs text-right focus:border-blue-400 focus:outline-none" />
                          ) : <span className="text-blue-700 font-semibold">{num(item.approved_quantity)}</span>}
                        </td>
                        <td className="py-2 text-right text-violet-700 font-semibold">{num(item.dispatched_quantity)}</td>
                        <td className="py-2 text-right">
                          {detail.status === 'dispatched' && canWrite ? (
                            <input type="number" min="0" step="any" value={usedItems[item.id] ?? ''} onChange={e => setUsedItems(p => ({ ...p, [item.id]: e.target.value }))} className="w-20 rounded-lg border border-amber-200 px-2 py-1 text-xs text-right focus:border-amber-400 focus:outline-none" />
                          ) : <span className="text-gray-700">{num(item.used_quantity)}</span>}
                        </td>
                        <td className="py-2 text-right text-green-700 font-semibold">{num(item.returned_quantity)}</td>
                        {detail.status === 'draft' && canWrite && (
                          <td className="py-2 text-right">
                            <button onClick={() => handleRemoveItem(item.id)} disabled={actionLoading === `item-${item.id}`} className="text-red-300 hover:text-red-500 disabled:opacity-30 text-lg leading-none">×</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Dispatch destination picker */}
              {detail.status === 'approved' && canWrite && (
                <div className="px-6 py-3 border-t border-gray-100">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Dispatch to (assembly zone) *</label>
                  <select value={destination} onChange={e => setDestination(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none">
                    <option value="">— Select assembly zone —</option>
                    {assemblyLocations.filter(l => String(l.id) !== String(detail.source_location)).map(l => <option key={l.id} value={l.id}>{l.full_path || l.name}</option>)}
                  </select>
                  {assemblyLocations.length === 0 && <p className="text-[10px] text-amber-600 mt-1">No assembly locations found. Create one under Master Data → Locations (type: Assembly).</p>}
                </div>
              )}

              {/* Reject reason */}
              {showReject && (
                <div className="px-6 py-3 border-t border-gray-100">
                  <label className="block text-[10px] font-bold text-red-500 uppercase mb-1">Rejection reason *</label>
                  <textarea rows={2} value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm focus:border-red-400 outline-none resize-none" />
                </div>
              )}
            </div>

            {/* Action bar */}
            {canWrite && !['returned', 'rejected'].includes(detail.status) && (
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-3 flex-shrink-0">
                {detail.status === 'draft' && (
                  <button onClick={handleSubmit} disabled={detail.total_items === 0 || actionLoading} className="rounded-lg bg-amber-500 px-5 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50">Submit</button>
                )}
                {detail.status === 'submitted' && (
                  <>
                    {!showReject ? (
                      <button onClick={() => setShowReject(true)} disabled={actionLoading} className="rounded-lg border border-red-200 px-5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">Reject</button>
                    ) : (
                      <button onClick={handleReject} disabled={actionLoading} className="rounded-lg bg-red-500 px-5 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50">Confirm Reject</button>
                    )}
                    <button onClick={handleApprove} disabled={actionLoading} className="rounded-lg bg-blue-500 px-5 py-2 text-xs font-bold text-white hover:bg-blue-600 disabled:opacity-50">Approve</button>
                  </>
                )}
                {detail.status === 'approved' && (
                  <button onClick={handleDispatch} disabled={actionLoading} className="rounded-lg bg-violet-500 px-5 py-2 text-xs font-bold text-white hover:bg-violet-600 disabled:opacity-50">Dispatch</button>
                )}
                {detail.status === 'dispatched' && (
                  <button onClick={handleRecordReturn} disabled={actionLoading} className="rounded-lg bg-green-500 px-5 py-2 text-xs font-bold text-white hover:bg-green-600 disabled:opacity-50">Record Return</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
