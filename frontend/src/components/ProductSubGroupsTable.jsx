import { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api'
import Pagination from './Pagination'

const PAGE_SIZE = 10
const EMPTY_FORM = { name: '', group: '' }

export default function ProductSubGroupsTable() {
  const [productSubGroups, setProductSubGroups] = useState([])
  const [productGroups, setProductGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editSubGroup, setEditSubGroup] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchProductSubGroups = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/master-data/product-sub-groups/')
      if (res && res.ok) {
        const data = await res.json()
        setProductSubGroups(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch (err) {
      console.error('Failed to fetch product sub-groups:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchProductGroups = async () => {
    try {
      const res = await apiFetch('/master-data/product-groups/')
      if (res && res.ok) {
        const data = await res.json()
        setProductGroups(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch (err) {
      console.error('Failed to fetch product groups:', err)
    }
  }

  useEffect(() => {
    fetchProductSubGroups()
    fetchProductGroups()
  }, [])

  // ── Filter + Paginate ─────────────────────────────────────────────────────
  const filtered = productSubGroups.filter(sg =>
    sg.name.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => a.name.localeCompare(b.name))
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditSubGroup(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  const openEdit = (sg) => {
    setEditSubGroup(sg)
    setForm({ name: sg.name, group: sg.group })
    setError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditSubGroup(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  // ── Submit (Create / Update) ──────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.name.trim()) return setError('Sub-group name is required.')
    if (!form.group) return setError('Please select a data group.')

    setSubmitting(true)
    setError('')

    try {
      const endpoint = editSubGroup
        ? `/master-data/product-sub-groups/${editSubGroup.id}/`
        : '/master-data/product-sub-groups/'
      const method = editSubGroup ? 'PUT' : 'POST'

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(form),
      })

      if (!res) return

      if (!res.ok) {
        const data = await res.json()
        const firstError = Object.values(data).flat()[0]
        return setError(firstError || 'Something went wrong.')
      }

      await fetchProductSubGroups()
      closeModal()
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="rounded-xl bg-white shadow-sm">

        {/* Table Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Sub Groups</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Sub Group
            </button>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search sub-group..."
                className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300 w-44"
              />
            </div>
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
                <th className="px-6 py-3">Group</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-gray-400">No sub groups found</td>
                </tr>
              ) : paginated.map((sg, idx) => (
                <tr key={sg.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="px-6 py-3 font-medium text-gray-900">{sg.name}</td>
                  <td className="px-6 py-3 text-gray-600">{sg.group_name}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => openEdit(sg)}
                      className="rounded-md bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-600"
                    >
                      Edit
                    </button>
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
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                {editSubGroup ? 'Edit Sub Group' : 'Add New Sub Group'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Data Group *</label>
                <select
                  name="group"
                  value={form.group}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                >
                  <option value="">Select a group</option>
                  {productGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sub-Group Name *</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Juices"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editSubGroup ? 'Update Sub Group' : 'Create Sub Group'}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}