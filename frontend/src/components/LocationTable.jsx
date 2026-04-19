import { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { QRCodeCanvas } from 'qrcode.react';
import { apiFetch } from '../utils/api'
import { jsPDF } from "jspdf";

const PAGE_SIZE = 10

const TYPE_CHOICES = ['warehouse', 'zone', 'block', 'aisle', 'rack', 'shelf']

const EMPTY_FORM = {
  name: '',
  short_code: '',
  type: '',
  parent: '',
  is_active: true,
}

const TYPE_COLORS = {
  warehouse: 'bg-blue-50 text-blue-600 border-blue-200',
  zone: 'bg-purple-50 text-purple-600 border-purple-200',
  block: 'bg-amber-50 text-amber-600 border-amber-200',
  aisle: 'bg-cyan-50 text-cyan-600 border-cyan-200',
  rack: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  shelf: 'bg-rose-50 text-rose-600 border-rose-200',
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
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className={`w-4 h-4 flex items-center justify-center text-gray-400 flex-shrink-0 ${!hasChildren ? 'invisible' : ''}`}
        >
          <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Type badge */}
        <span className={`px-2 py-0.5 rounded-md text-xs font-medium border capitalize flex-shrink-0 w-20 text-center ${TYPE_COLORS[node.type] || 'bg-gray-100 text-gray-500'}`}>
          {node.type}
        </span>

        {/* Name */}
        <span className="font-medium text-gray-800 flex-1">{node.name}</span>

        {/* Short code */}
        <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{node.short_code}</span>

        {/* Full code */}
        <span className="text-xs text-gray-300 hidden group-hover:block max-w-xs truncate">{node.full_code}</span>

        {/* Status */}
        {node.is_active ? (
          <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-600 text-xs font-medium border border-green-200 flex-shrink-0">Active</span>
        ) : (
          <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-400 text-xs font-medium border border-gray-200 flex-shrink-0">Inactive</span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onViewQR(node)}
            className="rounded-md bg-blue-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-600"
          >QR</button>
          <button
            onClick={() => onEdit(node)}
            className="rounded-md bg-green-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-600"
          >Edit</button>
          <button
            onClick={() => onDelete(node)}
            className="rounded-md bg-red-400 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500"
          >Delete</button>
        </div>
      </div>

      {/* Children */}
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
    if (l.parent) {
      map[l.parent]?.children.push(map[l.id])
    } else {
      roots.push(map[l.id])
    }
  })
  return roots
}

