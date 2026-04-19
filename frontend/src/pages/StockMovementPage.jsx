import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch } from '../utils/api'

const PAGE_SIZE = 10

const MOVEMENT_TYPES = [
  { value: 'purchase', label: 'Purchase / Receipt', color: 'bg-green-50 text-green-700' },
  { value: 'return', label: 'Return', color: 'bg-blue-50 text-blue-700' },
  { value: 'transfer_in', label: 'Transfer In', color: 'bg-violet-50 text-violet-700' },
  { value: 'usage', label: 'Usage', color: 'bg-yellow-50 text-yellow-700' },
  { value: 'wastage', label: 'Wastage', color: 'bg-red-50 text-red-700' },
  { value: 'transfer_out', label: 'Transfer Out', color: 'bg-pink-50 text-pink-700' },
  { value: 'adjustment', label: 'Adjustment', color: 'bg-slate-100 text-slate-600' },
]

const MOVEMENT_MAP = Object.fromEntries(MOVEMENT_TYPES.map(m => [m.value, m]))

const emptyForm = {
  material: '',
  location: '',
  movement_type: '',
  quantity: '',
  counterpart_location: '',
  reference: '',
  notes: '',
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

  // Root level (Warehouses)
  levels.push({
    label: 'Warehouse',
    options: locations.filter(l => !l.parent),
    selected: path[0]?.id || ''
  })

  // Subsequent levels based on current path
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
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            {level.label} {i === 0 && '*'}
          </label>
          <div className="flex gap-2">
            <select
              value={level.selected}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none bg-white font-medium"
            >
              <option value="">Select {level.label.toLowerCase()}...</option>
              {level.options.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
              ))}
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

