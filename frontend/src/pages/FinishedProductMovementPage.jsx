import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch, getApiError } from '../utils/api'
import BatchSuccessModal from '../components/BatchSuccessModal'

const PAGE_SIZE = 10

const MOVEMENT_TYPES = [
  { value: 'packaging_production', label: 'Packaging Production', color: 'bg-emerald-50 text-emerald-700' },
  { value: 'purchase',             label: 'Purchase / Receipt',   color: 'bg-green-50 text-green-700' },
  { value: 'purchase_return',      label: 'Return to Supplier',   color: 'bg-rose-50 text-rose-700' },
  { value: 'sale',                 label: 'Sale / Issue',         color: 'bg-blue-50 text-blue-700' },
  { value: 'sale_return',          label: 'Customer Return',      color: 'bg-indigo-50 text-indigo-700' },
  { value: 'transfer_in',          label: 'Transfer In',          color: 'bg-violet-50 text-violet-700' },
  { value: 'transfer_out',         label: 'Transfer Out',         color: 'bg-pink-50 text-pink-700' },
  { value: 'adjustment',           label: 'Adjustment (Out)',     color: 'bg-slate-100 text-slate-600' },
  { value: 'adjustment_in',        label: 'Adjustment (In)',      color: 'bg-teal-50 text-teal-700' },
  { value: 'wastage',              label: 'Wastage',              color: 'bg-rose-50 text-rose-700' },
]

const MOVEMENT_MAP = Object.fromEntries(MOVEMENT_TYPES.map(m => [m.value, m]))
const INBOUND_TYPES  = new Set(['packaging_production', 'purchase', 'sale_return', 'transfer_in', 'adjustment_in'])
const OUTBOUND_TYPES = new Set(['sale', 'purchase_return', 'transfer_out', 'adjustment', 'wastage'])

const emptyForm = {
  finished_product: '',
  finished_product_variant: '',
  location: '',
  movement_type: '',
  quantity: '',
  counterpart_location: '',
  reference: '',
  notes: '',
  batch: '',
  lpn: '',
  supplier: '',
  auto_generate_batch: true,
  auto_generate_lpn: true,
}

