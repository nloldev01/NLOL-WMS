import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch, parseError, hasAccess } from '../utils/api'

const DOMAINS = [
  {
    key: 'raw_material',
    label: 'Raw Material',
    module: 'raw_material_stock',
    itemField: 'material',
    itemsEndpoint: '/master-data/raw-materials-and-consumables/',
    bulkEndpoint: '/raw-materials-stock/stock-movements/bulk-record/',
    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 5.5a3 3 0 01-.879 1.621L12 13l-2.121-1.879A3 3 0 019 9.5L8 4z',
    colors: {
      active: 'bg-primary text-white shadow-sm',
      inactive: 'bg-primary/10 text-primary hover:bg-primary/20',
      ring: 'focus:border-primary focus:ring-primary/20',
      badge: 'bg-primary/10 text-primary',
      tally: 'bg-primary/10 text-primary border border-primary/20',
      rowHover: 'hover:border-primary/40',
    },
  },
  {
    key: 'base_product',
    label: 'Base Product',
    module: 'base_product_stock',
    itemField: 'product',
    itemsEndpoint: '/master-data/products/',
    bulkEndpoint: '/products-stock/stock-movements/bulk-record/',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    colors: {
      active: 'bg-secondary text-white shadow-sm',
      inactive: 'bg-secondary/10 text-secondary hover:bg-secondary/20',
      ring: 'focus:border-secondary focus:ring-secondary/20',
      badge: 'bg-secondary/10 text-secondary',
      tally: 'bg-secondary/10 text-secondary border border-secondary/20',
      rowHover: 'hover:border-secondary/40',
    },
  },
  {
    key: 'finished_product',
    label: 'Finished Product',
    module: 'finished_product_stock',
    itemField: 'finished_product_variant',
    itemsEndpoint: '/master-data/finished-product-variants/',
    bulkEndpoint: '/products-stock/finished-product-stock-movements/bulk-record/',
    icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375C2.754 3.75 2.25 4.254 2.25 4.875v1.5c0 .621.504 1.125 1.125 1.125z',
    colors: {
      active: 'bg-orange-500 text-white shadow-sm shadow-orange-200',
      inactive: 'bg-orange-50 text-orange-600 hover:bg-orange-100',
      ring: 'focus:border-orange-500 focus:ring-orange-100',
      badge: 'bg-orange-100 text-orange-600',
      tally: 'bg-orange-50 text-orange-700 border border-orange-100',
      rowHover: 'hover:border-orange-200',
    },
  },
]

const emptyRow = () => ({ key: Math.random().toString(36).slice(2), item: '', quantity: '' })

