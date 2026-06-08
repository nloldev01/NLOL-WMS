import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch, parseError } from '../utils/api'
import BatchSuccessModal from '../components/BatchSuccessModal'

const PAGE_SIZE = 10

const MOVEMENT_TYPES = [
  { value: 'production', label: 'Production', color: 'bg-green-50 text-green-700' },
  { value: 'sale', label: 'Sale / Issue', color: 'bg-blue-50 text-blue-700' },
  { value: 'sale_return', label: 'Customer Return', color: 'bg-indigo-50 text-indigo-700' },
  { value: 'purchase', label: 'Purchase / Receipt', color: 'bg-emerald-50 text-emerald-700' },
  { value: 'purchase_return', label: 'Return to Supplier', color: 'bg-red-50 text-red-700' },
  { value: 'transfer_in', label: 'Transfer In', color: 'bg-violet-50 text-violet-700' },
  { value: 'transfer_out', label: 'Transfer Out', color: 'bg-pink-50 text-pink-700' },
  { value: 'adjustment',      label: 'Adjustment',      color: 'bg-slate-100 text-slate-600' },
  { value: 'wastage',         label: 'Wastage',          color: 'bg-rose-50 text-rose-700' },
  { value: 'packaging_usage', label: 'Packaging Usage',  color: 'bg-orange-50 text-orange-700' },
]

const MOVEMENT_MAP = Object.fromEntries(MOVEMENT_TYPES.map(m => [m.value, m]))