const StockMovementPage = () => {
  const [logs, setLogs] = useState([])
  const [materials, setMaterials] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [locModalOpen, setLocModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [filters, setFilters] = useState({ movement_type: '', location: '', material: '' })
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const mat = params.get('material')
    const loc = params.get('location')
    if (mat || loc) {
      setFilters(f => ({
        ...f,
        ...(mat ? { material: mat } : {}),
        ...(loc ? { location: loc } : {}),
      }))
    }
  }, [])

  useEffect(() => {
    fetchLogs()
    fetchMaterials()
    fetchLocations()
  }, [])

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
      const res = await apiFetch('/raw-materials-stock/stock-movements/')
      if (res && res.ok) {
        const data = await res.json()
        setLogs(Array.isArray(data) ? data : (data.results ?? []))
      } else {
        setLogs([])
      }
    } catch {
      setLogs([])
      setError('Failed to load movement log')
    } finally {
      setLoading(false)
    }
  }

  const fetchMaterials = async () => {
    try {
      const res = await apiFetch('/master-data/raw-materials-and-consumables/')
      if (res && res.ok) {
        const data = await res.json()
        setMaterials(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch { console.error('Failed to load materials') }
  }

  const fetchLocations = async () => {
    try {
      const res = await apiFetch('/master-data/locations/')
      if (res && res.ok) {
        const data = await res.json()
        setLocations(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch { console.error('Failed to load locations') }
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

  const filtered = logs.filter(log => {
    const matchesSearch =
      log.material_name?.toLowerCase().includes(search.toLowerCase()) ||
      log.reference?.toLowerCase().includes(search.toLowerCase()) ||
      log.location_name?.toLowerCase().includes(search.toLowerCase())
    const matchesType = !filters.movement_type || log.movement_type === filters.movement_type
    const matchesLocation = !filters.location || String(log.location) === filters.location
    const matchesMaterial = !filters.material || String(log.material) === filters.material
    return matchesSearch && matchesType && matchesLocation && matchesMaterial
  })

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const isTransfer = form.movement_type === 'transfer_out'

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

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const selectedMaterial = materials.find(m => String(m.id) === String(form.material))
  const unitLabel = selectedMaterial?.unit_name || selectedMaterial?.unit || ''

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    if (!form.material) { setError('Material is required.'); setSubmitting(false); return }
    if (!form.location) { setError('Location is required.'); setSubmitting(false); return }
    if (!form.movement_type) { setError('Movement type is required.'); setSubmitting(false); return }
    if (!form.quantity || parseFloat(form.quantity) <= 0) {
      setError('Quantity must be greater than 0.')
      setSubmitting(false)
      return
    }
    if (isTransfer && !form.counterpart_location) {
      setError('Destination location is required for transfers.')
      setSubmitting(false)
      return
    }
    if (isTransfer && form.location === form.counterpart_location) {
      setError('Source and destination location cannot be the same.')
      setSubmitting(false)
      return
    }

    const payload = {
      material:      parseInt(form.material),
      location:      parseInt(form.location),
      movement_type: form.movement_type,
      quantity:      parseFloat(form.quantity),
    }
    if (form.counterpart_location) payload.counterpart_location = parseInt(form.counterpart_location)
    if (form.reference)            payload.reference            = form.reference.trim()
    if (form.notes)                payload.notes                = form.notes.trim()

    try {
      const res = await apiFetch('/raw-materials-stock/stock-movements/record/', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!res) return
      const data = await res.json()
      if (res.ok) {
        fetchLogs()
        closeModal()
      } else {
        const firstError = Object.values(data).flat()[0]
        setError(firstError || 'Something went wrong.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="ml-16">
        <Topbar />
        <main className="p-6">

          <p className="text-xs text-gray-400 mb-3">Raw Materials / Stock Movements</p>

          <div className="rounded-xl bg-white shadow-sm">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Stock Movement Log</h2>
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

                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                    placeholder="Search material, ref..."
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
                            onClick={() => { setFilters({ movement_type: '', location: '', material: '' }); setPage(1) }}
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
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Material</label>
                        <select
                          value={filters.material}
                          onChange={e => { setFilters(f => ({ ...f, material: e.target.value })); setPage(1) }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        >
                          <option value="">All</option>
                          {materials.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
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
                    <th className="px-6 py-3">Material</th>
                    <th className="px-6 py-3">Movement</th>
                    <th className="px-6 py-3">Quantity</th>
                    <th className="px-6 py-3">Location</th>
                    <th className="px-6 py-3">Transfer To/From</th>
                    <th className="px-6 py-3">Balance After</th>
                    <th className="px-6 py-3">Reference</th>
                    <th className="px-6 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-10 text-center text-gray-400">No movement records found</td>
                    </tr>
                  ) : paginated.map((log, idx) => {
                    const mType = MOVEMENT_MAP[log.movement_type]
                    const isOutbound = ['usage', 'wastage', 'transfer_out'].includes(log.movement_type)
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="px-6 py-3 font-medium text-gray-900">{log.material_name}</td>
                        <td className="px-6 py-3">
                          <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${mType?.color ?? 'bg-gray-100 text-gray-600'}`}>
                            {mType?.label ?? log.movement_type}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <span className={`font-semibold text-sm ${isOutbound ? 'text-red-500' : 'text-green-600'}`}>
                            {isOutbound ? '−' : '+'}{parseFloat(log.quantity).toLocaleString()}
                            <span className="ml-1 text-xs font-normal text-gray-400">{log.unit}</span>
                          </span>
                        </td>
                        <td className="px-6 py-3 text-gray-500">{log.location_name}</td>
                        <td className="px-6 py-3 text-gray-400 text-xs">
                          {log.counterpart_location_name || '—'}
                        </td>
                        <td className="px-6 py-3 text-gray-700 font-medium">
                          {parseFloat(log.balance_after).toLocaleString()}
                          <span className="ml-1 text-xs font-normal text-gray-400">{log.unit}</span>
                        </td>
                        <td className="px-6 py-3 text-gray-400 text-xs max-w-[120px] truncate">
                          {log.reference || '—'}
                        </td>
                        <td className="px-6 py-3 text-gray-400 text-xs">
                          {log.created_at ? new Date(log.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded text-xs font-medium ${page === p ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                  >{p}</button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">›</button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Record Stock Movement</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {error && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-6 pb-6 border-b border-slate-50">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Material *</label>
                  <select
                    name="material"
                    value={form.material}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none"
                  >
                    <option value="">Select material</option>
                    {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
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
                    <option value="">Select type</option>
                    {MOVEMENT_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <CascadingLocationSelector
                  locations={locations}
                  value={form.location}
                  onChange={(val) => setForm(f => ({ ...f, location: val }))}
                  onQuickAdd={() => setLocModalOpen(true)}
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Quantity *</label>
                  <div className="relative">
                    <input
                      name="quantity"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.quantity}
                      onChange={handleChange}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-gray-200 pl-3 pr-12 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none"
                    />
                    {unitLabel && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-gray-200 uppercase tracking-tighter">
                        {unitLabel}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Reference</label>
                  <input
                    name="reference"
                    value={form.reference}
                    onChange={handleChange}
                    placeholder="PO number, order ID..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none"
                  />
                </div>
              </div>

              {isTransfer && (
                <div className="bg-pink-50/30 p-4 rounded-xl border border-pink-100">
                  <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.2em] mb-3">To Location (Destination)</p>
                  <CascadingLocationSelector
                    locations={locations}
                    value={form.counterpart_location}
                    onChange={(val) => setForm(f => ({ ...f, counterpart_location: val }))}
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
                  placeholder="Any additional details..."
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all outline-none resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-slate-50/30">
              <button
                onClick={closeModal}
                className="rounded-lg border border-gray-200 px-6 py-2 text-sm font-bold text-slate-500 hover:bg-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-orange-500 px-8 py-2 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-50 active:scale-95 transition-all"
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
    </div>
  )
}

export default StockMovementPage
