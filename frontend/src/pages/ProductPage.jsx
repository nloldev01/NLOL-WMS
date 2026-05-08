import { useState, useEffect, useRef } from 'react';
import Topbar from '../components/Topbar';
import Sidebar from '../components/Sidebar';
import { apiFetch } from '../utils/api';

const PAGE_SIZE = 10

const emptyForm = {
  name: '',
  description: '',
  data_group_id: '',
  sub_group_id: '',
  product_segment_id: '',
  unit_id: '',
  is_available: true,
}

const ProductPage = () => {
  const [products, setProducts] = useState([])
  const [dataGroups, setDataGroups] = useState([])
  const [subGroups, setSubGroups] = useState([])
  const [productSegments, setProductSegments] = useState([])
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [filters, setFilters] = useState({
    product_group: '',
    product_sub_group: '',
    product_segment: '',
    is_available: '',
  })
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  useEffect(() => {
    fetchProducts()
    fetchDataGroups()
    fetchSubGroups()
    fetchProductSegments()
    fetchUnits()
  }, [])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // filtered
  const filtered = products.filter(p => {
    const matchesSearch =
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.product_group_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.product_segment_name?.toLowerCase().includes(search.toLowerCase())

    const matchesGroup    = !filters.product_group     || String(p.product_group)   === filters.product_group
    const matchesSubGroup = !filters.product_sub_group || String(p.product_sub_group) === filters.product_sub_group
    const matchesSegment  = !filters.product_segment   || String(p.product_segment) === filters.product_segment
    const matchesAvail    = filters.is_available === ''
      ? true
      : String(p.is_available) === filters.is_available

    return matchesSearch && matchesGroup && matchesSubGroup && matchesSegment && matchesAvail
  })

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/master-data/products/')
      if (res && res.ok) {
        const data = await res.json()
        setProducts(Array.isArray(data) ? data : (data.results ?? []))
      } else {
        setProducts([]) // Set empty products array if response is not ok
      }
    } catch {
      setProducts([]) // Set empty products array in case of an error
      setError('Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  const fetchDataGroups = async () => {
    try {
      const res = await apiFetch('/master-data/product-groups/')
      if (res && res.ok) {
        const data = await res.json()
        setDataGroups(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch { console.error('Failed to load data groups') }
  }

  const fetchSubGroups = async () => {
    try {
      const res = await apiFetch('/master-data/product-sub-groups/')
      if (res && res.ok) {
        const data = await res.json()
        setSubGroups(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch { console.error('Failed to load sub groups') }
  }

  const fetchProductSegments = async () => {
    try {
      const res = await apiFetch('/master-data/product-segments/')
      if (res && res.ok) {
        const data = await res.json()
        setProductSegments(Array.isArray(data) ? data : (data.results ?? []))
      }
    } catch { console.error('Failed to load product segments') }
  }

  const fetchUnits = async () => {
    try {
      const res = await apiFetch('/master-data/units/')
      if (res && res.ok) {
        const data = await res.json()
        setUnits(Array.isArray(data) ? data : (data.results ?? []))
      } else {
        console.error('Failed to fetch units: Non-OK response', res.status)
        setUnits([]) // Fallback to empty array
      }
    } catch (error) {
      console.error('Failed to fetch units:', error)
      setUnits([]) // Fallback to empty array
    }
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(product => {
    const unit = units.find(u => u.id === product.unit) || {};
    return {
      ...product,
      unit_name: unit.name || '—',
      unit_symbol: unit.symbol || '—',
    };
  })

  const openAdd = () => {
    setEditProduct(null)
    setForm(emptyForm)
    setError('')
    setModalOpen(true)
  }

  const openEdit = (product) => {
    setEditProduct(product)
    // openEdit — IDs are already flat integers from the serializer
    setForm({
      name: product.name || '',
      description: product.description || '',
      data_group_id: product.product_group || '',
      sub_group_id: product.product_sub_group || '',
      product_segment_id: product.product_segment || '',
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

    // Build payload — only include FK fields if they have a value
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      is_available: form.is_available,
    }

    if (form.data_group_id)       payload.product_group     = parseInt(form.data_group_id)
    if (form.sub_group_id)        payload.product_sub_group = parseInt(form.sub_group_id)
    if (form.product_segment_id)  payload.product_segment   = parseInt(form.product_segment_id)
    if (form.unit_id)             payload.unit              = parseInt(form.unit_id)

    // On create, all FK fields are required
    if (!editProduct) {
      if (!form.data_group_id)      return (setError('Data group is required.'),     setSubmitting(false))
      if (!form.sub_group_id)       return (setError('Sub group is required.'),      setSubmitting(false))
      if (!form.product_segment_id) return (setError('Segment is required.'),setSubmitting(false))
      if (!form.unit_id)            return (setError('Unit is required.'),           setSubmitting(false))
    }

    const endpoint = editProduct ? `/master-data/products/${editProduct.id}/` : '/master-data/products/'
    const method   = editProduct ? 'PATCH' : 'POST'   // PATCH so only sent fields are updated

    try {
      const res = await apiFetch(endpoint, { method, body: JSON.stringify(payload) })
      if (!res) return
      const data = await res.json()
      if (res.ok) {
        fetchProducts()
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

          {/* Breadcrumb */}
          <p className="text-xs text-gray-400 mb-3">Products</p>

          {/* Card */}
          <div className="rounded-xl bg-white shadow-sm">

            {/* Table Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Products</h2>
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
                            onClick={() => { setFilters({ product_group: '', product_sub_group: '', product_segment: '', is_available: '' }); setPage(1) }}
                            className="text-[10px] text-orange-500 hover:underline"
                          >
                            Clear all
                          </button>
                        )}
                      </div>

                      {/* Data Group */}
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Data Group</label>
                        <select
                          value={filters.product_group}
                          onChange={e => { setFilters(f => ({ ...f, product_group: e.target.value })); setPage(1) }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        >
                          <option value="">All</option>
                          {dataGroups.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
                        </select>
                      </div>

                      {/* Sub Group */}
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Sub Group</label>
                        <select
                          value={filters.product_sub_group}
                          onChange={e => { setFilters(f => ({ ...f, product_sub_group: e.target.value })); setPage(1) }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        >
                          <option value="">All</option>
                          {subGroups.map(sg => <option key={sg.id} value={String(sg.id)}>{sg.name}</option>)}
                        </select>
                      </div>

                      {/* Segment */}
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Segment</label>
                        <select
                          value={filters.product_segment}
                          onChange={e => { setFilters(f => ({ ...f, product_segment: e.target.value })); setPage(1) }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        >
                          <option value="">All</option>
                          {productSegments.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                        </select>
                      </div>

                      {/* Availability */}
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

            {/* Table */}
            {loading ? (
              <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-primary text-white text-xs uppercase">
                  <tr>
                    <th className="px-6 py-3 w-10">No</th>
                    <th className="px-6 py-3">Product Name</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3">Data Group</th>
                    <th className="px-6 py-3">Sub Group</th>
                    <th className="px-6 py-3">Segment</th>
                    <th className="px-6 py-3">Unit</th>
                    <th className="px-6 py-3">Available</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-gray-400">No products found</td>
                    </tr>
                  ) : paginated.map((product, idx) => (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">{product.name}</td>
                      <td className="px-6 py-3 text-gray-500 max-w-[160px] truncate">{product.description || '—'}</td>
                      <td className="px-6 py-3 text-gray-500">{product.product_group_name || '—'}</td>
                      <td className="px-6 py-3 text-gray-500">{product.product_sub_group_name || '—'}</td>
                      <td className="px-6 py-3 text-gray-500">{product.product_segment_name || '—'}</td>
                      <td className="px-6 py-3">
                        {product.unit_symbol ? (
                          <span className="px-2 py-0.5 rounded-md bg-orange-50 text-orange-600 text-xs font-medium">
                            {product.unit_symbol}
                          </span>
                        ) : '—'}
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

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                {editProduct ? 'Edit Product' : 'Add New Product'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
              )}

              {/* Product Name */}
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

              {/* Description */}
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

              {/* Data Group / Sub Group */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Data Group *</label>
                  <select
                    name="data_group_id"
                    value={form.data_group_id}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    <option value="">Select data group</option>
                    {dataGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sub Group *</label>
                  <select
                    name="sub_group_id"
                    value={form.sub_group_id}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    <option value="">Select sub group</option>
                    {subGroups.map(sg => <option key={sg.id} value={sg.id}>{sg.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Segment / Unit */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Segment *</label>
                  <select
                    name="product_segment_id"
                    value={form.product_segment_id}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    <option value="">Select segment</option>
                    {productSegments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
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
                    {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                  </select>
                </div>
              </div>
              {/* Availability */}
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

            {/* Modal Footer */}
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