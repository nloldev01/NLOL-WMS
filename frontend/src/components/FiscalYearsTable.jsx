import { useState, useRef, useEffect } from 'react'
import { apiFetch } from '../utils/api'

const PAGE_SIZE = 8
const EMPTY_FORM = { name: '', start_date: '', end_date: '' }

export default function FiscalYearsTable() {
  const [fiscalYears, setFiscalYears] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editFy, setEditFy] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchFiscalYears = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/master-data/fiscal-years/')
      if (res && res.ok) {
        const data = await res.json()
        setFiscalYears(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch (err) {
      console.error('Failed to fetch fiscal years:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchFiscalYears() }, [])

  // ── Auth header (uses token from localStorage — adjust if you use a different auth) ──

  // ── Filter + Paginate (client-side on fetched data) ───────────────────────
  const filtered = fiscalYears.filter(fy =>
    fy.name.toLowerCase().includes(search.toLowerCase())
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditFy(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  const openEdit = (fy) => {
    setEditFy(fy)
    setForm({ name: fy.name, start_date: fy.start_date, end_date: fy.end_date })
    setError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditFy(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  // ── Submit (Create / Update) ──────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.name.trim()) return setError('Fiscal Year name is required.')
    if (!form.start_date.trim()) return setError('Start date is required.')
    if (!form.end_date.trim()) return setError('End date is required.')

    setSubmitting(true)
    setError('')

    try {
      const endpoint = editFy ? `/master-data/fiscal-years/${editFy.id}/` : '/master-data/fiscal-years/'
      const method = editFy ? 'PUT' : 'POST'

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(form),
      })

      if (!res) return;

      if (!res.ok) {
        const data = await res.json()
        const firstError = Object.values(data).flat()[0]
        return setError(firstError || 'Something went wrong.')
      }

      await fetchFiscalYears()
      closeModal()
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Set Active action ─────────────────────────────────────────────────────
  const handleSetActive = async (id) => {
    try {
      const res = await apiFetch(`/master-data/fiscal-years/${id}/set_active/`, {
        method: 'POST',
      })
      if (res.ok) {
        await fetchFiscalYears()
      } else {
        console.error('Failed to set active fiscal year')
      }
    } catch (err) {
      console.error('Error toggling active status:', err)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="rounded-xl bg-white shadow-sm">

        {/* Table Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Fiscal Years</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Fiscal Year
            </button>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search year..."
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
                <th className="px-6 py-3">Fiscal Year Name</th>
                <th className="px-6 py-3">Start Date</th>
                <th className="px-6 py-3">End Date</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-400">No fiscal years found</td>
                </tr>
              ) : paginated.map((fy, idx) => (
                <tr key={fy.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="px-6 py-3 font-medium text-gray-900">{fy.name}</td>
                  <td className="px-6 py-3 text-gray-600">
                    <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs font-mono font-medium">
                      {fy.start_date}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs font-mono font-medium">
                      {fy.end_date}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    {fy.is_active ? (
                      <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-600 text-xs font-medium border border-green-200">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-400 text-xs font-medium border border-gray-200">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!fy.is_active && (
                        <button
                          onClick={() => handleSetActive(fy.id)}
                          className="rounded-md bg-purple-500 px-3 py-1 text-xs font-medium text-white hover:bg-purple-600"
                        >
                          Set Active
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(fy)}
                        className="rounded-md bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-600"
                      >
                        Edit
                      </button>
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
                className={`w-7 h-7 rounded text-xs font-medium ${
                  page === p ? 'bg-purple-500 text-white' : 'text-gray-500 hover:bg-gray-100'
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

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                {editFy ? 'Edit Fiscal Year' : 'Add New Fiscal Year'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fiscal Year Name *</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. 2081/82"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start Date *</label>
                  <input
                    type="date"
                    name="start_date"
                    value={form.start_date}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End Date *</label>
                  <input
                    type="date"
                    name="end_date"
                    value={form.end_date}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>
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
                {submitting ? 'Saving...' : editFy ? 'Update Fiscal Year' : 'Create Fiscal Year'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
