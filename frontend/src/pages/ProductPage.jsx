import { useState, useEffect, useRef } from 'react';
import Topbar from '../components/Topbar';
import Sidebar from '../components/Sidebar';
import { apiFetch, parseError } from '../utils/api';
import Pagination from '../components/Pagination';
import PageSizeSelector, { DEFAULT_PAGE_SIZE } from '../components/PageSizeSelector';

const emptyForm = {
  name: '',
  description: '',
  unit_id: '',
  is_available: true,
}

const ProductPage = () => {
  const [products, setProducts] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [units, setUnits] = useState([])
  const [defaultUnitId, setDefaultUnitId] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [modalOpen, setModalOpen] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [filters, setFilters] = useState({ is_available: '' })
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  useEffect(() => {
    fetchUnits()
  }, [])

  // Reset to the first page whenever the search term, filters, or page size change
  useEffect(() => {
    setPage(1)
  }, [search, filters, pageSize])

  // Fetch the current page (debounced so rapid typing/filtering collapses into one request)
  useEffect(() => {
    const t = setTimeout(fetchProducts, 300)
    return () => clearTimeout(t)
  }, [page, search, filters, pageSize])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target))
        setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', page)
      params.append('page_size', pageSize)
      if (search) params.append('search', search)
      if (filters.is_available !== '') params.append('is_available', filters.is_available)

      const res = await apiFetch(`/master-data/products/?${params.toString()}`)
      if (res && res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setProducts(data)
          setTotalCount(data.length)
        } else {
          setProducts(data.results ?? [])
          setTotalCount(data.count ?? 0)
        }
      } else {
        setProducts([])
        setTotalCount(0)
      }
    } catch {
      setProducts([])
      setTotalCount(0)
      setError('Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  const fetchUnits = async () => {
    try {
      const res = await apiFetch('/master-data/units/')
      if (res && res.ok) {
        const data = await res.json()
        setUnits(Array.isArray(data) ? data : (data.results ?? []))
      } else {
        setUnits([])
      }
    } catch {
      setUnits([])
    }
  }

  useEffect(() => {
    const ltr = units.find(u => u.symbol?.toLowerCase() === 'ltr')
    if (ltr) setDefaultUnitId(String(ltr.id))
  }, [units])

  const secondaryUnits = units.filter(u => u.unit_type === 'secondary')

  // Server-side pagination: `products` already holds just the current page
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const paginated = products.map(product => {
    const unit = units.find(u => u.id === product.unit) || {}
    return { ...product, unit_name: unit.name || '-', unit_symbol: unit.symbol || '-' }
  })

  const openAdd = () => {
    setEditProduct(null)
    setForm({ ...emptyForm, unit_id: defaultUnitId })
    setError('')
    setModalOpen(true)
  }

  const openEdit = (product) => {
    setEditProduct(product)
    setForm({
      name: product.name || '',
      description: product.description || '',
      unit_id: product.unit || '',
      is_available: product.is_available ?? true,
    })
    setError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditProduct(null)
    setForm(emptyForm)
    setError('')
  }

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    if (!form.name.trim()) {
      setError('Product name is required.')
      setSubmitting(false)
      return
    }

    if (!editProduct && !form.unit_id) {
      setError('Unit is required.')
      setSubmitting(false)
      return
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      is_available: form.is_available,
    }
    if (form.unit_id) payload.unit = parseInt(form.unit_id)

    const endpoint = editProduct ? `/master-data/products/${editProduct.id}/` : '/master-data/products/'
    const method   = editProduct ? 'PATCH' : 'POST'

    try {
      const res = await apiFetch(endpoint, { method, body: JSON.stringify(payload) })
      if (!res) return
      const data = await res.json()
      if (res.ok) {
        fetchProducts()
        closeModal()
      } else {
        setError(parseError(data))
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
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">

          <p className="text-xs text-gray-400 mb-3">Base Products</p>

          <div className="rounded-xl bg-white shadow-sm">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Base Products</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={openAdd}
                  className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Product
                </button>
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                    placeholder="Search product..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-44"
                  />
                </div>
                <div className="relative" ref={filterRef}>
                  <button
                    onClick={() => setFilterOpen(o => !o)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeFilterCount > 0
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
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-64 rounded-xl bg-white border border-gray-200 shadow-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">Filters</p>
                        {activeFilterCount > 0 && (
                          <button
                            onClick={() => { setFilters({ is_available: '' }); setPage(1) }}
                            className="text-[10px] text-orange-500 hover:underline"
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Availability</label>
                        <select
                          value={filters.is_available}
                          onChange={e => { setFilters(f => ({ ...f, is_available: e.target.value })); setPage(1) }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        >
                          <option value="">All</option>
                          <option value="true">Available</option>
                          <option value="false">Unavailable</option>
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
                    <th className="px-6 py-3">Base Product Name</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3">Unit</th>
                    <th className="px-6 py-3">Available</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-gray-400">No products found</td>
                    </tr>
                  ) : paginated.map((product, idx) => (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-gray-400">{(page - 1) * pageSize + idx + 1}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">{product.name}</td>
                      <td className="px-6 py-3 text-gray-500 max-w-[160px] truncate">{product.description || '-'}</td>
                      <td className="px-6 py-3">
                        {product.unit_symbol && product.unit_symbol !== '-' ? (
                          <span className="px-2 py-0.5 rounded-md bg-orange-50 text-orange-600 text-xs font-medium">
                            {product.unit_symbol}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-3">
                        <button
                          onClick={async () => {
                            const res = await apiFetch(`/master-data/products/${product.id}/`, {
                              method: 'PATCH',
                              body: JSON.stringify({ is_available: !product.is_available }),
                            })
                            if (res && res.ok) fetchProducts()
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            product.is_available ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            product.is_available ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </button>
                      </td>
                      <td className="px-6 py-3">
                        <button
                          onClick={() => openEdit(product)}
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

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Showing {totalCount === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-4">
                <PageSizeSelector pageSize={pageSize} onChange={setPageSize} />
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            </div>
          </div>
        </main>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                {editProduct ? 'Edit Product' : 'Add New Product'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Product Name *</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Premium Rice"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Short product description..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit *</label>
                <select
                  name="unit_id"
                  value={form.unit_id}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="">Select unit</option>
                  {secondaryUnits.map(u => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                </select>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Available</p>
                  <p className="text-xs text-gray-400">Mark whether this product is currently available</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, is_available: !prev.is_available }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.is_available ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    form.is_available ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
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
                {submitting ? 'Saving...' : editProduct ? 'Update Product' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProductPage
