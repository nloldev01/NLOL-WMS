import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch } from '../utils/api'
import BatchSuccessModal from '../components/BatchSuccessModal'

const PAGE_SIZE = 10

const STATUS_CONFIG = {
  draft:       { label: 'Draft',       color: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'In Progress', color: 'bg-blue-50 text-blue-700' },
  assembled:   { label: 'Assembled',   color: 'bg-teal-50 text-teal-700' },
  completed:   { label: 'Completed',   color: 'bg-green-50 text-green-700' },
  cancelled:   { label: 'Cancelled',   color: 'bg-red-50 text-red-600' },
}

const emptyForm = {
  finished_product: '',
  finished_product_variant: '',
  assembly_line: '',
  source_location: '',
  source_batch: '',
  destination_location: '',
  target_quantity: '',
  notes: '',
}

const AssemblyOrdersPage = () => {
  const [orders, setOrders]                       = useState([])
  const [finishedProducts, setFinishedProducts]   = useState([])
  const [variants, setVariants]                   = useState([])
  const [variantsLoading, setVariantsLoading]     = useState(false)
  const [locations, setLocations]                 = useState([])
  const [sourceBatches, setSourceBatches]         = useState([])
  const [loading, setLoading]                     = useState(true)
  const [search, setSearch]                       = useState('')
  const [page, setPage]                           = useState(1)
  const [error, setError]                         = useState('')
  const [filters, setFilters]                     = useState({ status: '', finished_product: '' })
  const [filterOpen, setFilterOpen]               = useState(false)
  const filterRef                                 = useRef(null)

  const [assemblyLines, setAssemblyLines]         = useState([])
  const [productionQueue, setProductionQueue]     = useState([])
  const [queueLoading, setQueueLoading]           = useState(false)

  const [createOpen, setCreateOpen]               = useState(false)
  const [detailsOpen, setDetailsOpen]             = useState(false)
  const [form, setForm]                           = useState(emptyForm)
  const [submitting, setSubmitting]               = useState(false)
  const [formError, setFormError]                 = useState('')

  const [completeTarget, setCompleteTarget]         = useState(null)
  const [completeActual, setCompleteActual]         = useState('')
  const [completeDestination, setCompleteDestination] = useState('')
  const [completing, setCompleting]                 = useState(false)
  const [completeError, setCompleteError]           = useState('')
  const [completeSummary, setCompleteSummary]       = useState(null)
  const [successLog, setSuccessLog]                 = useState(null)

  // Materials modal (add/remove lines on an in_progress order)
  const [materialsOrder, setMaterialsOrder]       = useState(null)
  const [materialLines, setMaterialLines]         = useState([])
  const [allMaterials, setAllMaterials]           = useState([])
  const [newMatMaterial, setNewMatMaterial]       = useState('')
  const [newMatQty, setNewMatQty]                 = useState('')
  const [newMatLocation, setNewMatLocation]       = useState('')
  const [matSubmitting, setMatSubmitting]         = useState(false)
  const [matError, setMatError]                   = useState('')

  useEffect(() => { fetchFinishedProducts(); fetchLocations(); fetchProductionQueue(); fetchAssemblyLines() }, [])
  useEffect(() => { fetchOrders() }, [search, filters])

  useEffect(() => {
    if (form.finished_product) {
      fetchVariants(form.finished_product)
    } else {
      setVariants([]); setSourceBatches([])
      setForm(prev => ({ ...prev, finished_product_variant: '', source_batch: '' }))
    }
  }, [form.finished_product])

  useEffect(() => {
    if (form.finished_product_variant) {
      fetchSourceBatchesForVariant(form.finished_product_variant)
      if (!form.source_location || !form.destination_location) setDetailsOpen(true)
    } else {
      setSourceBatches([])
    }
  }, [form.finished_product_variant])

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
      if (filters.finished_product) params.append('finished_product_variant__finished_product', filters.finished_product)
      const res = await apiFetch(`/assembly/assembly-orders/?${params.toString()}`)
      if (res?.ok) { const d = await res.json(); setOrders(Array.isArray(d) ? d : (d.results ?? [])) }
      else setOrders([])
    } catch { setError('Failed to load') }
    finally { setLoading(false) }
  }

  const fetchFinishedProducts = async () => {
    const res = await apiFetch('/master-data/finished-products/')
    if (res?.ok) { const d = await res.json(); setFinishedProducts(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const fetchVariants = async (fpid) => {
    setVariantsLoading(true)
    try {
      const res = await apiFetch(`/master-data/finished-product-variants/?finished_product=${fpid}&is_available=true`)
      if (res?.ok) { const d = await res.json(); setVariants(Array.isArray(d) ? d : (d.results ?? [])) }
    } catch { setVariants([]) }
    finally { setVariantsLoading(false) }
  }

  const fetchLocations = async () => {
    const res = await apiFetch('/master-data/locations/?parent__name=Main+Factory&is_active=true')
    if (res?.ok) { const d = await res.json(); setLocations(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const fetchAssemblyLines = async () => {
    const res = await apiFetch('/master-data/locations/?type=assembly&is_active=true')
    if (res?.ok) { const d = await res.json(); setAssemblyLines(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const fetchProductionQueue = async () => {
    setQueueLoading(true)
    try {
      const res = await apiFetch('/products-stock/stock/?batch__batch_type=PRD&location__type=assembly')
      if (res?.ok) {
        const d = await res.json()
        const items = Array.isArray(d) ? d : (d.results ?? [])
        setProductionQueue(items.filter(s => parseFloat(s.quantity) > 0))
      }
    } catch { /* ignore */ }
    finally { setQueueLoading(false) }
  }

  const fetchSourceBatchesForVariant = async (variantId) => {
    const parentProduct = finishedProducts.find(p => String(p.id) === String(form.finished_product))
    if (!parentProduct?.base_product) return
    const res = await apiFetch(`/inventory-core/batches/?batch_type=PRD&product=${parentProduct.base_product}`)
    if (res?.ok) {
      const d = await res.json()
      const batches = Array.isArray(d) ? d : (d.results ?? [])
      setSourceBatches(batches)
      // No auto-select — pickFromQueue always owns source_batch
    }
  }

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length
  // Assembled orders float to the top so they're immediately visible for labeling
  const STATUS_SORT = { assembled: 0, in_progress: 1, draft: 2, completed: 3, cancelled: 4 }
  const sortedOrders = [...orders].sort((a, b) => (STATUS_SORT[a.status] ?? 5) - (STATUS_SORT[b.status] ?? 5))
  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / PAGE_SIZE))
  const paginated  = sortedOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Reserved quantities per PRD batch (from in-progress assembly orders) ────
  const reservedByBatch = {}
  orders
    .filter(o => o.status === 'in_progress' && o.source_batch)
    .forEach(o => {
      const batchId  = String(o.source_batch)
      const reserved = parseFloat(o.target_quantity || 0) * parseFloat(o.variant_base_quantity || 0)
      reservedByBatch[batchId] = (reservedByBatch[batchId] || 0) + reserved
    })

  // ── Derived assembly calculations (live, used by form + pickFromQueue) ──────
  const selectedVariant = variants.find(v => String(v.id) === String(form.finished_product_variant))
  const sourceStock = productionQueue.find(s =>
    String(s.batch) === String(form.source_batch) &&
    String(s.location) === String(form.source_location)
  ) || productionQueue.find(s => String(s.batch) === String(form.source_batch))
  const availableQty        = sourceStock ? parseFloat(sourceStock.quantity) : null
  const volumePerUnit       = selectedVariant ? parseFloat(selectedVariant.volume) : null
  const maxAssemblableUnits = (availableQty && volumePerUnit && volumePerUnit > 0)
    ? Math.floor(availableQty / volumePerUnit) : null
  const remainder    = (availableQty != null && maxAssemblableUnits != null && volumePerUnit > 0)
    ? +(availableQty - maxAssemblableUnits * volumePerUnit).toFixed(4) : null
  const targetQty    = parseFloat(form.target_quantity) || 0
  const baseConsumed = (selectedVariant && targetQty > 0) ? targetQty * parseFloat(selectedVariant.base_quantity) : null
  const isOverstock  = availableQty != null && baseConsumed != null && baseConsumed > availableQty

  // Auto-clamp target_quantity when variant or source batch changes
  useEffect(() => {
    if (maxAssemblableUnits !== null && form.target_quantity) {
      const current = parseFloat(form.target_quantity)
      if (!isNaN(current) && current > maxAssemblableUnits) {
        setForm(prev => ({ ...prev, target_quantity: String(maxAssemblableUnits) }))
      }
    }
  }, [form.finished_product_variant, form.source_batch, form.source_location])

  const handleFormChange = (e) => {
    const { name, value } = e.target
    let val = value
    if (name === 'target_quantity' && maxAssemblableUnits !== null) {
      const entered = Math.floor(parseFloat(value))
      if (!isNaN(entered) && entered > maxAssemblableUnits) val = String(maxAssemblableUnits)
      else if (!isNaN(entered)) val = String(entered)
    }
    setForm(prev => ({ ...prev, [name]: val }))
  }

  const openMaterialsModal = async (order) => {
    setMaterialsOrder(order); setMaterialLines([]); setNewMatMaterial(''); setNewMatQty(''); setNewMatLocation(''); setMatError('')
    const [linesRes, matsRes] = await Promise.all([
      apiFetch(`/assembly/material-lines/?assembly_order=${order.id}`),
      apiFetch('/master-data/raw-materials/'),
    ])
    if (linesRes?.ok) { const d = await linesRes.json(); setMaterialLines(Array.isArray(d) ? d : (d.results ?? [])) }
    if (matsRes?.ok)  { const d = await matsRes.json();  setAllMaterials(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const addMaterialLine = async () => {
    if (!newMatMaterial || !newMatQty) { setMatError('Select a material and enter quantity.'); return }
    setMatSubmitting(true); setMatError('')
    const payload = {
      assembly_order: materialsOrder.id,
      material:       parseInt(newMatMaterial),
      quantity:       parseFloat(newMatQty),
      ...(newMatLocation ? { location: parseInt(newMatLocation) } : {}),
    }
    const res = await apiFetch('/assembly/material-lines/', { method: 'POST', body: JSON.stringify(payload) })
    if (res?.ok) {
      const d = await res.json(); setMaterialLines(prev => [...prev, d])
      setNewMatMaterial(''); setNewMatQty(''); setNewMatLocation('')
    } else {
      const e = await res.json(); setMatError(e.detail || Object.values(e).flat()[0] || 'Failed to add')
    }
    setMatSubmitting(false)
  }

  const deleteMaterialLine = async (lineId) => {
    const res = await apiFetch(`/assembly/material-lines/${lineId}/`, { method: 'DELETE' })
    if (res?.ok || res?.status === 204) setMaterialLines(prev => prev.filter(l => l.id !== lineId))
  }

  const pickFromQueue = async (stockItem) => {
    // Auto-detect product line from the base product on the stock item
    const matchingFPs = finishedProducts.filter(fp => String(fp.base_product) === String(stockItem.product))

    let autoFP = matchingFPs.length === 1 ? matchingFPs[0] : null
    let autoVariant = null

    if (autoFP) {
      // Fetch variants for this product and auto-select if only one
      try {
        const res = await apiFetch(`/master-data/finished-product-variants/?finished_product=${autoFP.id}&is_available=true`)
        if (res?.ok) {
          const d = await res.json()
          const vList = Array.isArray(d) ? d : (d.results ?? [])
          setVariants(vList)
          if (vList.length === 1) autoVariant = vList[0]
        }
      } catch { /* ignore */ }
    }

    // Compute max from auto-selected variant + stock quantity
    const qty = (autoVariant && parseFloat(autoVariant.volume) > 0)
      ? String(Math.floor(parseFloat(stockItem.quantity) / parseFloat(autoVariant.volume)))
      : ''

    setForm(prev => ({
      ...prev,
      finished_product:         autoFP      ? String(autoFP.id)      : prev.finished_product,
      finished_product_variant: autoVariant ? String(autoVariant.id) : prev.finished_product_variant,
      source_location:          String(stockItem.location),
      source_batch:             String(stockItem.batch),
      assembly_line:            String(stockItem.location), // assembly location = the line itself
      target_quantity:          qty,
    }))
    setCreateOpen(true)
    setDetailsOpen(false)
    setFormError('')
  }

  const handleCreate = async () => {
    setSubmitting(true); setFormError('')
    if (!form.finished_product_variant) { setFormError('Select a product variant from the queue.'); setSubmitting(false); return }
    if (!form.source_location || !form.source_batch) { setFormError('Pick a batch from the production queue first.'); setSubmitting(false); return }
    if (!form.target_quantity) { setFormError('Enter a target quantity.'); setSubmitting(false); return }
    if (!form.destination_location) { setFormError('Select a destination location.'); setSubmitting(false); return }
    try {
      const payload = {
        finished_product_variant: parseInt(form.finished_product_variant),
        assembly_line:            form.assembly_line ? parseInt(form.assembly_line) : null,
        source_location:          parseInt(form.source_location),
        source_batch:             form.source_batch ? parseInt(form.source_batch) : null,
        destination_location:     parseInt(form.destination_location),
        target_quantity:          parseFloat(form.target_quantity),
        notes:                    form.notes,
      }
      const res = await apiFetch('/assembly/assembly-orders/', { method: 'POST', body: JSON.stringify(payload) })
      if (res?.ok) {
        fetchOrders(); setCreateOpen(false); setForm(emptyForm); setBomPreview([])
      } else {
        const errData = await res.json()
        setFormError(errData.detail || Object.entries(errData).map(([k, v]) => `${k}: ${Array.isArray(v) ? v[0] : v}`).join('; ') || 'Check your inputs')
      }
    } catch { setFormError('Connection error') }
    finally { setSubmitting(false) }
  }

  const handleStart = async (order) => {
    const res = await apiFetch(`/assembly/assembly-orders/${order.id}/start/`, { method: 'POST' })
    if (res?.ok) fetchOrders()
  }

  const handleLabel = async (order) => {
    const res = await apiFetch(`/assembly/assembly-orders/${order.id}/label/`, { method: 'POST' })
    if (res?.ok) {
      const data = await res.json()
      fetchOrders()
      fetchProductionQueue()
      if (data.batch_code || data.lpn_code) setSuccessLog(data)
    } else {
      const errData = await res.json().catch(() => ({}))
      alert(errData.detail || 'Labeling failed')
    }
  }

  const handleCancel = async (order) => {
    if (!window.confirm(`Cancel assembly order ${order.assembly_number}?`)) return
    const res = await apiFetch(`/assembly/assembly-orders/${order.id}/cancel/`, { method: 'POST' })
    if (res?.ok) fetchOrders()
  }

  const openCompleteModal = (order) => {
    setCompleteTarget(order)
    setCompleteActual(String(parseFloat(order.target_quantity)))
    setCompleteDestination(order.destination_location ? String(order.destination_location) : '')
    setCompleteError('')
    setCompleteSummary(null)
  }

  const handleComplete = async () => {
    if (!completeTarget) return
    const qty = parseFloat(completeActual)
    if (!qty || qty <= 0) { setCompleteError('Enter a valid actual quantity.'); return }
    setCompleting(true); setCompleteError('')
    try {
      const res = await apiFetch(`/assembly/assembly-orders/${completeTarget.id}/complete/`, {
        method: 'POST',
        body: JSON.stringify({
          actual_quantity:      qty,
          destination_location: completeDestination ? parseInt(completeDestination) : null,
        }),
      })
      if (res?.ok) {
        const data = await res.json()
        fetchOrders()
        fetchProductionQueue()
        setCompleteTarget(null)
        setCompleteSummary(data)
      } else {
        const errData = await res.json()
        setCompleteError(errData.detail || errData.error || 'Failed to complete assembly')
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
          <p className="text-xs text-gray-400 mb-3">Packaging / Assembly Line</p>

          {/* ── Assembly Line Status Dashboard ─────────────────────────────── */}
          {assemblyLines.length > 0 && (
            <div className="mb-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(assemblyLines.length, 4)}, minmax(0, 1fr))` }}>
              {assemblyLines.map(line => {
                const lineOrders     = orders.filter(o => String(o.assembly_line) === String(line.id) && o.status === 'in_progress')
                const runningProduct = lineOrders[0]?.finished_product_name || null
                const runningVariant = lineOrders.map(o => o.finished_product_variant_label).filter(Boolean)
                const isRunning      = lineOrders.length > 0

                return (
                  <div
                    key={line.id}
                    className={`rounded-2xl p-5 border-2 relative overflow-hidden ${
                      isRunning
                        ? 'bg-teal-50 border-teal-300'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    {isRunning && (
                      <span className="absolute top-4 right-4 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
                      </span>
                    )}

                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isRunning ? 'bg-teal-500' : 'bg-gray-300'}`} />
                      <span className={`text-[10px] font-black uppercase tracking-widest ${isRunning ? 'text-teal-600' : 'text-gray-400'}`}>
                        {isRunning ? 'RUNNING' : 'IDLE'}
                      </span>
                    </div>

                    <p className={`text-base font-black leading-tight mb-1 ${isRunning ? 'text-teal-900' : 'text-gray-700'}`}>{line.name}</p>
                    {line.short_code && <p className="text-[9px] font-mono text-gray-400 mb-2">{line.short_code}</p>}

                    {isRunning ? (
                      <div className="mt-2 pt-2 border-t border-teal-200">
                        <p className="text-xs font-bold text-teal-800 truncate">{runningProduct}</p>
                        {runningVariant.length > 0 && (
                          <p className="text-[10px] mt-0.5 text-teal-500 truncate">{[...new Set(runningVariant)].join(', ')}</p>
                        )}
                        <p className="text-[10px] mt-1 font-semibold text-teal-600">
                          {lineOrders.length} active order{lineOrders.length > 1 ? 's' : ''}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs mt-2 text-gray-400">Ready for a new batch</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Production Queue */}
          <div className="rounded-xl bg-white shadow-sm mb-4">
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse"></div>
                <h3 className="text-sm font-semibold text-gray-800">Ready to Assemble</h3>
                <span className="text-[10px] text-gray-400 font-normal">Remaining PRD stock at assembly lines — click to start a new order</span>
              </div>
              <button onClick={fetchProductionQueue} className="text-[10px] text-orange-500 hover:underline">Refresh</button>
            </div>
            {queueLoading ? (
              <div className="px-6 py-4 text-xs text-gray-400">Loading...</div>
            ) : productionQueue.length === 0 ? (
              <div className="px-6 py-4 text-xs text-gray-400 italic">No PRD stock found at assembly line locations. Transfer base product stock from a kettle to an assembly line first.</div>
            ) : (
              <div className="px-6 py-3">
                <div className="flex flex-wrap gap-2">
                  {productionQueue.map(stock => {
                    const reserved        = +(reservedByBatch[String(stock.batch)] || 0).toFixed(4)
                    const total           = parseFloat(stock.quantity)
                    const netAvailable    = Math.max(0, total - reserved)
                    const isFullyReserved = reserved > 0 && netAvailable <= 0
                    const isPartial       = reserved > 0 && !isFullyReserved
                    const activeOrders    = orders.filter(o => o.status === 'in_progress' && String(o.source_batch) === String(stock.batch))
                    const lineForStock    = assemblyLines.find(l => String(l.id) === String(stock.location))
                    return (
                      <button
                        key={stock.id}
                        onClick={() => !isFullyReserved && pickFromQueue(stock)}
                        disabled={isFullyReserved}
                        className={`flex flex-col text-left p-3 rounded-lg border transition-all group min-w-[190px] ${
                          isFullyReserved
                            ? 'border-red-200 bg-red-50/30 opacity-60 cursor-not-allowed'
                            : isPartial
                            ? 'border-amber-300 bg-amber-50/30 hover:border-amber-400 hover:bg-amber-50'
                            : 'border-gray-200 bg-white hover:border-teal-400 hover:bg-teal-50/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-mono text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100 font-bold">{stock.batch_code || '—'}</span>
                          {isFullyReserved
                            ? <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">All Used</span>
                            : isPartial
                            ? <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">In Use</span>
                            : null}
                        </div>
                        <div className="text-xs font-medium text-gray-700 group-hover:text-teal-800">{stock.product_name}</div>
                        {lineForStock && (
                          <div className="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded inline-block mt-0.5 mb-1">{lineForStock.name}</div>
                        )}
                        {!lineForStock && <div className="text-[10px] text-gray-400 truncate mb-1.5">{stock.location_name}</div>}
                        <div className="space-y-0.5">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-gray-400">Total</span>
                            <span className="font-bold text-slate-600">{total.toLocaleString()} <span className="font-normal uppercase">{stock.unit}</span></span>
                          </div>
                          {reserved > 0 && (
                            <div className="flex justify-between text-[10px]">
                              <span className="text-amber-500">Reserved{activeOrders.length > 0 ? ` (${activeOrders.length})` : ''}</span>
                              <span className="font-bold text-amber-600">{reserved.toLocaleString()} <span className="font-normal uppercase">{stock.unit}</span></span>
                            </div>
                          )}
                          <div className="flex justify-between text-[10px]">
                            <span className={netAvailable > 0 ? 'text-teal-600' : 'text-red-500'}>Available</span>
                            <span className={`font-bold ${netAvailable > 0 ? 'text-teal-700' : 'text-red-600'}`}>{netAvailable.toLocaleString()} <span className="font-normal uppercase">{stock.unit}</span></span>
                          </div>
                        </div>
                        {!isFullyReserved && <div className="mt-1.5 text-[9px] font-bold text-teal-600 uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">Click to start assembly →</div>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Assembly Line Orders</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Converts base product + packaging materials → filled finished product (no label yet)</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search..." className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-44" />
                </div>
                <div className="relative" ref={filterRef}>
                  <button onClick={() => setFilterOpen(o => !o)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${activeFilterCount > 0 ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    Filters {activeFilterCount > 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] text-white font-semibold">{activeFilterCount}</span>}
                  </button>
                  {filterOpen && (
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-xl bg-white border border-gray-200 shadow-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">Filters</p>
                        {activeFilterCount > 0 && <button onClick={() => { setFilters({ status: '', finished_product: '' }); setPage(1) }} className="text-[10px] text-orange-500 hover:underline">Clear all</button>}
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Status</label>
                        <select value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1) }} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
                          <option value="">All</option>
                          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
                    <th className="px-4 py-3 w-10">No</th>
                    <th className="px-4 py-3">Assembly #</th>
                    <th className="px-4 py-3">Line</th>
                    <th className="px-4 py-3">Product Variant</th>
                    <th className="px-4 py-3">Source → Destination</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Batches</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr><td colSpan={10} className="px-6 py-10 text-center text-gray-400">No assembly orders found</td></tr>
                  ) : paginated.map((order, idx) => {
                    const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft
                    return (
                      <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{order.assembly_number}</span>
                        </td>
                        <td className="px-4 py-3">
                          {order.assembly_line_name ? (
                            <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{order.assembly_line_name}</span>
                          ) : <span className="text-gray-300 text-[10px]">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 text-sm">{order.finished_product_name}</div>
                          <div className="text-[10px] text-gray-400">{order.finished_product_variant_label}</div>
                          <div className="text-[10px] text-gray-300">Base: {order.base_product_name}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-bold text-rose-500 w-6">SRC</span>
                              <span className="text-slate-600">{order.source_location_name}</span>
                              {order.source_batch_code && <span className="font-mono text-[9px] text-orange-500 bg-orange-50 px-1 rounded">{order.source_batch_code}</span>}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-bold text-emerald-500 w-6">DST</span>
                              <span className="text-slate-600">{order.destination_location_name}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-800">
                          <div className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Target</div>
                          {parseFloat(order.target_quantity).toLocaleString()} <span className="text-[10px] font-normal text-gray-400">{order.volume_unit_symbol} {order.unit_name}</span>
                          {order.actual_quantity != null && (
                            <div className="mt-0.5">
                              <div className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Actual</div>
                              <span className={`font-bold ${parseFloat(order.actual_quantity) < parseFloat(order.target_quantity) ? 'text-amber-600' : 'text-green-600'}`}>
                                {parseFloat(order.actual_quantity).toLocaleString()}
                              </span>
                              <span className="text-[10px] font-normal text-gray-400"> {order.volume_unit_symbol} {order.unit_name}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {order.produced_batch_code ? (
                            <span className="font-mono text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-100">{order.produced_batch_code}</span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${statusCfg.color}`}>{statusCfg.label}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{new Date(order.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {order.status === 'draft' && (
                              <button onClick={() => handleStart(order)} className="rounded-md bg-blue-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-blue-600">Start</button>
                            )}
                            {order.status === 'in_progress' && (<>
                              <button onClick={() => openMaterialsModal(order)} className="rounded-md bg-indigo-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-indigo-600">Materials</button>
                              <button onClick={() => openCompleteModal(order)} className="rounded-md bg-teal-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-teal-600">Mark Assembled</button>
                            </>)}
                            {order.status === 'assembled' && (
                              <button onClick={() => handleLabel(order)} className="rounded-md bg-orange-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-orange-600">Add Labels</button>
                            )}
                            {order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'assembled' && (
                              <button onClick={() => handleCancel(order)} className="rounded-md bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-600 hover:bg-red-100">Cancel</button>
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

      {/* Create Modal — minimal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">New Assembly Order</h3>
              <button onClick={() => { setCreateOpen(false); setForm(emptyForm); setDetailsOpen(false) }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{formError}</div>}

              {/* Product Line */}
              <div className="space-y-2">
                <select name="finished_product" value={form.finished_product} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none">
                  <option value="">Select Product Line *</option>
                  {finishedProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>

                {/* Variant pill buttons */}
                {form.finished_product && (
                  variantsLoading ? (
                    <div className="p-2 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg">Loading variants...</div>
                  ) : variants.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-1">No variants found</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {variants.map(v => {
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
                            {parseFloat(v.volume)}
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
                  )
                )}
              </div>

              {/* Source — read-only card (always pre-filled from queue) */}
              {form.source_batch && form.source_location ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-teal-50 border border-teal-200">
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="font-mono text-orange-600 font-bold bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">
                      {productionQueue.find(s => String(s.batch) === String(form.source_batch))?.batch_code || `Batch #${form.source_batch}`}
                    </span>
                    <span className="text-teal-500">@</span>
                    <span className="text-teal-700 font-medium">
                      {locations.find(l => String(l.id) === String(form.source_location))?.name || `Location #${form.source_location}`}
                    </span>
                  </div>
                  <button
                    onClick={() => setForm(prev => ({ ...prev, source_batch: '', source_location: '', assembly_line: '' }))}
                    className="text-[10px] text-slate-400 hover:text-red-500 transition-colors ml-2 shrink-0"
                  >✕</button>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                  Pick a batch from the production queue above to start an assembly order.
                </div>
              )}

              {/* Assembly Line status — auto-set from queue pick, shown for visibility */}
              {assemblyLines.length > 0 && (
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Assembly Line</label>
                  <div className="flex flex-wrap gap-2">
                    {assemblyLines.map(line => {
                      const isSelected    = String(form.assembly_line) === String(line.id)
                      const lineOrders    = orders.filter(o => String(o.assembly_line) === String(line.id) && o.status === 'in_progress')
                      const runningProduct = lineOrders[0]?.finished_product_name || null
                      const selectedFPName = finishedProducts.find(p => String(p.id) === String(form.finished_product))?.name
                      const isBlocked     = runningProduct && selectedFPName && runningProduct !== selectedFPName
                      const isCompatible  = runningProduct && selectedFPName && runningProduct === selectedFPName
                      return (
                        <button key={line.id} type="button"
                          disabled={isBlocked}
                          onClick={() => !isBlocked && setForm(prev => ({ ...prev, assembly_line: String(line.id) }))}
                          className={`inline-flex flex-col items-start px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition-all ${
                            isBlocked
                              ? 'border-red-200 bg-red-50 text-red-400 cursor-not-allowed opacity-70'
                              : isSelected
                                ? 'border-orange-400 bg-orange-500 text-white shadow-sm shadow-orange-200'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
                          }`}
                        >
                          <span>{line.name}{line.short_code ? ` (${line.short_code})` : ''}</span>
                          <span className={`text-[9px] font-normal mt-0.5 ${
                            isBlocked    ? 'text-red-400' :
                            isCompatible ? 'text-teal-500' :
                            isSelected   ? 'text-orange-100' :
                            runningProduct ? 'text-teal-500' : 'text-slate-300'
                          }`}>
                            {isBlocked ? `⛔ Running ${runningProduct}` :
                             isCompatible ? `✓ ${lineOrders.length} same product` :
                             runningProduct ? `${lineOrders.length} running` : 'idle'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Destination Location — always visible */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Destination Location *</label>
                <select name="destination_location" value={form.destination_location} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none">
                  <option value="">Where finished product goes after assembly</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.full_path || l.name}</option>)}
                </select>
              </div>

              {/* Target Quantity — big and prominent */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-orange-600">Target Quantity *</label>
                  {maxAssemblableUnits != null && (
                    <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                      Max {maxAssemblableUnits.toLocaleString()} {selectedVariant?.unit_name}
                    </span>
                  )}
                </div>
                <input name="target_quantity" type="number" step="1" min="1" max={maxAssemblableUnits || undefined}
                  placeholder={maxAssemblableUnits ? `Max ${maxAssemblableUnits}` : '0'}
                  value={form.target_quantity} onChange={handleFormChange} onWheel={e => e.target.blur()}
                  className="w-full rounded-lg border-2 border-orange-300 bg-orange-50/40 px-4 py-3 text-xl font-bold text-orange-700 focus:border-orange-500 outline-none" />
                {/* Calculation row */}
                {availableQty != null && sourceStock && (
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500 flex-wrap">
                    <span className="font-mono text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">{sourceStock.batch_code}</span>
                    <span>· {availableQty.toLocaleString()} {sourceStock.unit} available @ {sourceStock.location_name}</span>
                    {remainder != null && remainder > 0 && <span className="text-amber-600 font-medium">· {remainder.toLocaleString()} {sourceStock.unit} remaining</span>}
                    {remainder === 0 && <span className="text-green-600">· exact fill</span>}
                  </div>
                )}
                {baseConsumed != null && (
                  <p className={`mt-1 text-[10px] font-medium ${isOverstock ? 'text-red-600' : 'text-slate-400'}`}>
                    {isOverstock ? '⚠ Exceeds available stock — ' : ''}
                    Will consume {baseConsumed.toLocaleString()} {selectedVariant?.base_product_unit_symbol} of {selectedVariant?.base_product_name}
                  </p>
                )}
              </div>

              {/* Notes */}
              <textarea name="notes" value={form.notes} onChange={handleFormChange} rows={2} placeholder="Notes (optional)..." className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none resize-none" />
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-slate-50/30">
              <button onClick={() => { setCreateOpen(false); setForm(emptyForm); setDetailsOpen(false) }} className="rounded-lg border border-gray-200 px-6 py-2 text-sm font-bold text-slate-500 hover:bg-white">Cancel</button>
              <button onClick={handleCreate} disabled={submitting || !form.finished_product_variant || !form.source_location || !form.target_quantity || !form.destination_location} className="rounded-lg bg-orange-500 px-8 py-2 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-50 active:scale-95 transition-all">
                {submitting ? 'Creating...' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Modal */}
      {completeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Mark as Assembled</h3>
              <button onClick={() => setCompleteTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {completeError && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{completeError}</div>}
              <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Order</span>
                  <span className="font-mono font-bold text-orange-600">{completeTarget.assembly_number}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Target</span>
                  <span className="font-bold text-gray-900">{parseFloat(completeTarget.target_quantity).toLocaleString()} <span className="text-gray-400 font-normal">{completeTarget.volume_unit_symbol} {completeTarget.unit_name}</span></span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Destination — where filled product will go *</label>
                <select value={completeDestination} onChange={e => setCompleteDestination(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 outline-none">
                  <option value="">Select location</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.full_path || l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-1">Actual Quantity Assembled *</label>
                <input type="number" step="any" value={completeActual} onChange={e => setCompleteActual(e.target.value)} onWheel={e => e.target.blur()} className="w-full rounded-lg border border-orange-200 bg-orange-50/30 px-3 py-2 text-sm font-bold text-orange-700 focus:border-orange-500 outline-none" />
                {completeActual && parseFloat(completeActual) < parseFloat(completeTarget.target_quantity) && (
                  <p className="text-[10px] text-rose-500 mt-1">Wastage: {(parseFloat(completeTarget.target_quantity) - parseFloat(completeActual)).toLocaleString()} units</p>
                )}
              </div>
              {completeActual && parseFloat(completeActual) > 0 && (
                <div className="rounded-lg bg-teal-50 border border-teal-100 p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wide">Will execute:</p>
                  <p className="text-[10px] text-teal-600">
                    • Deduct base product from {completeTarget.source_location_name}
                  </p>
                  <p className="text-[10px] text-teal-600">• Create FIN batch + add {parseFloat(completeActual).toLocaleString()} {completeTarget.volume_unit_symbol} {completeTarget.unit_name} to {completeTarget.destination_location_name}</p>
                  {completeTarget.material_lines?.length > 0 ? (
                    completeTarget.material_lines.map(line => (
                      <p key={line.id} className="text-[10px] text-teal-600">
                        • Deduct <strong>{parseFloat(line.quantity).toLocaleString()} {line.unit_symbol}</strong> of {line.material_name}
                        {line.location_name && <span className="text-teal-400"> from {line.location_name}</span>}
                      </p>
                    ))
                  ) : (
                    <p className="text-[10px] text-amber-600">• No materials recorded yet — add via the Materials button if needed</p>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-slate-50/30">
              <button onClick={() => setCompleteTarget(null)} className="rounded-lg border border-gray-200 px-5 py-2 text-sm font-bold text-slate-500 hover:bg-white">Cancel</button>
              <button onClick={handleComplete} disabled={completing || !completeDestination || !completeActual || parseFloat(completeActual) <= 0} className="rounded-lg bg-green-500 px-6 py-2 text-sm font-bold text-white shadow-lg shadow-green-200 hover:bg-green-600 disabled:opacity-50 active:scale-95 transition-all">
                {completing ? 'Processing...' : 'Mark as Assembled'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Materials Modal */}
      {materialsOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Materials Used</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">{materialsOrder.assembly_number} — Record consumables and base products consumed</p>
              </div>
              <button onClick={() => { setMaterialsOrder(null); fetchOrders() }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {matError && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{matError}</div>}

              {/* Existing lines */}
              {materialLines.length > 0 ? (
                <div className="space-y-1.5">
                  {materialLines.map(line => (
                    <div key={line.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-gray-100">
                      <div>
                        <span className="text-xs font-semibold text-gray-800">{line.material_name}</span>
                        {line.location_name && <span className="text-[10px] text-gray-400 ml-1">@ {line.location_name}</span>}
                        <span className="text-[10px] text-gray-400 ml-1.5">({line.material_type})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700">{parseFloat(line.quantity).toLocaleString()} <span className="font-normal text-gray-400">{line.unit_symbol}</span></span>
                        <button onClick={() => deleteMaterialLine(line.id)} className="text-red-400 hover:text-red-600 text-xs px-1.5 py-0.5 rounded hover:bg-red-50">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic text-center py-2">No materials recorded yet.</p>
              )}

              {/* Add new line */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Add Material / Consumable</p>
                <div className="grid grid-cols-1 gap-2">
                  <select value={newMatMaterial} onChange={e => setNewMatMaterial(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-indigo-500 outline-none">
                    <option value="">Select material or consumable...</option>
                    {allMaterials.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.unit_symbol}) — {m.type_display || m.type}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input type="number" step="any" min="0" placeholder="Quantity used" value={newMatQty} onChange={e => setNewMatQty(e.target.value)} onWheel={e => e.target.blur()} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-indigo-500 outline-none" />
                    <select value={newMatLocation} onChange={e => setNewMatLocation(e.target.value)} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-indigo-500 outline-none">
                      <option value="">Default location</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.full_path || l.name}</option>)}
                    </select>
                    <button onClick={addMaterialLine} disabled={matSubmitting || !newMatMaterial || !newMatQty} className="rounded-lg bg-indigo-500 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-600 disabled:opacity-50">Add</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-slate-50/30">
              <button onClick={() => { setMaterialsOrder(null); fetchOrders() }} className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-bold text-white hover:bg-orange-600">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Completion Summary */}
      {completeSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Assembly Complete</h3>
              <button onClick={() => setCompleteSummary(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-green-800">{completeSummary.assembly_number}</p>
                  <p className="text-[10px] text-green-600">{parseFloat(completeSummary.actual_quantity).toLocaleString()} units assembled</p>
                  {completeSummary.produced_batch_code && (
                    <p className="text-[10px] text-green-700 font-mono mt-0.5">FIN Batch: <strong>{completeSummary.produced_batch_code}</strong></p>
                  )}
                  <div className={`mt-1.5 text-[10px] px-2 py-1 rounded ${completeSummary.base_deducted ? 'text-slate-600 bg-slate-50' : 'text-amber-700 bg-amber-50 border border-amber-100'}`}>
                    {completeSummary.base_deducted
                      ? '✓ Base product stock deducted'
                      : `⚠ Base stock not deducted${completeSummary.base_deduct_note ? `: ${completeSummary.base_deduct_note}` : ''}`}
                  </div>
                </div>
              </div>
              {completeSummary.deductions?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Materials Consumed</p>
                  <div className="space-y-1.5">
                    {completeSummary.deductions.map((d, i) => (
                      <div key={i} className={`flex items-center justify-between text-xs rounded-md px-3 py-1.5 ${d.deducted ? 'bg-slate-50' : 'bg-amber-50 border border-amber-100'}`}>
                        <div>
                          <span className={`font-medium ${d.deducted ? 'text-gray-700' : 'text-amber-700'}`}>{d.material_name}</span>
                          {!d.deducted && <span className="text-[9px] text-amber-500 ml-1.5">recorded only — no stock location set</span>}
                        </div>
                        <span className="font-bold text-slate-800">{d.quantity_used.toLocaleString()} <span className="font-normal text-gray-400">{d.unit_symbol}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="p-3 rounded-lg bg-teal-50 border border-teal-100">
                <p className="text-[10px] text-teal-700 font-medium">Next step: Click <strong>Add Labels</strong> on the assembled order to generate LPN and print the label.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-slate-50/30">
              <button onClick={() => setCompleteSummary(null)} className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-bold text-white hover:bg-orange-600">Done</button>
            </div>
          </div>
        </div>
      )}

      {successLog && (
        <BatchSuccessModal
          log={successLog}
          onClose={() => setSuccessLog(null)}
        />
      )}
    </div>
  )
}

export default AssemblyOrdersPage
