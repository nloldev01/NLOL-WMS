import { useState, useEffect, useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react';
import { apiFetch } from '../utils/api'

const PAGE_SIZE = 10

const TYPE_CHOICES = ['warehouse', 'building', 'factory', 'zone', 'block', 'aisle', 'rack', 'shelf', 'tank', 'kettle', 'assembly']

const EMPTY_FORM = {
  name: '',
  short_code: '',
  type: '',
  parent: '',
  is_active: true,
  is_production_area: false,
  linked_asset: '',
}

const TYPE_COLORS = {
  warehouse: 'bg-blue-50 text-blue-600 border-blue-200',
  building: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  factory: 'bg-red-50 text-red-600 border-red-200',
  zone: 'bg-purple-50 text-purple-600 border-purple-200',
  block: 'bg-amber-50 text-amber-600 border-amber-200',
  aisle: 'bg-cyan-50 text-cyan-600 border-cyan-200',
  rack: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  shelf: 'bg-rose-50 text-rose-600 border-rose-200',
  tank: 'bg-orange-50 text-orange-600 border-orange-200',
  kettle: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  assembly: 'bg-teal-50 text-teal-600 border-teal-200',
}

// ─── Tree Node ────────────────────────────────────────────────────────────────
const TreeNode = ({ node, depth = 0, onEdit, onDelete, onViewQR }) => {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children?.length > 0

  return (
    <div>
      <div
        className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors group"
        style={{ paddingLeft: `${depth * 24 + 16}px` }}
      >
        <button
          onClick={() => setExpanded(e => !e)}
          className={`w-4 h-4 flex items-center justify-center text-gray-400 flex-shrink-0 ${!hasChildren ? 'invisible' : ''}`}
        >
          <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <span className={`px-2 py-0.5 rounded-md text-xs font-medium border capitalize flex-shrink-0 w-20 text-center ${TYPE_COLORS[node.type] || 'bg-gray-100 text-gray-500'}`}>
          {node.type}
        </span>

        <span className="font-medium text-gray-800 flex-1 min-w-0 truncate">
          {node.name}
          {node.is_production_area && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 uppercase">Factory</span>
          )}
        </span>

        <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded flex-shrink-0">{node.short_code}</span>

        {node.linked_asset_name && (
          <span className="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-md flex-shrink-0 hidden sm:inline">
            🔗 {node.linked_asset_name}
          </span>
        )}

        {node.is_active ? (
          <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-600 text-xs font-medium border border-green-200 flex-shrink-0">Active</span>
        ) : (
          <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-400 text-xs font-medium border border-gray-200 flex-shrink-0">Inactive</span>
        )}

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={() => onViewQR(node)} className="rounded-md bg-blue-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-600">QR</button>
          <button onClick={() => onEdit(node)} className="rounded-md bg-green-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-600">Edit</button>
          <button onClick={() => onDelete(node)} className="rounded-md bg-red-400 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500">Delete</button>
        </div>
      </div>

      {expanded && hasChildren && node.children.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} onViewQR={onViewQR} />
      ))}
    </div>
  )
}

// ─── Build Tree ───────────────────────────────────────────────────────────────
const buildTree = (locations) => {
  const map = {}
  locations.forEach(l => { map[l.id] = { ...l, children: [] } })
  const roots = []
  locations.forEach(l => {
    if (l.parent) map[l.parent]?.children.push(map[l.id])
    else roots.push(map[l.id])
  })
  return roots
}

