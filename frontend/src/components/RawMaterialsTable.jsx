import React, { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api'

const PAGE_SIZE = 8

const TYPE_CHOICES = [
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'consumable',   label: 'Consumable' },
]

const EMPTY_FORM = {
  name: '',
  type: 'raw_material',
  unit: '',
}

// ─── Type Badge ───────────────────────────────────────────────────────────────
const TYPE_COLORS = {
  raw_material: 'bg-blue-50 text-blue-600 border border-blue-200',
  consumable:   'bg-amber-50 text-amber-600 border border-amber-200',
}

const TypeBadge = ({ type, label }) => (
  <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${TYPE_COLORS[type] || 'bg-gray-100 text-gray-500'}`}>
    {label || type}
  </span>
)

// ─── Form ─────────────────────────────────────────────────────────────────────
const RawMaterialForm = ({ initial, units, onSubmit, onClose, loading }) => {
  const [form, setForm] = useState(initial ? {
    name: initial.name || '',
    type: initial.type || 'raw_material',
    unit: initial.unit ?? '',
  } : EMPTY_FORM)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = () => {
    if (!form.name.trim()) return setError('Name is required.')
    if (!form.type)        return setError('Type is required.')
    setError('')
    onSubmit({
      name: form.name.trim(),
      type: form.type,
      unit: form.unit || null,
    })
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="px-6 py-5 space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
      )}

      {/* Name */}
      <div>
        <label className={labelCls}>Name *</label>
        <input
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="e.g. Cement, Engine Oil"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Type */}
        <div>
          <label className={labelCls}>Type *</label>
          <select
            value={form.type}
            onChange={e => set('type', e.target.value)}
            className={inputCls}
          >
            {TYPE_CHOICES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Unit */}
        <div>
          <label className={labelCls}>Unit</label>
          <select
            value={form.unit}
            onChange={e => set('unit', e.target.value)}
            className={inputCls}
          >
            <option value="">— Select Unit —</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
            ))}
          </select>
        </div>
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
          className="rounded-lg bg-green-500 px-6 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
        >
          {loading ? 'Saving...' : (initial?.id ? 'Update' : 'Create')}
        </button>
      </div>
    </div>
  )
}

// ─── Detail View ──────────────────────────────────────────────────────────────
const RawMaterialDetail = ({ item }) => {
  const row = (label, value) => value ? (
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm text-gray-700 font-medium">{value}</span>
    </div>
  ) : null

  const typeLabel = TYPE_CHOICES.find(t => t.value === item.type)?.label || item.type

  return (
    <div className="px-6 py-5">
      <div className="bg-gray-50 rounded-xl p-4 space-y-1">
        {row('Name', item.name)}
        {row('Type', typeLabel)}
        {item.unit_name && row('Unit', `${item.unit_name} (${item.unit_symbol})`)}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
const RawMaterialsTable = () => {
  const [items, setItems]       = useState([])
  const [units, setUnits]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)
  const [search, setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage]         = useState(1)

  const [modal, setModal]           = useState(null) // 'create' | 'edit' | 'view'
  const [selected, setSelected]     = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toast, setToast]           = useState(null)

  useEffect(() => { fetchAll() }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [rmRes, uRes] = await Promise.all([
        apiFetch('/master-data/raw-materials-and-consumables/'),
        apiFetch('/master-data/units/'),
      ])
      if (rmRes && uRes) {
        const [rm, u] = await Promise.all([rmRes.json(), uRes.json()])
        setItems(Array.isArray(rm) ? rm : rm.results || [])
        setUnits(Array.isArray(u)  ? u  : u.results  || [])
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
      const res = await apiFetch('/master-data/raw-materials-and-consumables/', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      if (!res) return
      if (!res.ok) throw new Error()
      const created = await res.json()
      setItems(prev => [...prev, created])
      setModal(null)
      showToast('Item created successfully')
    } catch {
      showToast('Failed to create item', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (data) => {
    setSaving(true)
    try {
      const res = await apiFetch(`/master-data/raw-materials-and-consumables/${selected.id}/`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      if (!res) return
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setItems(prev => prev.map(x => x.id === updated.id ? updated : x))
      setModal(null)
      showToast('Item updated successfully')
    } catch {
      showToast('Failed to update item', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      const res = await apiFetch(`/master-data/raw-materials-and-consumables/${deleteTarget.id}/`, {
        method: 'DELETE',
      })
      if (res && res.ok) {
        setItems(prev => prev.filter(x => x.id !== deleteTarget.id))
        setDeleteTarget(null)
        showToast('Item deleted successfully')
      }
    } catch {
      showToast('Failed to delete item', 'error')
    }
  }

  const filtered = items.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    const matchType   = !typeFilter || item.type === typeFilter
    return matchSearch && matchType
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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
          <h2 className="text-base font-semibold text-gray-900">Raw Materials &amp; Consumables</h2>
          <div className="flex items-center gap-3">

            {/* Add Button */}
            <button
              onClick={() => { setSelected(null); setModal('create') }}
              className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Item
            </button>

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search..."
                className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300 w-40"
              />
            </div>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
              className="rounded-lg border border-gray-300 text-xs px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">All Types</option>
              {TYPE_CHOICES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
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
                <th className="px-6 py-3">Unit</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-400">No items found</td>
                </tr>
              ) : paginated.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="px-6 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-6 py-3">
                    <TypeBadge type={item.type} label={item.type_display} />
                  </td>
                  <td className="px-6 py-3 text-gray-500 text-xs">
                    {item.unit_name ? `${item.unit_name} (${item.unit_symbol})` : '—'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setSelected(item); setModal('view') }}
                        className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                      >View</button>
                      <button
                        onClick={() => { setSelected(item); setModal('edit') }}
                        className="rounded-md bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-600"
                      >Edit</button>
                      <button
                        onClick={() => setDeleteTarget(item)}
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

      {/* ── Create Modal ──────────────────────────────────────────────────────── */}
      {modal === 'create' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Add Raw Material / Consumable</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <RawMaterialForm
              units={units}
              onSubmit={handleCreate}
              onClose={() => setModal(null)}
              loading={saving}
            />
          </div>
        </div>
      )}

      {/* ── Edit Modal ────────────────────────────────────────────────────────── */}
      {modal === 'edit' && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Edit — {selected.name}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <RawMaterialForm
              initial={selected}
              units={units}
              onSubmit={handleUpdate}
              onClose={() => setModal(null)}
              loading={saving}
            />
          </div>
        </div>
      )}

      {/* ── View Modal ────────────────────────────────────────────────────────── */}
      {modal === 'view' && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">{selected.name}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <RawMaterialDetail item={selected} />
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setModal(null)}
                className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ────────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Item</h3>
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

export default RawMaterialsTable
