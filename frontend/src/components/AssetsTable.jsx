import React, { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api'

const PAGE_SIZE = 8
const STATUS_CHOICES = ['active', 'inactive', 'maintenance']

const EMPTY_FORM = {
  name: '',
  asset_type: '',
  capacity: '',
  capacity_unit: '',
  status: 'active',
  location: '',
  serial_number: '',
  purchase_date: '',
  purchase_cost: '',
  description: '',
  parameters: [],
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  active: 'bg-green-50 text-green-600 border border-green-200',
  inactive: 'bg-gray-100 text-gray-400 border border-gray-200',
  maintenance: 'bg-amber-50 text-amber-600 border border-amber-200',
}

const StatusBadge = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-md text-xs font-medium capitalize ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-500'}`}>
    {status}
  </span>
)

// ─── Asset Form ───────────────────────────────────────────────────────────────
const AssetForm = ({ initial, units, locations, onSubmit, onClose, loading }) => {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [params, setParams] = useState(initial?.parameters || [])
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addParam = () => setParams(p => [...p, { key: '', value: '', unit: '' }])
  const removeParam = (i) => setParams(p => p.filter((_, idx) => idx !== i))
  const setParam = (i, k, v) => setParams(p => p.map((item, idx) => idx === i ? { ...item, [k]: v } : item))

  const handleSubmit = () => {
    if (!form.name.trim()) return setError('Asset name is required.')
    if (!form.asset_type.trim()) return setError('Asset type is required.')
    setError('')
    onSubmit({
      ...form,
      capacity: form.capacity || null,
      capacity_unit: form.capacity_unit || null,
      location: form.location || null,
      purchase_cost: form.purchase_cost || null,
      purchase_date: form.purchase_date || null,
      parameters: params.map(p => ({
        key: p.key,
        value: p.value,
        unit: p.unit || null,
      })),
    })
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="px-6 py-5 space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
      )}

      {/* Row 1 */}
      <div>
        <label className={labelCls}>Asset Name *</label>
        <input
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="e.g. Water Pump"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Asset Type *</label>
          <input
            value={form.asset_type}
            onChange={e => set('asset_type', e.target.value)}
            placeholder="e.g. Equipment"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Serial Number</label>
          <input
            value={form.serial_number}
            onChange={e => set('serial_number', e.target.value)}
            placeholder="e.g. SN-00123"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Status</label>
          <select
            value={form.status}
            onChange={e => set('status', e.target.value)}
            className={inputCls}
          >
            {STATUS_CHOICES.map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Location</label>
          <select
            value={form.location}
            onChange={e => set('location', e.target.value)}
            className={inputCls}
          >
            <option value="">— Select Location —</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.full_path || l.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Capacity</label>
          <input
            type="number"
            value={form.capacity}
            onChange={e => set('capacity', e.target.value)}
            placeholder="500"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Capacity Unit</label>
          <select
            value={form.capacity_unit}
            onChange={e => set('capacity_unit', e.target.value)}
            className={inputCls}
          >
            <option value="">— Select Unit —</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Purchase Date</label>
          <input
            type="date"
            value={form.purchase_date}
            onChange={e => set('purchase_date', e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Purchase Cost</label>
          <input
            type="number"
            value={form.purchase_cost}
            onChange={e => set('purchase_cost', e.target.value)}
            placeholder="0.00"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea
          value={form.description}
          onChange={e => set('description', e.target.value)}
          rows={2}
          placeholder="Optional notes..."
          className={inputCls}
        />
      </div>

      {/* Parameters */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={labelCls}>Parameters</label>
          <button
            onClick={addParam}
            className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Parameter
          </button>
        </div>
        {params.length === 0 && (
          <p className="text-xs text-gray-400 mb-1">No parameters added yet.</p>
        )}
        {params.map((p, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              value={p.key}
              onChange={e => setParam(i, 'key', e.target.value)}
              placeholder="Key"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
            <input
              value={p.value}
              onChange={e => setParam(i, 'value', e.target.value)}
              placeholder="Value"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
            <select
              value={p.unit}
              onChange={e => setParam(i, 'unit', e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">Unit</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.symbol}</option>)}
            </select>
            <button
              onClick={() => removeParam(i)}
              className="px-2 text-red-400 hover:text-red-600 text-lg leading-none"
            >×</button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-0 py-4 border-t border-gray-100 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {loading ? 'Saving...' : (initial?.id ? 'Update Asset' : 'Create Asset')}
        </button>
      </div>
    </div>
  )
}

// ─── Asset Detail View ────────────────────────────────────────────────────────
const AssetDetail = ({ asset }) => {
  const row = (label, value) => value ? (
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm text-gray-700 font-medium">{value}</span>
    </div>
  ) : null

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="bg-gray-50 rounded-xl p-4 space-y-1">
        {row('Name', asset.name)}
        {row('Type', asset.asset_type)}
        {row('Serial Number', asset.serial_number)}
        {row('Status', asset.status)}
        {row('Capacity', asset.capacity ? `${asset.capacity} ${asset.capacity_unit_detail?.symbol || ''}` : null)}
        {row('Location', asset.location_detail?.full_path || asset.location_detail?.name)}
        {row('Purchase Date', asset.purchase_date)}
        {row('Purchase Cost', asset.purchase_cost ? `$${asset.purchase_cost}` : null)}
        {row('Description', asset.description)}
      </div>

      {asset.parameters?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">Parameters</p>
          <div className="bg-gray-50 rounded-xl p-4 space-y-1">
            {asset.parameters.map((p, i) => (
              <div key={i} className="flex justify-between py-1 border-b border-gray-100 last:border-0">
                <span className="text-xs text-gray-400">{p.key}</span>
                <span className="text-sm text-gray-700">{p.value} {p.unit_detail?.symbol || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-gray-100 pt-4 flex justify-end">
        {/* close is handled by the parent modal */}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
const AssetsTable = () => {
  const [assets, setAssets] = useState([])
  const [units, setUnits] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const [modal, setModal] = useState(null) // 'create' | 'edit' | 'view'
  const [selected, setSelected] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { fetchAll() }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [aRes, uRes, lRes] = await Promise.all([
        apiFetch('/master-data/assets/'),
        apiFetch('/master-data/units/'),
        apiFetch('/master-data/locations/'),
      ])
      if (aRes && uRes && lRes) {
        const [a, u, l] = await Promise.all([aRes.json(), uRes.json(), lRes.json()])
        setAssets(Array.isArray(a) ? a : a.results || [])
        setUnits(Array.isArray(u) ? u : u.results || [])
        setLocations(Array.isArray(l) ? l : l.results || [])
      }
    } catch {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (data) => {
    setSaving(true)
    try {
      const res = await apiFetch('/master-data/assets/', { method: 'POST', body: JSON.stringify(data) })
      if (!res) return
      if (!res.ok) throw new Error()
      const newAsset = await res.json()
      setAssets(a => [...a, newAsset])
      setModal(null)
      showToast('Asset created successfully')
    } catch {
      showToast('Failed to create asset', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (data) => {
    setSaving(true)
    try {
      const res = await apiFetch(`/master-data/assets/${selected.id}/`, { method: 'PUT', body: JSON.stringify(data) })
      if (!res) return
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setAssets(a => a.map(x => x.id === updated.id ? updated : x))
      setModal(null)
      showToast('Asset updated successfully')
    } catch {
      showToast('Failed to update asset', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      const res = await apiFetch(`/master-data/assets/${deleteTarget.id}/`, { method: 'DELETE' })
      if (res && res.ok) {
        setAssets(a => a.filter(x => x.id !== deleteTarget.id))
        setDeleteTarget(null)
        showToast('Asset deleted successfully')
      }
    } catch {
      showToast('Failed to delete asset', 'error')
    }
  }

  const filtered = assets.filter(a => {
    const matchSearch = !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.asset_type?.toLowerCase().includes(search.toLowerCase()) ||
      a.serial_number?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || a.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (error) return <div className="text-red-500 text-sm p-6">{error}</div>

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm text-white transition-all ${toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>
          {toast.msg}
        </div>
      )}

      <div className="rounded-xl bg-white shadow-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Assets</h2>
          <div className="flex items-center gap-3">

            {/* Add Button */}
            <button
              onClick={() => { setSelected(null); setModal('create') }}
              className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Asset
            </button>

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search assets..."
                className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300 w-44"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="rounded-lg border border-gray-300 text-xs px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">All Status</option>
              {STATUS_CHOICES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>

          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-primary text-white text-xs uppercase">
              <tr>
                <th className="px-6 py-3 w-10">No</th>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Serial No.</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3">Location</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-400">No assets found</td>
                </tr>
              ) : paginated.map((asset, idx) => (
                <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="px-6 py-3 font-medium text-gray-900">{asset.name}</td>
                  <td className="px-6 py-3 text-gray-500">{asset.asset_type}</td>
                  <td className="px-6 py-3">
                    <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {asset.serial_number || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <StatusBadge status={asset.status} />
                  </td>
                  <td className="px-6 py-3 text-gray-500 text-xs">{asset.location_detail?.name || '—'}</td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setSelected(asset); setModal('view') }}
                        className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                      >View</button>
                      <button
                        onClick={() => { setSelected(asset); setModal('edit') }}
                        className="rounded-md bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-600"
                      >Edit</button>
                      <button
                        onClick={() => setDeleteTarget(asset)}
                        className="rounded-md bg-red-400 px-3 py-1 text-xs font-medium text-white hover:bg-red-500"
                      >Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
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
      </div>

      {/* ── Create Modal ─────────────────────────────────────────────────────── */}
      {modal === 'create' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Add New Asset</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <AssetForm
              units={units}
              locations={locations}
              onSubmit={handleCreate}
              onClose={() => setModal(null)}
              loading={saving}
            />
          </div>
        </div>
      )}

      {/* ── Edit Modal ───────────────────────────────────────────────────────── */}
      {modal === 'edit' && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Edit Asset — {selected.name}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <AssetForm
              initial={selected}
              units={units}
              locations={locations}
              onSubmit={handleUpdate}
              onClose={() => setModal(null)}
              loading={saving}
            />
          </div>
        </div>
      )}

      {/* ── View Modal ───────────────────────────────────────────────────────── */}
      {modal === 'view' && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">{selected.name}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <AssetDetail asset={selected} />
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setModal(null)}
                className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Asset</h3>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action cannot be undone.
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

export default AssetsTable