// ─── QR Modal Component ────────────────────────────────────────────────────────
const QRModal = ({ location, onClose }) => {
  const qrRef = useRef();

  const qrData = {
    type: 'location',
    code: location.code || location.short_code
  };

  const handleDownload = () => {
    const originalCanvas = qrRef.current?.querySelector('canvas');
    if (!originalCanvas) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Increased text space to 80px for two lines of text
    const textSpace = 80;
    canvas.width = originalCanvas.width;
    canvas.height = originalCanvas.height + textSpace;

    // Fill background white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw QR Code
    ctx.drawImage(originalCanvas, 0, 0);

    // Draw Text Labels
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';

    // Line 1: Location Name
    ctx.font = 'bold 20px Inter, system-ui, sans-serif';
    ctx.fillText(location.name, canvas.width / 2, originalCanvas.height + 30);

    // Line 2: Location Code
    ctx.font = '20px monospace'; // Monospace looks better for codes
    ctx.fillText(location.code || location.short_code, canvas.width / 2, originalCanvas.height + 55);

    // Trigger Download
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `Label-${location.short_code}.png`;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="font-semibold text-gray-800">Download Label</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-xl">×</button>
        </div>

        <div className="p-8 flex flex-col items-center text-center">
          <div ref={qrRef} className="p-2 border border-gray-100 rounded-lg">
            <QRCodeCanvas
              value={JSON.stringify(qrData)}
              size={200}
              level="H"
              includeMargin={false}
            />
          </div>

          {/* Visual labels for UI */}
          <div className="mt-4">
            <p className="text-md font-bold text-gray-800 leading-tight">
              {location.name}
            </p>
            <p className="text-s font-mono font-bold text-gray-500 leading-tight">
              {location.code || location.short_code}
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex gap-2">
          <button
            onClick={handleDownload}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700"
          >
            Download PNG
          </button>
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 py-2 rounded-lg font-medium hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LocationsTable() {
  const [locations, setLocations] = useState([])
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
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds([]); // Clear selection when exiting mode
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchLocations = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/master-data/locations/')
      if (res && res.ok) {
        const data = await res.json()
        setLocations(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch (err) {
      console.error('Failed to fetch locations:', err)
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
  const openAdd = () => {
    setEditLoc(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  const openEdit = (loc) => {
    setEditLoc(loc)
    setForm({
      name: loc.name,
      short_code: loc.short_code,
      type: loc.type,
      parent: loc.parent || '',
      is_active: loc.is_active,
    })
    setError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditLoc(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  const handleChange = e => {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.name.trim()) return setError('Name is required.')
    if (!form.short_code.trim()) return setError('Short code is required.')
    if (!form.type) return setError('Type is required.')

    setSubmitting(true)
    setError('')

    try {
      const endpoint = editLoc ? `/master-data/locations/${editLoc.id}/` : '/master-data/locations/'
      const method = editLoc ? 'PUT' : 'POST'

      const payload = {
        ...form,
        parent: form.parent || null,
      }

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      })

      if (!res) return;

      if (!res.ok) {
        const data = await res.json()
        const firstError = Object.values(data).flat()[0]
        return setError(firstError || 'Something went wrong.')
      }

      await fetchLocations()
      closeModal()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      const res = await apiFetch(`/master-data/locations/${deleteTarget.id}/`, {
        method: 'DELETE',
      })
      if (res && res.ok) {
        await fetchLocations()
        setDeleteTarget(null)
      }
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  // ── Parent options filtered by type hierarchy ─────────────────────────────
  const allowedParentTypes = {
    warehouse: [],
    zone: ['warehouse'],
    block: ['zone'],
    aisle: ['block'],
    rack: ['aisle', 'block'],
    shelf: ['rack'],
  }
  const parentOptions = locations.filter(l =>
    !form.type || (allowedParentTypes[form.type] || []).includes(l.type)
  )

  // ── Selection helpers ──────────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const allPageSelected = paginated.length > 0 && paginated.every(l => selectedIds.includes(l.id))

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds(prev => prev.filter(id => !paginated.some(l => l.id === id)))
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...paginated.map(l => l.id)])])
    }
  }

  const handleBulkPrint = async () => {
    const { jsPDF } = await import('jspdf');
    const QRCode = await import('qrcode');
    
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const selectedData = locations.filter(l => selectedIds.includes(l.id));

    // Grid Settings for A4 (210mm x 297mm)
    const cols = 2;
    const rows = 4;
    const pageWidth = 210;
    const pageHeight = 297;
    
    // Calculate label dimensions to fit exactly 2x4
    const marginX = 3;     
    const marginY = 3;     
    const spacingX = 3;    
    const spacingY = 3;
    
    const labelWidth = (pageWidth - (2 * marginX) - spacingX) / 2;  // ~98mm per label
    const labelHeight = (pageHeight - (2 * marginY) - (3 * spacingY)) / 4;  // ~70mm per label

    for (let i = 0; i < selectedData.length; i++) {
        const loc = selectedData[i];
        const pageItemIndex = i % (cols * rows);
        const col = pageItemIndex % cols;
        const row = Math.floor(pageItemIndex / cols);

        if (i > 0 && pageItemIndex === 0) pdf.addPage();

        await new Promise((resolve) => {
            // Make QR code square - use the smaller dimension
            const qrSizeInMM = labelWidth * 0.3;// Leave 20mm for text
            const qrSizeInPx = Math.floor(qrSizeInMM * 3.78); // Convert mm to pixels (96 DPI)
            const labelHeightInPx = 150; // Fixed pixel height for text area
            
            // Create canvas for QR code only
            const qrCanvas = document.createElement('canvas');
            qrCanvas.width = qrSizeInPx;
            qrCanvas.height = qrSizeInPx;

            const qrValue = JSON.stringify({ type: 'location', code: loc.code || loc.short_code });

            // Generate QR code
            QRCode.toCanvas(qrCanvas, qrValue, { 
                width: qrSizeInPx,
                height: qrSizeInPx,
                margin: 0.8, 
                errorCorrectionLevel: 'H' 
            }, (err) => {
                if (err) {
                    console.error(err);
                    resolve();
                    return;
                }

                // Create final canvas with QR + labels
                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = qrSizeInPx;
                finalCanvas.height = qrSizeInPx + labelHeightInPx;
                const ctx = finalCanvas.getContext('2d');

                // White background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

                // Draw the square QR code at top
                ctx.drawImage(qrCanvas, 0, 0, qrSizeInPx, qrSizeInPx);

                // Add text labels below
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';

                // Name
                ctx.font = 'bold 24px Arial';
                const displayName = loc.name.length > 20 ? loc.name.substring(0, 18) + '..' : loc.name;
                ctx.fillText(displayName, qrSizeInPx / 2, qrSizeInPx + 45);

                // Code
                ctx.font = '24px Monospace';
                ctx.fillText(loc.code || loc.short_code, qrSizeInPx / 2, qrSizeInPx + 90);

                // Add to PDF - maintain aspect ratio by using square dimension for both width and height of QR portion
                const xPos = marginX + (col * (labelWidth + spacingX));
                const yPos = marginY + (row * (labelHeight + spacingY));
                const imgData = finalCanvas.toDataURL('image/png');
                
                // Calculate the actual dimensions to maintain square QR code
                const qrDisplaySize = qrSizeInMM; // Square size in mm
                const totalDisplayHeight = qrSizeInMM + (labelHeightInPx / 3.78); // QR + text area
                
                // Center the label horizontally within the cell
                const xOffset = (labelWidth - qrDisplaySize) / 2;
                
                pdf.addImage(imgData, 'PNG', xPos + xOffset, yPos, qrDisplaySize, totalDisplayHeight);
                
                resolve();
            });
        });
    }

    pdf.save(`Warehouse_Labels_${new Date().getTime()}.pdf`);
    setIsSelectionMode(false);
    setSelectedIds([]);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="rounded-xl bg-white shadow-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Locations</h2>
          <div className="flex items-center gap-3">
            {/* Selection Mode Toggle */}
            {!isSelectionMode ? (
              <button
                onClick={toggleSelectionMode}
                className="flex items-center gap-1.5 rounded-lg bg-gray-100 text-gray-700 px-3 py-1.5 text-xs font-medium hover:bg-gray-200"
              >
                Print Mode
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkPrint}
                  disabled={selectedIds.length === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  Download PDF ({selectedIds.length})
                </button>
                <button onClick={toggleSelectionMode} className="text-xs text-red-500 hover:underline">Cancel</button>
              </div>
            )}

            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              <button
                onClick={() => setView('list')}
                className={`px-3 py-1.5 flex items-center gap-1.5 transition ${view === 'list' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                List
              </button>
              <button
                onClick={() => setView('tree')}
                className={`px-3 py-1.5 flex items-center gap-1.5 transition border-l border-gray-200 ${view === 'tree' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h4m0 0v10m0-10h10M7 12h6m0 0v5m0-5h4" />
                </svg>
                Tree
              </button>
            </div>

            {/* Add button */}
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Location
            </button>

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search location..."
                className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300 w-44"
              />
            </div>

            {/* Type filter — only in list view */}
            {view === 'list' && (
              <select
                value={typeFilter}
                onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
                className="rounded-lg border border-gray-300 text-xs px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300"
              >
                <option value="">All Types</option>
                {TYPE_CHOICES.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
        ) : view === 'tree' ? (

          // ── Tree View ──────────────────────────────────────────────────────
          <div className="divide-y divide-gray-50">
            {tree.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">No locations found</div>
            ) : tree.map(node => (
              <TreeNode
                key={node.id}
                node={node}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onViewQR={setQrTarget}
              />
            ))}
          </div>

        ) : (

          // ── List View ──────────────────────────────────────────────────────
          <table className="w-full text-sm text-left">
            <thead className="bg-primary text-white text-xs uppercase">
              <tr>
                {isSelectionMode && (
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />
                  </th>
                )}
                <th className="px-6 py-3 w-10">No</th>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Short Code</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Parent</th>
                <th className="px-6 py-3">Full Path</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map((loc, idx) => (
                <tr
                  key={loc.id}
                  className={`hover:bg-gray-50 transition-colors ${selectedIds.includes(loc.id) ? 'bg-indigo-50' : ''}`}
                >
                  {isSelectionMode && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(loc.id)}
                        onChange={() => toggleSelect(loc.id)}
                        className="rounded border-gray-300 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-6 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="px-6 py-3 font-medium text-gray-900">{loc.name}</td>
                  <td className="px-6 py-3">
                    <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{loc.short_code}</span>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border capitalize ${TYPE_COLORS[loc.type] || 'bg-gray-100 text-gray-500'}`}>
                      {loc.type}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-500 text-xs">{loc.parent_name || '—'}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs max-w-xs truncate">{loc.full_path || '—'}</td>
                  <td className="px-6 py-3 text-center">
                    {loc.is_active ? (
                      <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-600 text-xs font-medium border border-green-200">Active</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-400 text-xs font-medium border border-gray-200">Inactive</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setQrTarget(loc)}
                        className="rounded-md bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600"
                      >QR</button>
                      <button
                        onClick={() => openEdit(loc)}
                        className="rounded-md bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-600"
                      >Edit</button>
                      <button
                        onClick={() => setDeleteTarget(loc)}
                        className="rounded-md bg-red-400 px-3 py-1 text-xs font-medium text-white hover:bg-red-500"
                      >Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination — list view only */}
        {view === 'list' && (
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
                  className={`w-7 h-7 rounded text-xs font-medium ${page === p ? 'bg-purple-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                >{p}</button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
              >›</button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                {editLoc ? 'Edit Location' : 'Add New Location'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Main Warehouse"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Short Code *</label>
                  <input
                    name="short_code"
                    value={form.short_code}
                    onChange={handleChange}
                    placeholder="e.g. WH1"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
                  <select
                    name="type"
                    value={form.type}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                  >
                    <option value="">— Select Type —</option>
                    {TYPE_CHOICES.map(t => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Parent Location</label>
                <select
                  name="parent"
                  value={form.parent}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                >
                  <option value="">— No Parent (Top Level) —</option>
                  {parentOptions.map(l => (
                    <option key={l.id} value={l.id}>
                      [{l.short_code}] {l.name} ({l.type})
                    </option>
                  ))}
                </select>
                {form.type && allowedParentTypes[form.type]?.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    A <strong>{form.type}</strong> must be inside a {allowedParentTypes[form.type].join(' or ')}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="is_active"
                  id="is_active"
                  checked={form.is_active}
                  onChange={handleChange}
                  className="rounded border-gray-300 text-purple-500 focus:ring-purple-300"
                />
                <label htmlFor="is_active" className="text-sm text-gray-600">Active</label>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editLoc ? 'Update Location' : 'Create Location'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {qrTarget && <QRModal location={qrTarget} onClose={() => setQrTarget(null)} />}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Location</h3>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This may also affect child locations.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >Cancel</button>
              <button
                onClick={handleDelete}
                className="rounded-lg bg-red-500 px-5 py-2 text-sm font-semibold text-white hover:bg-red-600"
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}