const emptyForm = {
  product: '',
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

// Helper component for Quick Pick suggestions
const QuickPickSuggestions = ({ suggestions, onPick }) => {
  if (!suggestions.length) return null
  return (
    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Available Stock (Quick Pick)</p>
      <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
        {suggestions.map((item, idx) => (
          <button
            key={idx}
            onClick={() => onPick(item)}
            className="flex flex-col text-left p-2 rounded-lg border border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/50 transition-all group relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-mono font-bold text-orange-600 bg-orange-50 px-1.5 rounded border border-orange-100">
                {item.batch_code || 'No Batch'}
              </span>
              <span className="text-xs font-bold text-slate-700">
                {parseFloat(item.quantity).toLocaleString()} <span className="text-[10px] text-slate-400 font-normal uppercase">{item.unit}</span>
              </span>
            </div>
            <div className="text-[10px] font-medium text-slate-500 truncate group-hover:text-slate-700 transition-colors">
              {item.location_name}
            </div>
            <div className="absolute right-2 bottom-2 translate-x-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
              <svg className="w-3.5 h-3.5 text-orange-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" /></svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// Helper component for cascading location selects
const CascadingLocationSelector = ({ locations, value, onChange, onQuickAdd }) => {
  const getPath = (id) => {
    let path = []
    let curr = locations.find(l => String(l.id) === String(id))
    while (curr) {
      path.unshift(curr)
      curr = locations.find(l => String(l.id) === String(curr.parent))
    }
    return path
  }

  const path = getPath(value)
  const levels = []

  levels.push({ label: 'Warehouse', options: locations.filter(l => !l.parent), selected: path[0]?.id || '' })

  path.forEach((node, i) => {
    const children = locations.filter(l => String(l.parent) === String(node.id))
    if (children.length > 0) {
      levels.push({
        label: node.type === 'warehouse' ? 'Zone' : (node.type === 'zone' ? 'Block' : (node.type === 'block' ? 'Aisle' : (node.type === 'aisle' ? 'Rack' : 'Shelf'))),
        options: children,
        selected: path[i + 1]?.id || ''
      })
    }
  })

  return (
    <div className="space-y-3">
      {levels.map((level, i) => (
        <div key={i} className="animate-in slide-in-from-top-1 duration-200">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{level.label} {i === 0 && '*'}</label>
          <div className="flex gap-2">
            <select
              value={level.selected}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none bg-white font-medium"
            >
              <option value="">Select {level.label.toLowerCase()}...</option>
              {level.options.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
            </select>
            {i === levels.length - 1 && (
              <button
                type="button"
                onClick={onQuickAdd}
                className="p-2 aspect-square rounded-lg border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 active:scale-95 transition-all shadow-sm"
                title={`Quick Add ${level.label}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

const QuickAddLocationModal = ({ isOpen, onClose, onAdd, locations }) => {
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [type, setType] = useState('warehouse')
  const [adding, setAdding] = useState(false)

  if (!isOpen) return null

  const handleAdd = async () => {
    if (!name) return
    setAdding(true)
    const success = await onAdd({ name, parent: parent || null, type })
    setAdding(false)
    if (success) {
      setName('')
      setParent('')
      setType('warehouse')
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-slate-50 px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">New Location</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Name *</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Shelf B, Rack 4..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Parent Location</label>
            <select
              value={parent}
              onChange={e => setParent(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 transition-all outline-none"
            >
              <option value="">No Parent (Top Level)</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.full_path}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 transition-all outline-none"
            >
              <option value="warehouse">Warehouse</option>
              <option value="zone">Zone</option>
              <option value="block">Block</option>
              <option value="aisle">Aisle</option>
              <option value="rack">Rack</option>
              <option value="shelf">Shelf</option>
            </select>
          </div>
          <button
            onClick={handleAdd}
            disabled={!name || adding}
            className="w-full py-2 bg-orange-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-orange-200 hover:bg-orange-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
          >
            {adding ? 'Saving...' : 'Add Location'}
          </button>
        </div>
      </div>
    </div>
  )
}

const ProductMovementPage = () => {
  const [logs, setLogs] = useState([])
  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [filterBatches, setFilterBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [locModalOpen, setLocModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [successLog, setSuccessLog] = useState(null)
  const [availableStock, setAvailableStock] = useState([])
  const [fetchingStock, setFetchingStock] = useState(false)

  const [filters, setFilters] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return {
      movement_type: '',
      location: params.get('location') || '',
      product: params.get('product') || '',
      batch: params.get('batch') || '',
      lpn: params.get('lpn') || '',
      supplier: params.get('supplier') || '',
    }
  })

  const [filterOpen, setFilterOpen] = useState(false)
  const [batches, setBatches] = useState([]) // For the modal
  const filterRef = useRef(null)

  useEffect(() => {
    fetchProducts()
    fetchLocations()
    fetchSuppliers()
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [search, filters])

  useEffect(() => {
    fetchFilterBatches(filters.product)
  }, [filters.product])

  useEffect(() => {
    if (form.product) {
      fetchAvailableStock(form.product)
    } else {
      setAvailableStock([])
    }
  }, [form.product])

  useEffect(() => {
    // For transfers, we fetch batches at the SOURCE location
    const sourceLoc = form.movement_type === 'transfer_in' ? form.counterpart_location : form.location
    if (form.product && sourceLoc) {
      fetchBatches(form.product, sourceLoc)
    } else {
      setBatches([])
    }
  }, [form.product, form.location, form.counterpart_location, form.movement_type])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target))
        setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (filters.movement_type) params.append('movement_type', filters.movement_type)
      if (filters.product) params.append('product', filters.product)
      if (filters.location) params.append('location', filters.location)
      if (filters.batch) params.append('batch', filters.batch)
      if (filters.supplier) params.append('supplier', filters.supplier)

      const res = await apiFetch(`/products-stock/stock-movements/?${params.toString()}`)
      if (res && res.ok) {
        const data = await res.json()
        setLogs(Array.isArray(data) ? data : (data.results ?? []))
      } else setLogs([])
    } catch { setError('Failed to load logs') }
    finally { setLoading(false) }
  }

  const fetchProducts = async () => {
    const res = await apiFetch('/master-data/products/')
    if (res && res.ok) {
      const data = await res.json()
      setProducts(Array.isArray(data) ? data : (data.results ?? []))
    }
  }

  const fetchLocations = async () => {
    const res = await apiFetch('/master-data/locations/')
    if (res && res.ok) {
      const data = await res.json()
      setLocations(Array.isArray(data) ? data : (data.results ?? []))
    }
  }

  const fetchSuppliers = async () => {
    const res = await apiFetch('/master-data/suppliers/')
    if (res && res.ok) {
      const data = await res.json()
      setSuppliers(Array.isArray(data) ? data : (data.results ?? []))
    }
  }

  const fetchBatches = async (pid) => {
    const res = await apiFetch(`/inventory-core/batches/?batch_type=PRD&product=${pid}`)
    if (res && res.ok) {
      const data = await res.json()
      setBatches(Array.isArray(data) ? data : (data.results ?? []))
    }
  }

  const fetchFilterBatches = async (pid) => {
    let q = '?batch_type=PRD'
    if (pid) q += `&product=${pid}`
    const res = await apiFetch(`/inventory-core/batches/${q}`)
    if (res && res.ok) {
      const data = await res.json()
      setFilterBatches(Array.isArray(data) ? data : (data.results ?? []))
    }
  }

  const fetchAvailableStock = async (pid) => {
    setFetchingStock(true)
    try {
      const res = await apiFetch(`/products-stock/stock/?product=${pid}&quantity=0.01`)
      if (res && res.ok) {
        const data = await res.json()
        const items = Array.isArray(data) ? data : (data.results ?? [])
        // Sort by updated_at (FIFO ish)
        setAvailableStock(items.filter(i => parseFloat(i.quantity) > 0))
      }
    } catch { console.error('Failed to fetch available stock') }
    finally { setFetchingStock(false) }
  }

  const addLocation = async (loc) => {
    try {
      const res = await apiFetch('/master-data/locations/', {
        method: 'POST',
        body: JSON.stringify(loc)
      })
      if (res && res.ok) {
        fetchLocations()
        return true
      }
    } catch { console.error('Failed to add location') }
    return false
  }

  const filtered = logs
  const activeFilterCount = Object.values(filters).filter(v => v !== '').length
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const isTransfer = ['transfer_out', 'transfer_in'].includes(form.movement_type)
  const isOutbound = ['sale', 'usage', 'wastage', 'transfer_out', 'production_usage', 'transfer_in'].includes(form.movement_type)

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => {
      const next = { ...prev, [name]: value }

      // Dynamic logic: if batch is selected, take its supplier
      if (name === 'batch' && value) {
        const selBatch = batches.find(b => String(b.id) === String(value))
        if (selBatch?.supplier) {
          next.supplier = selBatch.supplier
        }
      }

      return next
    })
  }

  const handlePick = (item) => {
    setForm(prev => ({
      ...prev,
      [prev.movement_type === 'transfer_in' ? 'counterpart_location' : 'location']: item.location,
      batch: item.batch,
      lpn: item.lpn,
      quantity: item.quantity, // Auto-fill full quantity
      auto_generate_batch: false,
      auto_generate_lpn: false,
    }))
  }

  const selectedProduct = products.find(p => String(p.id) === String(form.product))
  const unitLabel = selectedProduct?.unit_name || selectedProduct?.unit || ''

  const openAdd = () => {
    setForm(emptyForm)
    setError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setForm(emptyForm)
    setError('')
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    // Derive auto-generation flags from movement type
    const isInbound = ['production', 'purchase', 'sale_return'].includes(form.movement_type)
    const isTransferOut = form.movement_type === 'transfer_out'
    const isTransferIn = form.movement_type === 'transfer_in'
    const isAdj = form.movement_type === 'adjustment'

    const shouldAutoBatch = isInbound || (isAdj && form.auto_generate_batch)
    const shouldAutoLPN = isInbound || isTransferOut || isTransferIn || (isAdj && form.auto_generate_lpn)

    const payload = {
      product: parseInt(form.product),
      location: parseInt(form.location),
      movement_type: form.movement_type,
      quantity: parseFloat(form.quantity),
      batch: form.batch ? parseInt(form.batch) : null,
      lpn: form.lpn ? parseInt(form.lpn) : null,
      supplier: form.supplier ? parseInt(form.supplier) : null,
      auto_generate_batch: shouldAutoBatch,
      auto_generate_lpn: shouldAutoLPN,
      reference: form.reference,
      notes: form.notes,
      counterpart_location: form.counterpart_location ? parseInt(form.counterpart_location) : null
    }

    try {
      const res = await apiFetch('/products-stock/stock-movements/record/', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      if (res && res.ok) {
        const data = await res.json()
        fetchLogs()

        // Show success modal with QR if response contains batch/LPN codes
        if (data.batch_code || data.lpn_code) {
          setSuccessLog(data)
        } else {
          closeModal()
        }
      } else setError(parseError(await res.json().catch(() => ({}))))
    } catch { setError('Connection error') }
    finally { setSubmitting(false) }
  }

  const selectedBatchObj = batches.find(b => String(b.id) === String(form.batch))

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Base Product Movements</p>

          <div className="rounded-xl bg-white shadow-sm min-h-[500px]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Base Product Movement History</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={openAdd}
                  className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Record Movement
                </button>

                <div className="relative group">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                    placeholder="Search ledger..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-48"
                  />
                </div>

                <div className="relative" ref={filterRef}>
                  <button
                    onClick={() => setFilterOpen(o => !o)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${activeFilterCount > 0
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
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-60 rounded-xl bg-white border border-gray-200 shadow-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">Filters</p>
                        {activeFilterCount > 0 && (
                          <button
                            onClick={() => { setFilters({ movement_type: '', location: '', product: '', batch: '', supplier: '' }); setPage(1) }}
                            className="text-[10px] text-orange-500 hover:underline"
                          >
                            Clear all
                          </button>
                        )}
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Movement Type</label>
                        <select
                          value={filters.movement_type}
                          onChange={e => { setFilters(f => ({ ...f, movement_type: e.target.value })); setPage(1) }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        >
                          <option value="">All</option>
                          {MOVEMENT_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Product</label>
                        <select
                          value={filters.product}
                          onChange={e => { setFilters(f => ({ ...f, product: e.target.value, batch: '' })); setPage(1) }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        >
                          <option value="">All</option>
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
                          <option value="">All</option>
                          {filterBatches.map(b => (
                            <option key={b.id} value={String(b.id)}>
                              {b.batch_code} ({parseFloat(b.current_stock).toLocaleString()} qty)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Supplier</label>
                        <select
                          value={filters.supplier}
                          onChange={e => { setFilters(f => ({ ...f, supplier: e.target.value })); setPage(1) }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        >
                          <option value="">All</option>
                          {suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Location</label>
                        <select
                          value={filters.location}
                          onChange={e => { setFilters(f => ({ ...f, location: e.target.value })); setPage(1) }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        >
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
                    <th className="px-6 py-3">Base Product</th>
                    <th className="px-6 py-3">Batch / LPN</th>
                    <th className="px-6 py-3">Movement</th>
                    <th className="px-6 py-3">Quantity</th>
                    <th className="px-6 py-3">Location / Path</th>
                    <th className="px-6 py-3">Balance</th>
                    <th className="px-6 py-3">Date Recorded</th>
                    <th className="px-6 py-3">By</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {paginated.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-10 text-center text-gray-400">No movement records found</td>
                      </tr>
                    ) : paginated.map((log, idx) => {
                      const mType = MOVEMENT_MAP[log.movement_type]
                      return (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                          <td className="px-6 py-3 font-medium text-gray-900">{log.product_name}</td>
                          <td className="px-6 py-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="px-1.5 py-0.5 rounded font-mono text-[9px] text-orange-600 bg-orange-50 font-bold border border-orange-100 inline-block w-fit">
                                {log.batch_code || '—'}
                              </span>
                              {log.lpn_code && (
                                <span className="px-1.5 py-0.5 rounded font-mono text-[9px] text-indigo-600 bg-indigo-50 font-bold border border-indigo-100 inline-block w-fit">
                                  {log.lpn_code}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${mType?.color ?? 'bg-gray-100 text-gray-600'}`}>
                              {mType?.label ?? log.movement_type}
                            </span>
                          </td>
                          <td className="px-6 py-3 font-bold text-slate-800">
                            {parseFloat(log.quantity).toLocaleString()} <span className="text-[10px] font-normal text-gray-400 uppercase">{log.unit}</span>
                          </td>
                          <td className="px-6 py-3 text-gray-500 text-xs">
                            {log.movement_type.includes('transfer') ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 leading-none">
                                  <span className="text-[9px] font-bold text-rose-500 w-8">FROM</span>
                                  <span className="font-medium text-slate-500 uppercase tracking-tight">{log.movement_type === 'transfer_out' ? log.location_name : log.counterpart_location_name}</span>
                                </div>
                                <div className="flex items-center gap-2 leading-none">
                                  <span className="text-[9px] font-bold text-emerald-500 w-8">TO</span>
                                  <span className="font-medium text-slate-800 uppercase tracking-tight">{log.movement_type === 'transfer_out' ? log.counterpart_location_name : log.location_name}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span className={`text-[9px] font-bold ${['sale', 'purchase_return', 'wastage', 'adjustment'].includes(log.movement_type) ? 'text-rose-500' : 'text-emerald-500'}`}>
                                  {['sale', 'purchase_return', 'wastage', 'adjustment'].includes(log.movement_type) ? 'OUT (SOURCE)' : 'IN (DESTINATION)'}
                                </span>
                                <span className="font-medium text-slate-700 uppercase tracking-tight">{log.location_name}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-3 font-bold text-slate-900 italic">
                            {parseFloat(log.balance_after).toLocaleString()} <span className="text-[10px] font-normal text-gray-400 uppercase">{log.unit}</span>
                          </td>
                          <td className="px-6 py-3 text-gray-400 text-xs">
                            {new Date(log.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                              {log.performer_name || '—'}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <button
                              onClick={() => setSuccessLog(log)}
                              disabled={!log.lpn_code}
                              className="rounded-lg bg-orange-500 p-1.5 text-white hover:bg-orange-600 disabled:opacity-30 transition-all shadow-sm"
                              title={log.lpn_code ? "View/Print LPN Label" : "Only LPNs can have labels"}
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM13 13h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2zm2 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm0-4h2v2h-2v-2zm-2 2h2v2h-2v-2z" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            }

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
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
                    className={`w-7 h-7 rounded text-xs font-medium ${page === p ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'
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

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto animate-in zoom-in duration-200">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Record Base Product Movement</h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >×</button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {error && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {error}
                </div>
              )}

               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-6 border-b border-slate-50">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Base Product *</label>
                  <select
                    name="product"
                    value={form.product}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none"
                  >
                    <option value="">Select Product</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Movement Type *</label>
                  <select
                    name="movement_type"
                    value={form.movement_type}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none"
                  >
                    <option value="">Select Type</option>
                    {MOVEMENT_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-1">Quantity * ({unitLabel})</label>
                  <input
                    name="quantity"
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={form.quantity}
                    onChange={handleChange}
                    onWheel={(e) => e.target.blur()}
                    className="w-full rounded-lg border border-orange-200 bg-orange-50/30 px-3 py-2 text-sm font-bold text-orange-700 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none"
                  />
                </div>

                {fetchingStock ? (
                  <div className="col-span-2 p-4 text-center border-2 border-dashed border-slate-100 rounded-xl">
                    <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Checking inventory...</p>
                  </div>
                ) : (
                  availableStock.length > 0 && isOutbound && (
                    <div className="col-span-2">
                      <QuickPickSuggestions
                        suggestions={availableStock}
                        onPick={handlePick}
                      />
                    </div>
                  )
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Batch / LPN</label>
                  <div className="flex flex-col gap-2">

                    {/* INBOUND movements: auto-generate, no choice needed */}
                    {['production', 'purchase', 'sale_return'].includes(form.movement_type) ? (
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-[11px] font-bold text-emerald-700">
                            New Batch + LPN will be auto-generated
                          </span>
                        </div>
                        <p className="text-[10px] text-emerald-600 mt-1 ml-6">
                          A unique batch code and LPN label will be created for this inbound movement.
                        </p>
                      </div>

                    /* OUTBOUND movements: must select existing batch */
                    ) : ['sale', 'usage', 'wastage', 'purchase_return'].includes(form.movement_type) ? (
                      <>
                        <select
                          name="batch"
                          value={form.batch}
                          onChange={handleChange}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none font-mono"
                        >
                          <option value="">Select Batch *</option>
                          {batches.map(b => (
                            <option key={b.id} value={b.id}>
                              {b.batch_code} ({parseFloat(b.current_stock).toLocaleString()} qty)
                            </option>
                          ))}
                        </select>
                        {!form.batch && (
                          <p className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            Select the batch you're drawing stock from
                          </p>
                        )}
                      </>

                    /* TRANSFER: select existing batch, LPN auto-generated at destination */
                    ) : ['transfer_out', 'transfer_in'].includes(form.movement_type) ? (
                      <>
                        <select
                          name="batch"
                          value={form.batch}
                          onChange={handleChange}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none font-mono"
                        >
                          <option value="">Select Batch *</option>
                          {batches.map(b => (
                            <option key={b.id} value={b.id}>
                              {b.batch_code} ({parseFloat(b.current_stock).toLocaleString()} qty)
                            </option>
                          ))}
                        </select>
                        <div className={`p-2.5 rounded-lg border ${form.movement_type === 'transfer_out' ? 'bg-violet-50 border-violet-200' : 'bg-indigo-50 border-indigo-200'}`}>
                          <p className={`text-[10px] font-bold flex items-center gap-1.5 ${form.movement_type === 'transfer_out' ? 'text-violet-600' : 'text-indigo-600'}`}>
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                            {form.movement_type === 'transfer_out' ? 'A new LPN will be auto-assigned at the destination' : 'A new LPN will be auto-assigned in this warehouse'}
                          </p>
                        </div>
                      </>

                    /* ADJUSTMENT: optional toggle for new batch */
                    ) : form.movement_type === 'adjustment' ? (
                      <>
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={form.auto_generate_batch}
                            onChange={e => setForm(f => ({ ...f, auto_generate_batch: e.target.checked, batch: '', auto_generate_lpn: e.target.checked }))}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-orange-500 focus:ring-orange-200"
                          />
                          <span className="text-[10px] font-semibold text-slate-500 group-hover:text-orange-600 transition-colors">
                            Create new Batch + LPN (positive adjustment)
                          </span>
                        </label>
                        {!form.auto_generate_batch && (
                          <select
                            name="batch"
                            value={form.batch}
                            onChange={handleChange}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none font-mono"
                          >
                            <option value="">Select Existing Batch</option>
                            {batches.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.batch_code} ({parseFloat(b.current_stock).toLocaleString()} qty)
                              </option>
                            ))}
                          </select>
                        )}
                      </>

                    /* No movement type selected yet */
                    ) : (
                      <p className="text-[10px] text-slate-400 italic py-2">Select a movement type first</p>
                    )}

                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Supplier {selectedBatchObj?.supplier && <span className="text-orange-500">(from batch)</span>}</label>
                  <select
                    name="supplier"
                    value={form.supplier}
                    onChange={handleChange}
                    disabled={!!selectedBatchObj?.supplier}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">Select Supplier (Optional)</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 leading-none">
                  {form.movement_type === 'transfer_in' ? 'Destination Location (To) *' : (isTransfer ? 'Source Location (From) *' : 'Location *')}
                </p>
                <CascadingLocationSelector
                  locations={locations}
                  value={form.location}
                  onChange={v => setForm(f => ({ ...f, location: v }))}
                  onQuickAdd={() => setLocModalOpen(true)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Reference</label>
                <input
                  name="reference"
                  placeholder="Invoice, Order..."
                  value={form.reference}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none"
                />
              </div>

              {isTransfer && (
                <div className={`${form.movement_type === 'transfer_out' ? 'bg-pink-50/30 border-pink-100' : 'bg-indigo-50/30 border-indigo-100'} p-4 rounded-xl border`}>
                  <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 leading-none ${form.movement_type === 'transfer_out' ? 'text-pink-500' : 'text-indigo-500'}`}>
                    {form.movement_type === 'transfer_out' ? 'Destination Location (To) *' : 'Source Location (From) *'}
                  </p>
                  <CascadingLocationSelector
                    locations={locations}
                    value={form.counterpart_location}
                    onChange={v => setForm(f => ({ ...f, counterpart_location: v }))}
                    onQuickAdd={() => setLocModalOpen(true)}
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  placeholder="Additional details..."
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-slate-50/30">
              <button
                onClick={closeModal}
                className="rounded-lg border border-gray-200 px-6 py-2 text-sm font-bold text-slate-500 hover:bg-white transition-all underline-offset-4"
              >Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-orange-500 px-8 py-2 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-50 active:scale-95 transition-all outline-none"
              >
                {submitting ? 'Saving...' : 'Record Movement'}
              </button>
            </div>
          </div>
        </div>
      )}

      <QuickAddLocationModal
        isOpen={locModalOpen}
        onClose={() => setLocModalOpen(false)}
        onAdd={addLocation}
        locations={locations}
      />
      {successLog && (
        <BatchSuccessModal
          log={successLog}
          onClose={() => {
            setSuccessLog(null)
            closeModal()
          }}
        />
      )}
    </div>
  )
}

export default ProductMovementPage