const QuickPickSuggestions = ({ suggestions, onPick }) => {
  if (!suggestions.length) return null
  return (
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Available Stock — Click to Select</p>
      <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2">
        {suggestions.map((item, idx) => (
          <button key={idx} onClick={() => onPick(item)} className="flex flex-col text-left p-2.5 rounded-lg border border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/50 transition-all group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-indigo-700 truncate mr-2">
                {item.finished_product_variant_label || item.finished_product_name}
              </span>
              <span className="text-xs font-bold text-slate-700 shrink-0">
                {parseFloat(item.quantity).toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">{item.volume_unit_symbol}{item.unit_name}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-mono font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">{item.batch_code || 'No Batch'}</span>
              {item.lpn_code && <span className="text-[9px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">{item.lpn_code}</span>}
              <span className="text-[10px] text-slate-400 group-hover:text-slate-600 truncate">{item.location_name}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

const FinishedProductMovementPage = () => {
  const [logs, setLogs]                         = useState([])
  const [finishedProducts, setFinishedProducts] = useState([])
  const [variants, setVariants]                 = useState([])
  const [variantsLoading, setVariantsLoading]   = useState(false)
  const [filterVariants, setFilterVariants]     = useState([])
  const [locations, setLocations]               = useState([])
  const [filterBatches, setFilterBatches]       = useState([])
  const [batches, setBatches]                   = useState([])
  const [loading, setLoading]                   = useState(true)
  const [search, setSearch]                     = useState('')
  const [page, setPage]                         = useState(1)
  const [error, setError]                       = useState('')
  const [modalOpen, setModalOpen]               = useState(false)
  const [form, setForm]                         = useState(emptyForm)
  const [submitting, setSubmitting]             = useState(false)
  const [successLog, setSuccessLog]             = useState(null)
  const [availableStock, setAvailableStock]     = useState([])
  const [fetchingStock, setFetchingStock]       = useState(false)

  const [filters, setFilters] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return {
      movement_type: '',
      location: params.get('location') || '',
      finished_product: '',
      finished_product_variant: params.get('finished_product_variant') || '',
      batch: params.get('batch') || '',
    }
  })

  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  useEffect(() => {
    fetchFinishedProducts()
    fetchLocations()
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [search, filters])

  useEffect(() => {
    if (filters.finished_product) {
      apiFetch(`/master-data/finished-product-variants/?finished_product=${filters.finished_product}`)
        .then(r => r?.ok ? r.json() : null)
        .then(d => d && setFilterVariants(Array.isArray(d) ? d : (d.results ?? [])))
    } else {
      setFilterVariants([])
    }
    setFilters(f => ({ ...f, finished_product_variant: '' }))
  }, [filters.finished_product])

  useEffect(() => {
    if (filters.finished_product_variant) {
      fetchFilterBatches(filters.finished_product_variant)
    }
  }, [filters.finished_product_variant])

  useEffect(() => {
    if (form.finished_product) {
      setVariantsLoading(true)
      apiFetch(`/master-data/finished-product-variants/?finished_product=${form.finished_product}`)
        .then(r => r?.ok ? r.json() : null)
        .then(d => { d && setVariants(Array.isArray(d) ? d : (d.results ?? [])); setVariantsLoading(false) })
        .catch(() => setVariantsLoading(false))
      fetchStockForProduct(form.finished_product)
    } else {
      setVariants([])
      setAvailableStock([])
    }
    setForm(prev => ({ ...prev, finished_product_variant: '' }))
  }, [form.finished_product])

  useEffect(() => {
    if (form.finished_product_variant) {
      fetchBatches(form.finished_product_variant)
    } else {
      setBatches([])
    }
  }, [form.finished_product_variant])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (filters.movement_type)         params.append('movement_type', filters.movement_type)
      if (filters.finished_product_variant) params.append('finished_product_variant', filters.finished_product_variant)
      else if (filters.finished_product)   params.append('finished_product_variant__finished_product', filters.finished_product)
      if (filters.location) params.append('location', filters.location)
      if (filters.batch)    params.append('batch', filters.batch)
      const res = await apiFetch(`/products-stock/finished-product-stock-movements/?${params.toString()}`)
      if (res && res.ok) { const data = await res.json(); setLogs(Array.isArray(data) ? data : (data.results ?? [])) }
      else setLogs([])
    } catch { setError('Failed to load logs') }
    finally { setLoading(false) }
  }

  const fetchFinishedProducts = async () => {
    const res = await apiFetch('/master-data/finished-products/')
    if (res && res.ok) { const data = await res.json(); setFinishedProducts(Array.isArray(data) ? data : (data.results ?? [])) }
  }

  const fetchLocations = async () => {
    const res = await apiFetch('/master-data/locations/?parent__name=Main+Factory&is_active=true')
    if (res && res.ok) { const data = await res.json(); setLocations(Array.isArray(data) ? data : (data.results ?? [])) }
  }

  const fetchBatches = async (variantId) => {
    const res = await apiFetch(`/inventory-core/batches/?batch_type=FIN&finished_product_variant=${variantId}`)
    if (res && res.ok) { const data = await res.json(); setBatches(Array.isArray(data) ? data : (data.results ?? [])) }
  }

  const fetchFilterBatches = async (variantId) => {
    let q = '?batch_type=FIN'
    if (variantId) q += `&finished_product_variant=${variantId}`
    const res = await apiFetch(`/inventory-core/batches/${q}`)
    if (res && res.ok) { const data = await res.json(); setFilterBatches(Array.isArray(data) ? data : (data.results ?? [])) }
  }

  const fetchStockForProduct = async (fpid) => {
    setFetchingStock(true)
    try {
      const res = await apiFetch(`/products-stock/finished-product-stock/?finished_product_variant__finished_product=${fpid}`)
      if (res && res.ok) {
        const data = await res.json()
        const items = Array.isArray(data) ? data : (data.results ?? [])
        setAvailableStock(items.filter(i => parseFloat(i.quantity) > 0))
      }
    } catch { /* ignore */ }
    finally { setFetchingStock(false) }
  }

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length
  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE))
  const paginated  = logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const isTransfer = ['transfer_out', 'transfer_in'].includes(form.movement_type)
  const isOutbound = OUTBOUND_TYPES.has(form.movement_type)

  const selectedVariant = variants.find(v => String(v.id) === String(form.finished_product_variant))
  const unitLabel = selectedVariant?.unit_name || ''

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handlePick = (item) => {
    setForm(prev => ({
      ...prev,
      finished_product_variant: String(item.finished_product_variant),
      [prev.movement_type === 'transfer_in' ? 'counterpart_location' : 'location']: item.location,
      batch: item.batch, lpn: item.lpn, quantity: item.quantity,
      auto_generate_batch: false, auto_generate_lpn: false,
    }))
  }

  const openAdd = () => { setForm(emptyForm); setError(''); setModalOpen(true) }

  const closeModal = () => { setModalOpen(false); setForm(emptyForm); setError('') }

  const handleSubmit = async () => {
    setSubmitting(true); setError('')

    const isInbound     = INBOUND_TYPES.has(form.movement_type)
    const isTransferOut = form.movement_type === 'transfer_out'
    const isTransferIn  = form.movement_type === 'transfer_in'
    const isAdj         = form.movement_type === 'adjustment'
    const isAdjIn       = form.movement_type === 'adjustment_in'

    const shouldAutoBatch = isInbound || (isAdj && form.auto_generate_batch) || isAdjIn
    const shouldAutoLPN   = isInbound || isTransferOut || isTransferIn || (isAdj && form.auto_generate_lpn)

    const payload = {
      finished_product_variant: parseInt(form.finished_product_variant),
      location:                 parseInt(form.location),
      movement_type:            form.movement_type,
      quantity:                 parseFloat(form.quantity),
      batch:                    form.batch ? parseInt(form.batch) : null,
      lpn:                      form.lpn ? parseInt(form.lpn) : null,
      auto_generate_batch:      shouldAutoBatch,
      auto_generate_lpn:        shouldAutoLPN,
      reference:                form.reference,
      notes:                    form.notes,
      counterpart_location:     form.counterpart_location ? parseInt(form.counterpart_location) : null,
    }

    try {
      const res = await apiFetch('/products-stock/finished-product-stock-movements/record/', { method: 'POST', body: JSON.stringify(payload) })
      if (res && res.ok) {
        const data = await res.json()
        fetchLogs()
        if (data.batch_code || data.lpn_code) setSuccessLog(data)
        else closeModal()
      } else setError(await getApiError(res))
    } catch { setError('Connection error — check your network') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Packaging / Finished Product Movements</p>

          <div className="rounded-xl bg-white shadow-sm min-h-[500px]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Finished Product Movement History</h2>
              <div className="flex items-center gap-3">
                <button onClick={openAdd} className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Record Movement
                </button>

                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search ledger..." className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-48" />
                </div>

                <div className="relative" ref={filterRef}>
                  <button onClick={() => setFilterOpen(o => !o)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${activeFilterCount > 0 ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4-2A1 1 0 018 17v-3.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                    Filters
                    {activeFilterCount > 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] text-white font-semibold">{activeFilterCount}</span>}
                  </button>

                  {filterOpen && (
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-60 rounded-xl bg-white border border-gray-200 shadow-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">Filters</p>
                        {activeFilterCount > 0 && (
                          <button onClick={() => { setFilters({ movement_type: '', location: '', finished_product: '', finished_product_variant: '', batch: '' }); setPage(1) }} className="text-[10px] text-orange-500 hover:underline">Clear all</button>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Movement Type</label>
                        <select value={filters.movement_type} onChange={e => { setFilters(f => ({ ...f, movement_type: e.target.value })); setPage(1) }} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
                          <option value="">All</option>
                          {MOVEMENT_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Product Line</label>
                        <select value={filters.finished_product} onChange={e => { setFilters(f => ({ ...f, finished_product: e.target.value })); setPage(1) }} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
                          <option value="">All</option>
                          {finishedProducts.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                        </select>
                      </div>
                      {filterVariants.length > 0 && (
                        <div>
                          <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Variant</label>
                          <select value={filters.finished_product_variant} onChange={e => { setFilters(f => ({ ...f, finished_product_variant: e.target.value })); setPage(1) }} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
                            <option value="">All Variants</option>
                            {filterVariants.map(v => <option key={v.id} value={String(v.id)}>{v.display_label || `${v.volume}${v.volume_unit_symbol} ${v.unit_name}`}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Batch</label>
                        <select value={filters.batch} onChange={e => { setFilters(f => ({ ...f, batch: e.target.value })); setPage(1) }} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
                          <option value="">All</option>
                          {filterBatches.map(b => <option key={b.id} value={String(b.id)}>{b.batch_code}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Location</label>
                        <select value={filters.location} onChange={e => { setFilters(f => ({ ...f, location: e.target.value })); setPage(1) }} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
                          <option value="">All</option>
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
                    <th className="px-6 py-3 w-10">No</th>
                    <th className="px-6 py-3">Finished Product</th>
                    <th className="px-6 py-3">Batch / LPN</th>
                    <th className="px-6 py-3">Movement</th>
                    <th className="px-6 py-3">Quantity</th>
                    <th className="px-6 py-3">Location / Path</th>
                    <th className="px-6 py-3">Balance</th>
                    <th className="px-6 py-3">Date Recorded</th>
                    <th className="px-6 py-3">By</th>
                    <th className="px-6 py-3">Label</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr><td colSpan={9} className="px-6 py-10 text-center text-gray-400">No movement records found</td></tr>
                  ) : paginated.map((log, idx) => {
                    const mType = MOVEMENT_MAP[log.movement_type]
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="px-6 py-3 font-medium text-gray-900">
                          {log.finished_product_name}
                          {log.finished_product_variant_label && (
                            <div className="text-[10px] text-gray-400">{log.finished_product_variant_label}</div>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="px-1.5 py-0.5 rounded font-mono text-[9px] text-orange-600 bg-orange-50 font-bold border border-orange-100 inline-block w-fit">{log.batch_code || '—'}</span>
                            {log.lpn_code && <span className="px-1.5 py-0.5 rounded font-mono text-[9px] text-indigo-600 bg-indigo-50 font-bold border border-indigo-100 inline-block w-fit">{log.lpn_code}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${mType?.color ?? 'bg-gray-100 text-gray-600'}`}>{mType?.label ?? log.movement_type}</span>
                        </td>
                        <td className="px-6 py-3 font-bold text-slate-800">
                          {parseFloat(log.quantity).toLocaleString()} <span className="text-[10px] font-normal text-gray-400 uppercase">{log.unit_name}</span>
                          {log.volume_per_unit && log.volume_unit_symbol && (
                            <div className="text-[10px] text-blue-500 font-medium">
                              {parseFloat(log.volume_per_unit).toLocaleString()}{log.volume_unit_symbol} each
                              {' = '}
                              <span className="font-bold">{(parseFloat(log.quantity) * parseFloat(log.volume_per_unit)).toLocaleString()}{log.volume_unit_symbol}</span>
                            </div>
                          )}
                          {log.secondary_quantity != null && log.secondary_unit && (
                            <div className="text-[10px] text-indigo-500 font-medium">≈ {parseFloat(log.secondary_quantity).toLocaleString()} {log.secondary_unit}</div>
                          )}
                        </td>
                        <td className="px-6 py-3 text-gray-500 text-xs">
                          {log.movement_type.includes('transfer') ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold text-rose-500 w-8">FROM</span>
                                <span className="font-medium text-slate-500 uppercase tracking-tight">{log.movement_type === 'transfer_out' ? log.location_name : log.counterpart_location_name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold text-emerald-500 w-8">TO</span>
                                <span className="font-medium text-slate-800 uppercase tracking-tight">{log.movement_type === 'transfer_out' ? log.counterpart_location_name : log.location_name}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <span className={`text-[9px] font-bold ${OUTBOUND_TYPES.has(log.movement_type) ? 'text-rose-500' : 'text-emerald-500'}`}>{OUTBOUND_TYPES.has(log.movement_type) ? 'OUT' : 'IN'}</span>
                              <span className="font-medium text-slate-700 uppercase tracking-tight">{log.location_name}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-3 font-bold text-slate-900 italic">
                          {parseFloat(log.balance_after).toLocaleString()} <span className="text-[10px] font-normal text-gray-400">{log.volume_unit_symbol} {log.unit_name}</span>
                        </td>
                        <td className="px-6 py-3 text-gray-400 text-xs">{new Date(log.created_at).toLocaleDateString()}</td>
                        <td className="px-6 py-3">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                            {log.performer_name || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <button onClick={() => setSuccessLog(log)} disabled={!log.batch_code && !log.lpn_code} className="rounded-lg bg-orange-500 p-1.5 text-white hover:bg-orange-600 disabled:opacity-30 transition-all shadow-sm" title={log.lpn_code ? 'View/Print LPN Label' : log.batch_code ? 'View Batch QR' : 'No label available'}>
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM13 13h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2zm2 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm0-4h2v2h-2v-2zm-2 2h2v2h-2v-2z" /></svg>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">Showing {logs.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, logs.length)} of {logs.length}</p>
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

      {/* Record Movement Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Record Finished Product Movement</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {error && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-6 border-b border-slate-50">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Product Line *</label>
                  <select name="finished_product" value={form.finished_product} onChange={handleChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none">
                    <option value="">Select Product Line</option>
                    {finishedProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                <div className={variants.length > 0 ? 'col-span-full' : ''}>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Variant *</label>
                  {!form.finished_product ? (
                    <p className="text-xs text-slate-400 italic py-1">— Select a product first —</p>
                  ) : variantsLoading ? (
                    <div className="p-2 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg">Loading variants...</div>
                  ) : variants.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-1">No variants found for this product</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {variants.map(v => {
                        const vol = parseFloat(v.volume)
                        const isSelected = String(form.finished_product_variant) === String(v.id)
                        return (
                          <button key={v.id} type="button"
                            onClick={() => setForm(prev => ({ ...prev, finished_product_variant: String(v.id) }))}
                            className={`inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition-all ${
                              isSelected
                                ? 'border-orange-400 bg-orange-500 text-white shadow-sm shadow-orange-200'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
                            }`}
                          >
                            {Number.isInteger(vol) ? vol : vol}
                            <span className={`font-semibold ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>
                              {(v.volume_unit_symbol || '').toUpperCase()}
                            </span>
                            <span className={`text-[10px] font-normal ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>
                              · {v.unit_name}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Movement Type *</label>
                  <select name="movement_type" value={form.movement_type} onChange={handleChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none">
                    <option value="">Select Type</option>
                    {MOVEMENT_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-1">Quantity * {unitLabel && `(${unitLabel})`}</label>
                  <input name="quantity" type="number" step="any" placeholder="0.00" value={form.quantity} onChange={handleChange} onWheel={e => e.target.blur()} className="w-full rounded-lg border border-orange-200 bg-orange-50/30 px-3 py-2 text-sm font-bold text-orange-700 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none" />
                </div>

                {fetchingStock ? (
                  <div className="col-span-2 p-4 text-center border-2 border-dashed border-slate-100 rounded-xl">
                    <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading stock...</p>
                  </div>
                ) : availableStock.length > 0 ? (
                  <div className="col-span-2"><QuickPickSuggestions suggestions={availableStock} onPick={handlePick} /></div>
                ) : null}

                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Batch / LPN</label>
                  <div className="flex flex-col gap-2">
                    {['packaging_production', 'purchase', 'sale_return', 'adjustment_in'].includes(form.movement_type) ? (
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                        <p className="text-[11px] font-bold text-emerald-700">New Batch + LPN will be auto-generated</p>
                        <p className="text-[10px] text-emerald-600 mt-1">A unique batch code and LPN label will be created for this inbound movement.</p>
                      </div>
                    ) : ['sale', 'wastage', 'adjustment'].includes(form.movement_type) ? (
                      <select name="batch" value={form.batch} onChange={handleChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none font-mono">
                        <option value="">Select Batch *</option>
                        {batches.map(b => <option key={b.id} value={b.id}>{b.batch_code}</option>)}
                      </select>
                    ) : ['transfer_out', 'transfer_in'].includes(form.movement_type) ? (
                      <>
                        <select name="batch" value={form.batch} onChange={handleChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none font-mono">
                          <option value="">Select Batch *</option>
                          {batches.map(b => <option key={b.id} value={b.id}>{b.batch_code}</option>)}
                        </select>
                        <div className="p-2.5 rounded-lg bg-violet-50 border border-violet-200">
                          <p className="text-[10px] font-bold text-violet-600">A new LPN will be auto-assigned at the destination</p>
                        </div>
                      </>
                    ) : (
                      <p className="text-[10px] text-slate-400 italic py-2">Select a movement type first</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 leading-none">
                  {form.movement_type === 'transfer_in' ? 'Destination Location (To) *' : (isTransfer ? 'Source Location (From) *' : 'Location *')}
                </p>
                <select name="location" value={form.location} onChange={handleChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none">
                  <option value="">Select Location</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.full_path || l.name}</option>)}
                </select>
              </div>

              {isTransfer && (
                <div className={`p-4 rounded-xl border ${form.movement_type === 'transfer_out' ? 'bg-pink-50/30 border-pink-100' : 'bg-indigo-50/30 border-indigo-100'}`}>
                  <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 leading-none ${form.movement_type === 'transfer_out' ? 'text-pink-500' : 'text-indigo-500'}`}>
                    {form.movement_type === 'transfer_out' ? 'Destination Location (To) *' : 'Source Location (From) *'}
                  </p>
                  <select name="counterpart_location" value={form.counterpart_location} onChange={handleChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none">
                    <option value="">Select Location</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.full_path || l.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Reference</label>
                <input name="reference" placeholder="Invoice, Order..." value={form.reference} onChange={handleChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Notes</label>
                <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Additional details..." rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none resize-none" />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-slate-50/30">
              <button onClick={closeModal} className="rounded-lg border border-gray-200 px-6 py-2 text-sm font-bold text-slate-500 hover:bg-white transition-all">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="rounded-lg bg-orange-500 px-8 py-2 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-50 active:scale-95 transition-all">
                {submitting ? 'Saving...' : 'Record Movement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {successLog && (
        <BatchSuccessModal log={successLog} onClose={() => { setSuccessLog(null); closeModal() }} />
      )}
    </div>
  )
}

export default FinishedProductMovementPage
