import { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api'

const PAGE_SIZE = 10
const EMPTY_FORM = {
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  is_active: true,
}

export default function SuppliersTable() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [editSupplier, setEditSupplier] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── Fetch ─────────────────────────────────────────────
  const fetchSuppliers = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/master-data/suppliers/')
      if (res && res.ok) {
        const data = await res.json()
        setSuppliers(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch (err) {
      console.error('Failed to fetch suppliers:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSuppliers()
  }, [])

  // ── Filter + Pagination ─────────────────────────────
  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Modal ───────────────────────────────────────────
  const openAdd = () => {
    setEditSupplier(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  const openEdit = (supplier) => {
    setEditSupplier(supplier)
    setForm({
      name: supplier.name,
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      is_active: supplier.is_active,
    })
    setError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditSupplier(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm(f => ({
      ...f,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  // ── Submit ──────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.name.trim()) {
      return setError('Supplier name is required.')
    }

    setSubmitting(true)
    setError('')

    try {
      const endpoint = editSupplier
        ? `/master-data/suppliers/${editSupplier.id}/`
        : '/master-data/suppliers/'

      const method = editSupplier ? 'PUT' : 'POST'

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

      await fetchSuppliers()
      closeModal()
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── UI ───────────────────────────────────────────────
  return (
    <>
      <div className="rounded-xl bg-white shadow-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Suppliers</h2>

          <div className="flex items-center gap-3">
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600"
            >
              + Add Supplier
            </button>

            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search supplier..."
              className="pl-3 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs w-44"
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-primary text-white text-xs uppercase">
              <tr>
                <th className="px-6 py-3">No</th>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Phone</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                    No suppliers found
                  </td>
                </tr>
              ) : paginated.map((s, idx) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-400">
                    {(page - 1) * PAGE_SIZE + idx + 1}
                  </td>
                  <td className="px-6 py-3 font-medium">{s.name}</td>
                  <td className="px-6 py-3">{s.phone || '-'}</td>
                  <td className="px-6 py-3">{s.email || '-'}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => openEdit(s)}
                      className="bg-green-500 text-white px-3 py-1 text-xs rounded-md hover:bg-green-600"
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
        <div className="flex justify-between px-6 py-4 border-t border-gray-100 text-xs">
          <span>
            Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>

          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={page === p ? 'font-bold text-purple-600' : ''}
              >
                {p}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                {editSupplier ? 'Edit Supplier' : 'Add Supplier'}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">

              {error && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Supplier Name *
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Enter supplier name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Contact Person
                </label>
                <input
                  name="contact_person"
                  value={form.contact_person}
                  onChange={handleChange}
                  placeholder="Enter contact person"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Phone
                  </label>
                  <input
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="Phone number"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Email
                  </label>
                  <input
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="Email address"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Address
                </label>
                <textarea
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="Enter address"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={form.is_active}
                  onChange={handleChange}
                  className="rounded border-gray-300"
                />
                Active
              </label>
            </div>

            {/* Footer */}
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
                {submitting
                  ? 'Saving...'
                  : editSupplier
                  ? 'Update Supplier'
                  : 'Create Supplier'}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}