const BulkPurchasePage = () => {
  const availableDomains = DOMAINS.filter(d => hasAccess(d.module))
  const [domainKey, setDomainKey] = useState(availableDomains[0]?.key || '')
  const domain = DOMAINS.find(d => d.key === domainKey)

  const [items, setItems] = useState([])
  const [locations, setLocations] = useState([])
  const [suppliers, setSuppliers] = useState([])

  const [supplier, setSupplier] = useState('')
  const [location, setLocation] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState([emptyRow()])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const lastQtyRef = useRef(null)

  useEffect(() => {
    apiFetch('/master-data/locations/')
      .then(r => r?.ok ? r.json() : null)
      .then(d => d && setLocations(Array.isArray(d) ? d : (d.results ?? [])))
    apiFetch('/master-data/suppliers/')
      .then(r => r?.ok ? r.json() : null)
      .then(d => d && setSuppliers(Array.isArray(d) ? d : (d.results ?? [])))
  }, [])

  useEffect(() => {
    if (!domain) return
    setItems([])
    apiFetch(domain.itemsEndpoint)
      .then(r => r?.ok ? r.json() : null)
      .then(d => d && setItems(Array.isArray(d) ? d : (d.results ?? [])))
  }, [domainKey])

  const itemLabel = (it) => it.display_label || it.name || `#${it.id}`
  const itemUnit = (itemId) => items.find(it => String(it.id) === String(itemId))?.unit_symbol || ''

  const updateRow = (key, field, value) => {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, [field]: value } : r)))
  }

  const addRow = () => setRows(prev => [...prev, emptyRow()])

  const removeRow = (key) => setRows(prev => (prev.length > 1 ? prev.filter(r => r.key !== key) : prev))

  const handleQtyKeyDown = (e, idx) => {
    if (e.key === 'Enter' && idx === rows.length - 1) {
      e.preventDefault()
      addRow()
    }
  }

  const resetRows = () => {
    setRows([emptyRow()])
    setReference('')
    setNotes('')
  }

  const validRows = rows.filter(r => r.item && r.quantity)
  const totalUnits = validRows.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0), 0)
  const canSubmit = location && validRows.length > 0
  const disabledReason = !location
    ? 'Select a location to enable Record Purchase.'
    : validRows.length === 0
      ? 'Add at least one item with a quantity.'
      : ''

  const handleSubmit = async () => {
    setError('')
    setResult(null)

    if (!location) { setError('Select a location for this bill.'); return }
    if (validRows.length === 0) { setError('Add at least one item with a quantity.'); return }

    const payload = validRows.map(r => ({
      [domain.itemField]: parseInt(r.item),
      location: parseInt(location),
      movement_type: 'purchase',
      quantity: parseFloat(r.quantity),
      supplier: supplier ? parseInt(supplier) : null,
      reference: reference.trim(),
      notes: notes.trim(),
      auto_generate_batch: true,
      auto_generate_lpn: true,
    }))

    setSubmitting(true)
    try {
      const res = await apiFetch(domain.bulkEndpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!res) return
      const data = await res.json()
      if (res.ok) {
        setResult(Array.isArray(data) ? data : [data])
        resetRows()
      } else {
        setError(parseError(data))
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!domain) {
    return (
      <div className="min-h-screen bg-slate-100">
        <Sidebar />
        <div className="ml-16">
          <Topbar />
          <main className="p-6">
            <p className="text-sm text-gray-500">You don't have access to any stock module.</p>
          </main>
        </div>
      </div>
    )
  }

  const c = domain.colors

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Stock / Bulk Purchase Entry</p>

          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${c.badge}`}>
                  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m-9-8h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900 leading-tight">Bulk Purchase Entry</h2>
                  <p className="text-[11px] text-slate-400">Add multiple purchase lines under one bill — stock updates immediately.</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                {availableDomains.map(d => (
                  <button
                    key={d.key}
                    onClick={() => { setDomainKey(d.key); setRows([emptyRow()]); setResult(null); setError('') }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      domainKey === d.key ? d.colors.active : d.colors.inactive
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d.icon} />
                    </svg>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-5">
              {error && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
              )}

              {result && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-emerald-100/70">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-emerald-800 leading-tight">Purchase recorded</p>
                        <p className="text-[11px] text-emerald-600">{result.length} item{result.length === 1 ? '' : 's'} added to stock</p>
                      </div>
                    </div>
                    <button onClick={() => setResult(null)} className="text-emerald-400 hover:text-emerald-700 transition-colors" title="Dismiss">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="divide-y divide-emerald-100/70">
                    {result.map((log, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2 text-xs">
                        <span className="font-semibold text-slate-700">
                          {log.material_name || log.product_name || log.finished_product_variant_label || `Item #${i + 1}`}
                          <span className="text-slate-400 font-normal ml-1.5">
                            {parseFloat(log.quantity).toLocaleString()} {log.unit}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          {log.batch_code && (
                            <span className="text-[10px] font-mono font-bold text-orange-700 bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded">
                              {log.batch_code}
                            </span>
                          )}
                          {log.lpn_code && (
                            <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                              {log.lpn_code}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-5 border-b border-slate-50">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Location *</label>
                  <select
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 transition-all outline-none ${c.ring}`}
                  >
                    <option value="">Select location</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.full_path || l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Supplier</label>
                  <select
                    value={supplier}
                    onChange={e => setSupplier(e.target.value)}
                    className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 transition-all outline-none ${c.ring}`}
                  >
                    <option value="">Select supplier (optional)</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Bill / Reference No.</label>
                  <input
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    placeholder="Bill no., PO number..."
                    className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 transition-all outline-none ${c.ring}`}
                  />
                </div>
              </div>

              <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Line Items</p>
                  <p className="text-[10px] text-slate-400">Press Enter in the last row's quantity to add another row</p>
                </div>

                <div className="hidden sm:flex items-center gap-2 px-1 mb-1.5">
                  <span className="w-6 text-[10px] font-bold text-slate-400 uppercase">#</span>
                  <span className="flex-1 text-[10px] font-bold text-slate-400 uppercase">{domain.label}</span>
                  <span className="w-32 text-[10px] font-bold text-slate-400 uppercase">Qty</span>
                  <span className="w-7" />
                </div>

                <div className="space-y-1.5">
                  {rows.map((row, idx) => (
                    <div key={row.key} className={`flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5 transition-colors ${c.rowHover}`}>
                      <span className="w-6 text-center text-[11px] font-bold text-slate-400">{idx + 1}</span>
                      <select
                        value={row.item}
                        onChange={e => updateRow(row.key, 'item', e.target.value)}
                        className={`flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 transition-all outline-none ${c.ring}`}
                      >
                        <option value="">Select {domain.label.toLowerCase()}...</option>
                        {items.map(it => <option key={it.id} value={it.id}>{itemLabel(it)}</option>)}
                      </select>
                      <div className="relative w-32">
                        <input
                          type="number"
                          step="any"
                          placeholder="Qty"
                          value={row.quantity}
                          onChange={e => updateRow(row.key, 'quantity', e.target.value)}
                          onKeyDown={e => handleQtyKeyDown(e, idx)}
                          onWheel={e => e.target.blur()}
                          ref={idx === rows.length - 1 ? lastQtyRef : null}
                          className="w-full rounded-lg border border-orange-200 bg-orange-50/30 px-3 py-2 text-sm font-bold text-orange-700 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none"
                        />
                        {row.item && itemUnit(row.item) && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1 rounded pointer-events-none">
                            {itemUnit(row.item)}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        disabled={rows.length === 1}
                        className="w-7 flex items-center justify-center text-slate-400 hover:text-rose-500 disabled:opacity-30 transition-colors"
                        title="Remove row"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between mt-3">
                  <button
                    type="button"
                    onClick={addRow}
                    className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Row
                  </button>
                  {validRows.length > 0 && (
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${c.tally}`}>
                      {validRows.length} item{validRows.length === 1 ? '' : 's'} · {totalUnits.toLocaleString()} total units
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any additional details for this bill..."
                  rows={2}
                  className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 transition-all outline-none resize-none ${c.ring}`}
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                {!canSubmit && disabledReason && (
                  <p className="text-[11px] text-slate-400 italic">{disabledReason}</p>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !canSubmit}
                  className="rounded-lg bg-orange-500 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-50 active:scale-95 transition-all outline-none"
                >
                  {submitting ? 'Saving...' : 'Record Purchase'}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default BulkPurchasePage