// ─── QR Modal ────────────────────────────────────────────────────────────────
const QRModal = ({ location, onClose }) => {
  const qrRef = useRef()
  const qrData = { type: 'location', code: location.code || location.short_code }

  const handleDownload = () => {
    const originalCanvas = qrRef.current?.querySelector('canvas')
    if (!originalCanvas) return
    const padding = 24
    const nameFont = 'bold 20px Inter, system-ui, sans-serif'
    const codeFont = '20px monospace'

    // Measure text on a scratch context first — resizing the real canvas resets its font/state
    const measureCtx = document.createElement('canvas').getContext('2d')
    measureCtx.font = nameFont
    const nameWidth = measureCtx.measureText(location.name).width
    measureCtx.font = codeFont
    const codeWidth = measureCtx.measureText(location.code || location.short_code).width

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const textSpace = 80
    canvas.width = Math.ceil(Math.max(originalCanvas.width, nameWidth + padding, codeWidth + padding))
    canvas.height = originalCanvas.height + textSpace
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(originalCanvas, (canvas.width - originalCanvas.width) / 2, 0)
    ctx.fillStyle = '#000000'
    ctx.textAlign = 'center'
    ctx.font = nameFont
    ctx.fillText(location.name, canvas.width / 2, originalCanvas.height + 30)
    ctx.font = codeFont
    ctx.fillText(location.code || location.short_code, canvas.width / 2, originalCanvas.height + 55)
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `Label-${location.short_code}.png`
    link.click()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="font-semibold text-gray-800">Download Label</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-xl">×</button>
        </div>
        <div className="p-8 flex flex-col items-center text-center">
          <div ref={qrRef} className="p-2 border border-gray-100 rounded-lg">
            <QRCodeCanvas value={JSON.stringify(qrData)} size={200} level="H" includeMargin={false} />
          </div>
          <div className="mt-4">
            <p className="text-md font-bold text-gray-800 leading-tight">{location.name}</p>
            <p className="text-s font-mono font-bold text-gray-500 leading-tight">{location.code || location.short_code}</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-2">
          <button onClick={handleDownload} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700">Download PNG</button>
          <button onClick={onClose} className="flex-1 border border-gray-300 py-2 rounded-lg font-medium hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LocationsTable() {
  const [locations, setLocations] = useState([])
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [view, setView] = useState('list')

  const [modalOpen, setModalOpen] = useState(false)
  const [editLoc, setEditLoc] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [qrTarget, setQrTarget] = useState(null)

  const [selectedIds, setSelectedIds] = useState([])
  const [isSelectionMode, setIsSelectionMode] = useState(false)

  const toggleSelectionMode = () => {
    setIsSelectionMode(s => !s)
    setSelectedIds([])
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchLocations = async () => {
    setLoading(true)
    try {
      const [locRes, assetRes] = await Promise.all([
        apiFetch('/master-data/locations/'),
        apiFetch('/master-data/assets/'),
      ])
      if (locRes?.ok) {
        const data = await locRes.json()
        setLocations(Array.isArray(data) ? data : (data.results ?? []))
      }
      if (assetRes?.ok) {
        const data = await assetRes.json()
        setAssets(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch (err) {
      console.error('Failed to fetch data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLocations() }, [])

  // ── Filter + Paginate ─────────────────────────────────────────────────────
  const filtered = locations.filter(l => {
    const matchSearch = !search ||
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.short_code.toLowerCase().includes(search.toLowerCase())
    const matchType = !typeFilter || l.type === typeFilter
    return matchSearch && matchType
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const tree = buildTree(locations)

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const openAdd = () => { setEditLoc(null); setForm(EMPTY_FORM); setError(''); setModalOpen(true) }
  const openEdit = (loc) => {
    setEditLoc(loc)
    setForm({
      name: loc.name, short_code: loc.short_code, type: loc.type,
      parent: loc.parent || '', is_active: loc.is_active,
      is_production_area: loc.is_production_area || false, linked_asset: loc.linked_asset || '',
    })
    setError('')
    setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditLoc(null); setForm(EMPTY_FORM); setError('') }
  const handleChange = e => {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.name.trim()) return setError('Name is required.')
    if (!form.short_code.trim()) return setError('Short code is required.')
    if (!form.type) return setError('Type is required.')
    setSubmitting(true); setError('')
    try {
      const endpoint = editLoc ? `/master-data/locations/${editLoc.id}/` : '/master-data/locations/'
      const res = await apiFetch(endpoint, {
        method: editLoc ? 'PUT' : 'POST',
        body: JSON.stringify({ ...form, parent: form.parent || null }),
      })
      if (!res) return
      if (!res.ok) {
        const data = await res.json()
        return setError(Object.values(data).flat()[0] || 'Something went wrong.')
      }
      await fetchLocations(); closeModal()
    } catch { setError('Network error. Please try again.') }
    finally { setSubmitting(false) }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      const res = await apiFetch(`/master-data/locations/${deleteTarget.id}/`, { method: 'DELETE' })
      if (res?.ok) { await fetchLocations(); setDeleteTarget(null) }
    } catch (err) { console.error('Delete failed:', err) }
  }

  // ── Parent options ─────────────────────────────────────────────────────────
  const allowedParentTypes = {
    warehouse: [], building: ['warehouse'], factory: ['warehouse', 'building'],
    zone: ['warehouse', 'building', 'factory'], block: ['zone'], aisle: ['block'],
    rack: ['aisle', 'block'], shelf: ['rack'],
    tank: ['factory', 'building', 'zone'], kettle: ['factory', 'building', 'zone'],
    assembly: ['factory', 'building', 'zone'],
  }
  const parentOptions = locations.filter(l =>
    !form.type || (allowedParentTypes[form.type] || []).includes(l.type)
  )

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleSelect = (id) => setSelectedIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  )
  const allPageSelected = paginated.length > 0 && paginated.every(l => selectedIds.includes(l.id))
  const toggleSelectAll = () => {
    if (allPageSelected) setSelectedIds(prev => prev.filter(id => !paginated.some(l => l.id === id)))
    else setSelectedIds(prev => [...new Set([...prev, ...paginated.map(l => l.id)])])
  }

  const handleBulkPrint = async () => {
    const { jsPDF } = await import('jspdf')
    const QRCode = await import('qrcode')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const selectedData = locations.filter(l => selectedIds.includes(l.id))
    const cols = 2, rows = 4
    const marginX = 3, marginY = 3, spacingX = 3, spacingY = 3
    const labelWidth = (210 - (2 * marginX) - spacingX) / 2
    const labelHeight = (297 - (2 * marginY) - (3 * spacingY)) / 4

    for (let i = 0; i < selectedData.length; i++) {
      const loc = selectedData[i]
      const pageItemIndex = i % (cols * rows)
      const col = pageItemIndex % cols
      const row = Math.floor(pageItemIndex / cols)
      if (i > 0 && pageItemIndex === 0) pdf.addPage()

      await new Promise((resolve) => {
        const qrSizeInMM = labelWidth * 0.3
        const qrSizeInPx = Math.floor(qrSizeInMM * 3.78)
        const labelWidthPx = Math.floor(labelWidth * 3.78)
        const labelHeightInPx = 150
        const qrCanvas = document.createElement('canvas')
        qrCanvas.width = qrSizeInPx; qrCanvas.height = qrSizeInPx
        const qrValue = JSON.stringify({ type: 'location', code: loc.code || loc.short_code })

        QRCode.toCanvas(qrCanvas, qrValue, { width: qrSizeInPx, height: qrSizeInPx, margin: 0.8, errorCorrectionLevel: 'H' }, (err) => {
          if (err) { resolve(); return }
          const finalCanvas = document.createElement('canvas')
          finalCanvas.width = labelWidthPx; finalCanvas.height = qrSizeInPx + labelHeightInPx
          const ctx = finalCanvas.getContext('2d')
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)
          ctx.drawImage(qrCanvas, (labelWidthPx - qrSizeInPx) / 2, 0, qrSizeInPx, qrSizeInPx)
          ctx.fillStyle = '#000000'; ctx.textAlign = 'center'
          ctx.font = 'bold 24px Arial'
          const displayName = loc.name.length > 20 ? loc.name.substring(0, 18) + '..' : loc.name
          ctx.fillText(displayName, labelWidthPx / 2, qrSizeInPx + 45)
          ctx.font = '24px Monospace'
          ctx.fillText(loc.code || loc.short_code, labelWidthPx / 2, qrSizeInPx + 90)
          const xPos = marginX + (col * (labelWidth + spacingX))
          const yPos = marginY + (row * (labelHeight + spacingY))
          const totalDisplayHeight = (qrSizeInPx + labelHeightInPx) / 3.78
          pdf.addImage(finalCanvas.toDataURL('image/png'), 'PNG', xPos, yPos, labelWidth, totalDisplayHeight)
          resolve()
        })
      })
    }
    pdf.save(`Warehouse_Labels_${new Date().getTime()}.pdf`)
    setIsSelectionMode(false); setSelectedIds([])
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="rounded-xl bg-white shadow-sm overflow-hidden">

        {/* Header — two rows to prevent overflow */}
        <div className="px-6 py-3 border-b border-gray-100">
          {/* Row 1: title + action buttons */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900">Locations</h2>
            <div className="flex items-center gap-2 flex-wrap">

              {/* Selection / Print mode */}
              {!isSelectionMode ? (
                <button onClick={toggleSelectionMode} className="rounded-lg bg-gray-100 text-gray-700 px-3 py-1.5 text-xs font-medium hover:bg-gray-200">
                  Print Mode
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={handleBulkPrint} disabled={selectedIds.length === 0}
                    className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">
                    Download PDF ({selectedIds.length})
                  </button>
                  <button onClick={toggleSelectionMode} className="text-xs text-red-500 hover:underline">Cancel</button>
                </div>
              )}

              {/* View toggle */}
              <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                <button onClick={() => setView('list')}
                  className={`px-3 py-1.5 flex items-center gap-1.5 transition ${view === 'list' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  List
                </button>
                <button onClick={() => setView('tree')}
                  className={`px-3 py-1.5 flex items-center gap-1.5 transition border-l border-gray-200 ${view === 'tree' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h4m0 0v10m0-10h10M7 12h6m0 0v5m0-5h4" />
                  </svg>
                  Tree
                </button>
              </div>

              <button onClick={openAdd} className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Location
              </button>
            </div>
          </div>

          {/* Row 2: search + filter */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search location..."
                className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300 w-48" />
            </div>
            {view === 'list' && (
              <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
                className="rounded-lg border border-gray-300 text-xs px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300">
                <option value="">All Types</option>
                {TYPE_CHOICES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
        ) : view === 'tree' ? (
          <div className="divide-y divide-gray-50 overflow-x-auto">
            {tree.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">No locations found</div>
            ) : tree.map(node => (
              <TreeNode key={node.id} node={node} onEdit={openEdit} onDelete={setDeleteTarget} onViewQR={setQrTarget} />
            ))}
          </div>
        ) : (
          /* ── List View: scrollable wrapper ── */
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left" style={{ minWidth: '800px' }}>
              <thead className="bg-primary text-white text-xs uppercase">
                <tr>
                  {isSelectionMode && (
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />
                    </th>
                  )}
                  <th className="px-4 py-3 w-10">#</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Parent</th>
                  <th className="px-4 py-3">Full Path</th>
                  <th className="px-4 py-3">Linked Asset</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map((loc, idx) => (
                  <tr key={loc.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.includes(loc.id) ? 'bg-indigo-50' : ''}`}>
                    {isSelectionMode && (
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedIds.includes(loc.id)} onChange={() => toggleSelect(loc.id)} className="rounded border-gray-300 cursor-pointer" />
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px] truncate">
                      {loc.name}
                      {loc.is_production_area && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 uppercase">Factory</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{loc.short_code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-medium border capitalize ${TYPE_COLORS[loc.type] || 'bg-gray-100 text-gray-500'}`}>
                        {loc.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[120px] truncate">{loc.parent_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[160px] truncate" title={loc.full_path}>{loc.full_path || '—'}</td>
                    <td className="px-4 py-3">
                      {loc.linked_asset_name ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-orange-600 truncate max-w-[120px]">{loc.linked_asset_name}</span>
                          <span className="text-[10px] text-gray-400">{loc.linked_asset_type}</span>
                        </div>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {loc.is_active ? (
                        <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-600 text-xs font-medium border border-green-200">Active</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-400 text-xs font-medium border border-gray-200">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setQrTarget(loc)} className="rounded-md bg-blue-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-600">QR</button>
                        <button onClick={() => openEdit(loc)} className="rounded-md bg-green-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-600">Edit</button>
                        <button onClick={() => setDeleteTarget(loc)} className="rounded-md bg-red-400 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500">Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {view === 'list' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-wrap gap-2">
            <p className="text-xs text-gray-400">
              Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-7 h-7 rounded text-xs font-medium ${page === p ? 'bg-purple-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{p}</button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">›</button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">{editLoc ? 'Edit Location' : 'Add New Location'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {error && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input name="name" value={form.name} onChange={handleChange} placeholder="e.g. Main Warehouse"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Short Code *</label>
                  <input name="short_code" value={form.short_code} onChange={handleChange} placeholder="e.g. WH1"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
                  <select name="type" value={form.type} onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
                    <option value="">— Select Type —</option>
                    {TYPE_CHOICES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Parent Location</label>
                <select name="parent" value={form.parent} onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
                  <option value="">— No Parent (Top Level) —</option>
                  {parentOptions.map(l => <option key={l.id} value={l.id}>[{l.short_code}] {l.name} ({l.type})</option>)}
                </select>
                {form.type && allowedParentTypes[form.type]?.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">A <strong>{form.type}</strong> must be inside a {allowedParentTypes[form.type].join(' or ')}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Linked Asset</label>
                <select name="linked_asset" value={form.linked_asset} onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
                  <option value="">— No Linked Asset —</option>
                  {assets.map(a => <option key={a.id} value={a.id}>{a.name} ({a.asset_type}){a.capacity ? ` — ${a.capacity} ${a.capacity_unit_symbol || ''}` : ''}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Link a physical asset (e.g. tank, kettle) to this location.</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input type="checkbox" name="is_active" id="is_active" checked={form.is_active} onChange={handleChange}
                    className="rounded border-gray-300 text-purple-500 focus:ring-purple-300" />
                  <label htmlFor="is_active" className="text-sm text-gray-600">Active</label>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" name="is_production_area" id="is_production_area" checked={form.is_production_area} onChange={handleChange}
                    className="rounded border-gray-300 text-red-500 focus:ring-red-300" />
                  <label htmlFor="is_production_area" className="text-sm text-gray-600">Production / Factory Area</label>
                </div>
              </div>
              {form.is_production_area && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  This location will be treated as a factory production area.
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={closeModal} className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting}
                className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {submitting ? 'Saving...' : editLoc ? 'Update Location' : 'Create Location'}
              </button>
            </div>
          </div>
        </div>
      )}

      {qrTarget && <QRModal location={qrTarget} onClose={() => setQrTarget(null)} />}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Location</h3>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This may also affect child locations.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} className="rounded-lg bg-red-500 px-5 py-2 text-sm font-semibold text-white hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}