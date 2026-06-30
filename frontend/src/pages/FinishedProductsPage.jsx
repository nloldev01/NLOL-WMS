import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch, parseError } from '../utils/api'

const PAGE_SIZE = 10

const MATERIAL_CHOICES = [
  { value: 'pet',   label: 'PET Plastic' },
  { value: 'hdpe',  label: 'HDPE Plastic' },
  { value: 'glass', label: 'Glass' },
  { value: 'metal', label: 'Metal / Tin' },
  { value: 'foil',  label: 'Foil / Laminate' },
  { value: 'paper', label: 'Paper / Cardboard' },
  { value: 'other', label: 'Other' },
]
const MATERIAL_MAP = Object.fromEntries(MATERIAL_CHOICES.map(m => [m.value, m.label]))

const PREDEFINED_SIZES = [
  0.175, 0.2, 0.25, 0.35, 0.5, 0.7, 0.8,
  1, 1.2, 1.6, 1.7, 2, 2.5, 3, 3.5, 4, 5,
  6, 7, 7.5, 8, 8.5, 9.5, 10, 12, 13, 15, 18, 20,
  50, 150, 180, 200, 205, 209, 210, 230,
]

const CONTAINER_ICONS = {
  bottle:  'M10 2h4v3.5c0 .5.2 1 .5 1.4L16 9v10a1 1 0 01-1 1H9a1 1 0 01-1-1V9L9.5 6.9c.3-.4.5-.9.5-1.4V2z',
  can:     'M8 3h8v2H8V3zm-1 2h10v12a2 2 0 01-2 2H9a2 2 0 01-2-2V5z',
  pail:    'M7 4h10l-1.5 13H8.5L7 4zM5 4h14M9 4V2h6v2',
  drum:    'M6 5h12v14H6V5zm0 0c0-2 2-3 6-3s6 1 6 3M6 19c0 2 2 3 6 3s6-1 6-3M6 12h12',
  pouch:   'M8 3h8l2 4v12H6V7l2-4zm0 0V1m8 2V1',
  box:     'M3 6l9-4 9 4v12l-9 4-9-4V6zm9-4v16M3 6l9 4 9-4',
  jug:     'M7 2h10v18H7V2zm0 8h4m4-4h2a2 2 0 010 4h-2',
  jar:     'M8 2h8v3H8V2zm-2 3h12v13a2 2 0 01-2 2H8a2 2 0 01-2-2V5zM6 8h12',
  other:   'M20 7H4a1 1 0 00-1 1v10a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1zM4 7V5a1 1 0 011-1h14a1 1 0 011 1v2',
  default: 'M3 6l9-4 9 4v12l-9 4-9-4V6zm9-4v16M3 6l9 4 9-4',
}
const getContainerIcon = (icon, name = '') => {
  if (icon && CONTAINER_ICONS[icon]) return CONTAINER_ICONS[icon]
  const n = name.toLowerCase()
  if (n.includes('bottle'))                       return CONTAINER_ICONS.bottle
  if (n.includes('can') || n.includes('tin'))     return CONTAINER_ICONS.can
  if (n.includes('pail') || n.includes('bucket')) return CONTAINER_ICONS.pail
  if (n.includes('drum') || n.includes('barrel')) return CONTAINER_ICONS.drum
  return CONTAINER_ICONS.default
}
const ContainerIcon = ({ icon, name, className = 'w-6 h-6' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d={getContainerIcon(icon, name)} />
  </svg>
)

const emptyProductForm = {
  name: '', description: '', base_product: '',
  product_group: '', product_segment: '', product_sub_group: '',
  is_available: true,
}

const emptyVariantForm = {
  unit: '', material: '', volume: '', volume_unit: '',
  secondary_unit: '', capacity_value: '', base_quantity: '',
  name: '', product_code: '', sku_code: '',
  is_available: true, added_sticker: false, sticker_name: '',
}

const FinishedProductsPage = () => {
  const [products, setProducts]             = useState([])
  const [baseProducts, setBaseProducts]     = useState([])
  const [groups, setGroups]                 = useState([])
  const [subGroups, setSubGroups]           = useState([])
  const [segments, setSegments]             = useState([])
  const [units, setUnits]                   = useState([])
  const [primaryUnits, setPrimaryUnits]     = useState([])
  const [loading, setLoading]               = useState(true)
  const [search, setSearch]                 = useState('')
  const [page, setPage]                     = useState(1)
  const [filters, setFilters]               = useState({ base_product: '', is_available: '' })
  const [filterOpen, setFilterOpen]         = useState(false)
  const filterRef                           = useRef(null)

  // expanded rows and their variants cache
  const [expandedId, setExpandedId]         = useState(null)
  const [variantsByProduct, setVariantsByProduct] = useState({})
  const [variantsLoading, setVariantsLoading] = useState(new Set())

  // product modal
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editProduct, setEditProduct]       = useState(null)
  const [productForm, setProductForm]       = useState(emptyProductForm)
  const [productError, setProductError]     = useState('')
  const [productSubmitting, setProductSubmitting] = useState(false)

  // variant modal
  const [variantModalOpen, setVariantModalOpen] = useState(false)
  const [editVariant, setEditVariant]       = useState(null)
  const [variantParentId, setVariantParentId] = useState(null)
  const [variantForm, setVariantForm]       = useState(emptyVariantForm)
  const [variantError, setVariantError]     = useState('')
  const [variantSubmitting, setVariantSubmitting] = useState(false)

  // inline product-code editing
  const [editingCodeId, setEditingCodeId]     = useState(null)
  const [editingCodeVal, setEditingCodeVal]   = useState('')

  // inline sku-code editing
  const [editingSkuId, setEditingSkuId]       = useState(null)
  const [editingSkuVal, setEditingSkuVal]     = useState('')

  // BOM modal
  const [bomVariant, setBomVariant]           = useState(null)
  const [bomLines, setBomLines]               = useState([])
  const [bomConsumables, setBomConsumables]   = useState([])
  const [newBomMaterial, setNewBomMaterial]   = useState('')
  const [newBomQty, setNewBomQty]             = useState('')
  const [bomSubmitting, setBomSubmitting]     = useState(false)
  const [bomError, setBomError]               = useState('')

  // quick-create (one container at a time)
  const [quickContainer, setQuickContainer]   = useState(null)
  const [selectedSizes, setSelectedSizes]     = useState([])
  const [quickVolumeUnit, setQuickVolumeUnit] = useState('')
  const [bulkSubmitting, setBulkSubmitting]   = useState(false)
  const [bulkError, setBulkError]             = useState('')
  const [bulkSuccess, setBulkSuccess]         = useState('')

  useEffect(() => {
    fetchProducts()
    fetchBaseProducts()
    fetchGroups()
    fetchSubGroups()
    fetchSegments()
    fetchUnits()
    fetchPrimaryUnits()
  }, [])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (units.length && !quickVolumeUnit) setQuickVolumeUnit(String(units[0].id))
  }, [units])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/master-data/finished-products/')
      if (res?.ok) {
        const data = await res.json()
        setProducts(Array.isArray(data) ? data : (data.results ?? []))
      } else setProducts([])
    } catch { setProducts([]) }
    finally { setLoading(false) }
  }

  const fetchBaseProducts = async () => {
    const res = await apiFetch('/master-data/products/')
    if (res?.ok) { const d = await res.json(); setBaseProducts(Array.isArray(d) ? d : (d.results ?? [])) }
  }
  const fetchGroups = async () => {
    const res = await apiFetch('/master-data/product-groups/')
    if (res?.ok) { const d = await res.json(); setGroups(Array.isArray(d) ? d : (d.results ?? [])) }
  }
  const fetchSubGroups = async () => {
    const res = await apiFetch('/master-data/product-sub-groups/')
    if (res?.ok) { const d = await res.json(); setSubGroups(Array.isArray(d) ? d : (d.results ?? [])) }
  }
  const fetchSegments = async () => {
    const res = await apiFetch('/master-data/product-segments/')
    if (res?.ok) { const d = await res.json(); setSegments(Array.isArray(d) ? d : (d.results ?? [])) }
  }
  const fetchUnits = async () => {
    const res = await apiFetch('/master-data/units/')
    if (res?.ok) { const d = await res.json(); setUnits(Array.isArray(d) ? d : (d.results ?? [])) }
  }
  const fetchPrimaryUnits = async () => {
    const res = await apiFetch('/master-data/units/?unit_type=primary')
    if (res?.ok) { const d = await res.json(); setPrimaryUnits(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const fetchVariants = async (productId) => {
    setVariantsLoading(prev => new Set(prev).add(productId))
    try {
      const res = await apiFetch(`/master-data/finished-product-variants/?finished_product=${productId}`)
      if (res?.ok) {
        const d = await res.json()
        setVariantsByProduct(prev => ({ ...prev, [productId]: Array.isArray(d) ? d : (d.results ?? []) }))
      }
    } catch { /* ignore */ }
    finally {
      setVariantsLoading(prev => { const s = new Set(prev); s.delete(productId); return s })
    }
  }

  const toggleExpand = (productId) => {
    if (expandedId === productId) {
      setExpandedId(null)
    } else {
      setQuickContainer(null)
      setSelectedSizes([])
      setBulkError('')
      setBulkSuccess('')
      setExpandedId(productId)
      if (!variantsByProduct[productId]) fetchVariants(productId)
    }
  }

  // ── filtering / pagination ──────────────────────────────────────────────────
  const filtered = products.filter(p => {
    const matchSearch = p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.base_product_name?.toLowerCase().includes(search.toLowerCase())
    const matchBase  = !filters.base_product || String(p.base_product) === filters.base_product
    const matchAvail = filters.is_available === '' || String(p.is_available) === filters.is_available
    return matchSearch && matchBase && matchAvail
  })

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── product modal ───────────────────────────────────────────────────────────
  const openAddProduct = () => {
    setEditProduct(null); setProductForm(emptyProductForm); setProductError(''); setProductModalOpen(true)
  }
  const openEditProduct = (item) => {
    setEditProduct(item)
    setProductForm({
      name: item.name || '',
      description: item.description || '',
      base_product: item.base_product || '',
      product_group: item.product_group || '',
      product_segment: item.product_segment || '',
      product_sub_group: item.product_sub_group || '',
      is_available: item.is_available ?? true,
    })
    setProductError(''); setProductModalOpen(true)
  }
  const closeProductModal = () => { setProductModalOpen(false); setEditProduct(null); setProductForm(emptyProductForm); setProductError('') }

  const handleProductChange = (e) => {
    const { name, value, type, checked } = e.target
    setProductForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleProductSubmit = async () => {
    setProductSubmitting(true); setProductError('')
    if (!editProduct && !productForm.base_product) { setProductError('Base product is required.'); setProductSubmitting(false); return }

    const payload = {
      name: productForm.name.trim(),
      description: productForm.description.trim(),
      is_available: productForm.is_available,
    }
    if (productForm.base_product)    payload.base_product      = parseInt(productForm.base_product)
    if (productForm.product_group)   payload.product_group     = parseInt(productForm.product_group)
    if (productForm.product_segment) payload.product_segment   = parseInt(productForm.product_segment)
    if (productForm.product_sub_group) payload.product_sub_group = parseInt(productForm.product_sub_group)

    const endpoint = editProduct ? `/master-data/finished-products/${editProduct.id}/` : '/master-data/finished-products/'
    const method   = editProduct ? 'PATCH' : 'POST'
    try {
      const res = await apiFetch(endpoint, { method, body: JSON.stringify(payload) })
      if (!res) return
      const data = await res.json()
      if (res.ok) { fetchProducts(); closeProductModal() }
      else setProductError(parseError(data))
    } catch { setProductError('Network error.') }
    finally { setProductSubmitting(false) }
  }

  // ── variant modal ───────────────────────────────────────────────────────────
  const openAddVariant = (productId) => {
    setEditVariant(null); setVariantParentId(productId); setVariantForm(emptyVariantForm); setVariantError(''); setVariantModalOpen(true)
  }
  const openEditVariant = (variant, productId) => {
    setEditVariant(variant); setVariantParentId(productId)
    setVariantForm({
      unit: variant.unit || '',
      material: variant.material || '',
      volume: variant.volume || '',
      volume_unit: variant.volume_unit || '',
      secondary_unit: variant.secondary_unit || '',
      capacity_value: variant.capacity_value || '',
      base_quantity: variant.base_quantity || '',
      name: variant.name || '',
      product_code: variant.product_code || '',
      sku_code: variant.sku_code || '',
      is_available: variant.is_available ?? true,
      added_sticker: variant.added_sticker ?? false,
      sticker_name: variant.sticker_name || '',
    })
    setVariantError(''); setVariantModalOpen(true)
  }
  const closeVariantModal = () => { setVariantModalOpen(false); setEditVariant(null); setVariantParentId(null); setVariantForm(emptyVariantForm); setVariantError('') }

  const handleVariantChange = (e) => {
    const { name, value, type, checked } = e.target
    let val = type === 'checkbox' ? checked : value
    if (name === 'sku_code') val = val.toUpperCase().replace(/\s+/g, '')
    setVariantForm(prev => {
      const next = { ...prev, [name]: val }
      if (name === 'unit') {
        const selected = primaryUnits.find(u => String(u.id) === String(val))
        if (selected?.base_unit) next.volume_unit = String(selected.base_unit)
      }
      if (name === 'volume') next.capacity_value = val
      return next
    })
  }

  const handleVariantSubmit = async () => {
    setVariantSubmitting(true); setVariantError('')
    if (!variantForm.unit)         { setVariantError('Container type (unit) is required.'); setVariantSubmitting(false); return }
    if (!variantForm.volume)       { setVariantError('Volume is required.'); setVariantSubmitting(false); return }
    if (!variantForm.volume_unit)  { setVariantError('Volume unit is required.'); setVariantSubmitting(false); return }
    if (!variantForm.base_quantity){ setVariantError('Base quantity is required.'); setVariantSubmitting(false); return }

    const payload = {
      finished_product: variantParentId,
      unit: parseInt(variantForm.unit),
      volume: parseFloat(variantForm.volume),
      volume_unit: parseInt(variantForm.volume_unit),
      base_quantity: parseFloat(variantForm.base_quantity),
      is_available: variantForm.is_available,
      added_sticker: variantForm.added_sticker,
    }
    if (variantForm.material)       payload.material       = variantForm.material
    if (variantForm.secondary_unit) payload.secondary_unit = parseInt(variantForm.secondary_unit)
    if (variantForm.capacity_value) payload.capacity_value = parseFloat(variantForm.capacity_value)
    if (variantForm.sku_code.trim())      payload.sku_code      = variantForm.sku_code.trim()
    if (variantForm.name.trim())          payload.name          = variantForm.name.trim()
    if (variantForm.product_code.trim())  payload.product_code  = variantForm.product_code.trim()
    if (variantForm.sticker_name.trim())  payload.sticker_name  = variantForm.sticker_name.trim()

    const endpoint = editVariant
      ? `/master-data/finished-product-variants/${editVariant.id}/`
      : '/master-data/finished-product-variants/'
    const method = editVariant ? 'PATCH' : 'POST'
    try {
      const res = await apiFetch(endpoint, { method, body: JSON.stringify(payload) })
      if (!res) return
      const data = await res.json()
      if (res.ok) {
        fetchVariants(variantParentId)
        fetchProducts()
        closeVariantModal()
      } else setVariantError(parseError(data))
    } catch { setVariantError('Network error.') }
    finally { setVariantSubmitting(false) }
  }

  const deleteVariant = async (variantId, productId) => {
    if (!window.confirm('Delete this variant?')) return
    const res = await apiFetch(`/master-data/finished-product-variants/${variantId}/`, { method: 'DELETE' })
    if (res?.ok || res?.status === 204) {
      fetchVariants(productId)
      fetchProducts()
    }
  }

  const saveProductCode = async (variantId, productId, value) => {
    setEditingCodeId(null)
    const res = await apiFetch(`/master-data/finished-product-variants/${variantId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ product_code: value.trim() }),
    })
    if (res?.ok) fetchVariants(productId)
  }

  const saveSkuCode = async (variantId, productId, value) => {
    setEditingSkuId(null)
    const sku_code = value.toUpperCase().replace(/\s+/g, '').trim()
    const res = await apiFetch(`/master-data/finished-product-variants/${variantId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ sku_code }),
    })
    if (res?.ok) fetchVariants(productId)
    else { const data = await res.json().catch(() => ({})); alert(parseError(data)) }
  }

  const openBomModal = async (variant) => {
    setBomVariant(variant); setBomLines([]); setBomError(''); setNewBomMaterial(''); setNewBomQty('')
    const [bomRes, consumRes] = await Promise.all([
      apiFetch(`/assembly/bom/?finished_product_variant=${variant.id}`),
      apiFetch('/master-data/raw-materials-and-consumables/?type=consumable'),
    ])
    if (bomRes?.ok) { const d = await bomRes.json(); setBomLines(Array.isArray(d) ? d : (d.results ?? [])) }
    if (consumRes?.ok) { const d = await consumRes.json(); setBomConsumables(Array.isArray(d) ? d : (d.results ?? [])) }
  }

  const addBomLine = async () => {
    if (!newBomMaterial || !newBomQty) { setBomError('Select a material and enter quantity.'); return }
    setBomSubmitting(true); setBomError('')
    const res = await apiFetch('/assembly/bom/', {
      method: 'POST',
      body: JSON.stringify({ finished_product_variant: bomVariant.id, material: parseInt(newBomMaterial), quantity_per_unit: parseFloat(newBomQty) }),
    })
    if (res?.ok) {
      const d = await res.json(); setBomLines(prev => [...prev, d]); setNewBomMaterial(''); setNewBomQty('')
    } else {
      const errData = await res.json(); setBomError(parseError(errData))
    }
    setBomSubmitting(false)
  }

  const deleteBomLine = async (lineId) => {
    const res = await apiFetch(`/assembly/bom/${lineId}/`, { method: 'DELETE' })
    if (res?.ok || res?.status === 204) setBomLines(prev => prev.filter(l => l.id !== lineId))
  }

  const handleBulkCreate = async (productId) => {
    setBulkSubmitting(true); setBulkError(''); setBulkSuccess('')
    const existing = variantsByProduct[productId] ?? []
    const toCreate = selectedSizes.filter(vol =>
      !existing.some(v =>
        parseFloat(v.volume) === vol &&
        String(v.volume_unit) === quickVolumeUnit &&
        String(v.unit) === String(quickContainer.id)
      )
    )
    if (toCreate.length === 0) {
      setBulkError('All selected sizes already exist for this container.')
      setBulkSubmitting(false)
      return
    }
    const results = []
    for (const vol of toCreate) {
      const res = await apiFetch('/master-data/finished-product-variants/', {
        method: 'POST',
        body: JSON.stringify({
          finished_product: productId,
          unit: quickContainer.id,
          volume: vol,
          volume_unit: parseInt(quickVolumeUnit),
          base_quantity: vol,
          is_available: true,
          added_sticker: false,
        }),
      })
      results.push(res)
    }
    const failed = results.filter(r => !r?.ok).length
    await fetchVariants(productId)
    fetchProducts()
    setSelectedSizes([])
    setQuickContainer(null)
    if (failed === 0) {
      setBulkSuccess(`${toCreate.length} variant${toCreate.length > 1 ? 's' : ''} created.`)
    } else {
      setBulkError(`${toCreate.length - failed} created, ${failed} failed.`)
    }
    setBulkSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Packaging / Finished Products</p>

          <div className="rounded-xl bg-white shadow-sm">
            {/* ── Header / toolbar ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Finished Products</h2>
              <div className="flex items-center gap-3">
                <button onClick={openAddProduct} className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add Product Line
                </button>
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search by name..." className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-44" />
                </div>
                <div className="relative" ref={filterRef}>
                  <button onClick={() => setFilterOpen(o => !o)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${activeFilterCount > 0 ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4-2A1 1 0 018 17v-3.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                    Filters
                    {activeFilterCount > 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] text-white font-semibold">{activeFilterCount}</span>}
                  </button>
                  {filterOpen && (
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-xl bg-white border border-gray-200 shadow-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">Filters</p>
                        {activeFilterCount > 0 && <button onClick={() => { setFilters({ base_product: '', is_available: '' }); setPage(1) }} className="text-[10px] text-orange-500 hover:underline">Clear all</button>}
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Base Product</label>
                        <select value={filters.base_product} onChange={e => { setFilters(f => ({ ...f, base_product: e.target.value })); setPage(1) }} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
                          <option value="">All</option>
                          {baseProducts.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Availability</label>
                        <select value={filters.is_available} onChange={e => { setFilters(f => ({ ...f, is_available: e.target.value })); setPage(1) }} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
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

            {/* ── Product line table ────────────────────────────────────────── */}
            {loading ? (
              <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-primary text-white text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 w-8"></th>
                    <th className="px-4 py-3 w-10">No</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Base Product</th>
                    <th className="px-4 py-3">Group</th>
                    <th className="px-4 py-3">Sub Group</th>
                    <th className="px-4 py-3">Segment</th>
                    <th className="px-4 py-3">Variants</th>
                    <th className="px-4 py-3">Available</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr><td colSpan={10} className="px-6 py-10 text-center text-gray-400">No finished products found</td></tr>
                  ) : paginated.map((item, idx) => (
                    <>
                      <tr key={item.id} className={`hover:bg-gray-50 transition-colors cursor-pointer ${expandedId === item.id ? 'bg-orange-50/40' : ''}`}>
                        <td className="px-4 py-3" onClick={() => toggleExpand(item.id)}>
                          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedId === item.id ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </td>
                        <td className="px-4 py-3 text-gray-400" onClick={() => toggleExpand(item.id)}>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900" onClick={() => toggleExpand(item.id)}>{item.name}</td>
                        <td className="px-4 py-3 text-gray-500" onClick={() => toggleExpand(item.id)}>{item.base_product_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs" onClick={() => toggleExpand(item.id)}>{item.product_group_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs" onClick={() => toggleExpand(item.id)}>{item.product_sub_group_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs" onClick={() => toggleExpand(item.id)}>{item.product_segment_name || '—'}</td>
                        <td className="px-4 py-3" onClick={() => toggleExpand(item.id)}>
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs font-semibold">
                            {item.variant_count ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={async () => {
                              const res = await apiFetch(`/master-data/finished-products/${item.id}/`, { method: 'PATCH', body: JSON.stringify({ is_available: !item.is_available }) })
                              if (res?.ok) fetchProducts()
                            }}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${item.is_available ? 'bg-green-500' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${item.is_available ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => openEditProduct(item)} className="rounded-md bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-600">Edit</button>
                        </td>
                      </tr>

                      {/* ── Variants expanded panel ─────────────────────────── */}
                      {expandedId === item.id && (
                        <tr key={`${item.id}-variants`}>
                          <td colSpan={10} className="bg-slate-50 px-0 py-0">
                            <div className="mx-4 my-3 rounded-xl border border-gray-200 bg-white overflow-hidden">

                              {/* Header */}
                              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{item.name} — Variants</p>
                                <button onClick={() => openAddVariant(item.id)} className="text-[10px] text-gray-400 hover:text-gray-600 underline underline-offset-2">
                                  Full form
                                </button>
                              </div>

                              {variantsLoading.has(item.id) ? (
                                <div className="px-4 py-6 text-center text-gray-400 text-xs">Loading variants...</div>
                              ) : (() => {
                                const variants = variantsByProduct[item.id] ?? []
                                const existingForContainer = (vol) =>
                                  quickContainer && variants.some(v =>
                                    parseFloat(v.volume) === vol &&
                                    String(v.volume_unit) === quickVolumeUnit &&
                                    String(v.unit) === String(quickContainer.id)
                                  )
                                const unitIconFor = (unitId) => primaryUnits.find(u => u.id === unitId)?.icon
                                return (
                                  <div className="px-5 py-4 space-y-5">

                                    {/* ── Quick-create area ── */}
                                    <div className="rounded-lg border border-orange-100 bg-orange-50/20 p-4 space-y-4">

                                      {/* Step 1: Container type */}
                                      <div>
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Container Type</p>
                                        <div className="flex flex-wrap gap-2">
                                          {primaryUnits.map(u => {
                                            const isSel = quickContainer?.id === u.id
                                            return (
                                              <button key={u.id}
                                                onClick={() => {
                                                  if (!isSel && u.base_unit) setQuickVolumeUnit(String(u.base_unit))
                                                  setQuickContainer(isSel ? null : { id: u.id, name: u.name, icon: u.icon })
                                                  setSelectedSizes([])
                                                  setBulkError(''); setBulkSuccess('')
                                                }}
                                                className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border-2 transition-all min-w-[72px] shadow-sm ${isSel ? 'border-orange-400 bg-orange-50 shadow-orange-100' : 'border-gray-100 bg-white hover:border-orange-200 hover:shadow-md'}`}
                                              >
                                                <ContainerIcon icon={u.icon} name={u.name} className={`w-5 h-5 ${isSel ? 'text-orange-500' : 'text-gray-400'}`} />
                                                <span className={`text-[10px] font-semibold ${isSel ? 'text-orange-600' : 'text-gray-500'}`}>{u.name}</span>
                                              </button>
                                            )
                                          })}
                                        </div>
                                      </div>

                                      {/* Step 2: Sizes */}
                                      {quickContainer && (
                                        <>
                                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Sizes for {quickContainer.name}</p>

                                          <div className="flex flex-wrap gap-1.5 items-center">
                                            {PREDEFINED_SIZES.map(size => {
                                              const isSel = selectedSizes.includes(size)
                                              const exists = existingForContainer(size)
                                              return (
                                                <button key={size} disabled={exists}
                                                  onClick={() => setSelectedSizes(s => s.includes(size) ? s.filter(x => x !== size) : [...s, size])}
                                                  title={exists ? 'Already exists' : ''}
                                                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${exists ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed' : isSel ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-gray-300 text-gray-600 hover:border-orange-400 hover:text-orange-600'}`}
                                                >
                                                  {size}
                                                </button>
                                              )
                                            })}
                                          </div>

                                          {selectedSizes.length > 0 && (
                                            <div className="flex items-center gap-3">
                                              <button onClick={() => handleBulkCreate(item.id)} disabled={bulkSubmitting}
                                                className="px-4 py-2 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-50">
                                                {bulkSubmitting ? 'Creating...' : `Create ${selectedSizes.length} ${quickContainer.name} Variant${selectedSizes.length > 1 ? 's' : ''}`}
                                              </button>
                                              <button onClick={() => setSelectedSizes([])} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                                              {bulkError   && <span className="text-xs text-red-600">{bulkError}</span>}
                                              {bulkSuccess  && <span className="text-xs text-green-600">{bulkSuccess}</span>}
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>

                                    {/* ── Existing variants list ── */}
                                    {variants.length > 0 && (
                                      <div>
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                                          Variants (SKUs) — {variants.length}
                                        </p>
                                        <div className="divide-y divide-gray-50 rounded-lg border border-gray-100 overflow-hidden">
                                          {variants.map(v => {
                                            const vol = parseFloat(v.volume)
                                            const volDisplay = Number.isInteger(vol) ? vol : vol
                                            return (
                                              <div key={v.id} className="flex items-center gap-3 px-4 py-2.5 bg-white hover:bg-gray-50/60 transition-colors">
                                                <ContainerIcon icon={unitIconFor(v.unit)} name={v.unit_name} className="w-4 h-4 text-gray-300 flex-shrink-0" />
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-bold tracking-wide">
                                                  {volDisplay} {v.volume_unit_symbol?.toUpperCase()}
                                                </span>
                                                <span className="text-xs text-gray-400">{v.unit_name}</span>
                                                {v.name && (
                                                  <span className="text-xs text-gray-600 font-medium truncate max-w-[180px]" title={v.name}>{v.name}</span>
                                                )}
                                                {editingCodeId === v.id ? (
                                                  <input
                                                    autoFocus
                                                    value={editingCodeVal}
                                                    onChange={e => setEditingCodeVal(e.target.value)}
                                                    onBlur={() => saveProductCode(v.id, item.id, editingCodeVal)}
                                                    onKeyDown={e => {
                                                      if (e.key === 'Enter') saveProductCode(v.id, item.id, editingCodeVal)
                                                      if (e.key === 'Escape') setEditingCodeId(null)
                                                    }}
                                                    className="px-2 py-0.5 rounded-md font-mono text-[10px] text-blue-600 bg-blue-50 border border-blue-300 w-28 outline-none focus:ring-1 focus:ring-blue-400"
                                                  />
                                                ) : v.product_code ? (
                                                  <button
                                                    onClick={() => { setEditingCodeId(v.id); setEditingCodeVal(v.product_code) }}
                                                    title="Click to edit product code"
                                                    className="px-2 py-0.5 rounded-md font-mono text-[10px] text-blue-600 bg-blue-50 border border-blue-100 font-semibold hover:border-blue-300 hover:bg-blue-100 transition-colors"
                                                  >
                                                    {v.product_code}
                                                  </button>
                                                ) : (
                                                  <button
                                                    onClick={() => { setEditingCodeId(v.id); setEditingCodeVal('') }}
                                                    className="px-2 py-0.5 rounded-md text-[10px] text-gray-400 bg-gray-50 border border-dashed border-gray-200 hover:border-blue-300 hover:text-blue-500 transition-colors"
                                                  >
                                                    + code
                                                  </button>
                                                )}
                                                {editingSkuId === v.id ? (
                                                  <input
                                                    autoFocus
                                                    value={editingSkuVal}
                                                    onChange={e => setEditingSkuVal(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                                                    onBlur={() => saveSkuCode(v.id, item.id, editingSkuVal)}
                                                    onKeyDown={e => {
                                                      if (e.key === 'Enter') saveSkuCode(v.id, item.id, editingSkuVal)
                                                      if (e.key === 'Escape') setEditingSkuId(null)
                                                    }}
                                                    className="px-2 py-0.5 rounded-md font-mono text-[10px] text-purple-600 bg-purple-50 border border-purple-300 w-32 outline-none focus:ring-1 focus:ring-purple-400"
                                                  />
                                                ) : v.sku_code ? (
                                                  <button
                                                    onClick={() => { setEditingSkuId(v.id); setEditingSkuVal(v.sku_code) }}
                                                    title="Click to edit SKU code"
                                                    className="px-2 py-0.5 rounded-md font-mono text-[10px] text-purple-600 bg-purple-50 border border-purple-100 font-semibold hover:border-purple-300 hover:bg-purple-100 transition-colors"
                                                  >
                                                    {v.sku_code}
                                                  </button>
                                                ) : (
                                                  <button
                                                    onClick={() => { setEditingSkuId(v.id); setEditingSkuVal('') }}
                                                    className="px-2 py-0.5 rounded-md text-[10px] text-gray-400 bg-gray-50 border border-dashed border-gray-200 hover:border-purple-300 hover:text-purple-500 transition-colors"
                                                  >
                                                    + SKU
                                                  </button>
                                                )}
                                                {!v.is_available && (
                                                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-gray-100 text-gray-400">Inactive</span>
                                                )}
                                                <div className="ml-auto flex items-center gap-1.5">
                                                  <button onClick={() => openEditVariant(v, item.id)} className="rounded-md bg-white border border-gray-200 px-2.5 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300">Edit</button>
                                                  <button onClick={() => deleteVariant(v.id, item.id)} className="rounded-md px-2.5 py-1 text-[10px] font-medium text-red-400 hover:text-red-600 hover:bg-red-50">Del</button>
                                                </div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )}

                                  </div>
                                )
                              })()}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)} className={`w-7 h-7 rounded text-xs font-medium ${page === p ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{p}</button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">›</button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── Product line modal ──────────────────────────────────────────────── */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">{editProduct ? 'Edit Product Line' : 'Add Product Line'}</h3>
              <button onClick={closeProductModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {productError && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{productError}</div>}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-gray-400 font-normal">(optional — defaults to base product name)</span></label>
                <input name="name" value={productForm.name} onChange={handleProductChange} placeholder="Leave blank to use base product name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea name="description" value={productForm.description} onChange={handleProductChange} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Base Product *</label>
                <select name="base_product" value={productForm.base_product} onChange={handleProductChange} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                  <option value="">Select base product</option>
                  {baseProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Product Group</label>
                  <select name="product_group" value={productForm.product_group} onChange={handleProductChange} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                    <option value="">None</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sub Group</label>
                  <select name="product_sub_group" value={productForm.product_sub_group} onChange={handleProductChange} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                    <option value="">None</option>
                    {subGroups.map(sg => <option key={sg.id} value={sg.id}>{sg.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Segment</label>
                  <select name="product_segment" value={productForm.product_segment} onChange={handleProductChange} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                    <option value="">None</option>
                    {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Available</p>
                  <p className="text-xs text-gray-400">Mark whether this product line is active</p>
                </div>
                <button type="button" onClick={() => setProductForm(f => ({ ...f, is_available: !f.is_available }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${productForm.is_available ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${productForm.is_available ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={closeProductModal} className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleProductSubmit} disabled={productSubmitting} className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {productSubmitting ? 'Saving...' : editProduct ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Variant modal ───────────────────────────────────────────────────── */}
      {variantModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">{editVariant ? 'Edit Variant' : 'Add Variant'}</h3>
              <button onClick={closeVariantModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {variantError && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{variantError}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Container Type (Unit) *</label>
                  <select name="unit" value={variantForm.unit} onChange={handleVariantChange} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                    <option value="">Select container unit</option>
                    {primaryUnits.map(u => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-0.5">Primary units (Bottle, Can, Pouch…)</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
                  <select name="material" value={variantForm.material} onChange={handleVariantChange} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                    <option value="">None</option>
                    {MATERIAL_CHOICES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Physical Volume</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Volume *</label>
                    <input name="volume" type="number" step="any" min="0" value={variantForm.volume} onChange={handleVariantChange} placeholder="e.g. 500" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Volume Unit *</label>
                    <select name="volume_unit" value={variantForm.volume_unit} onChange={handleVariantChange} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                      <option value="">Select unit</option>
                      {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-purple-100 bg-purple-50/20 p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Unit Conversion (optional)</p>
                <p className="text-[10px] text-gray-400">Auto-filled from volume — override if primary unit is a carton or crate</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Secondary Unit</label>
                    <select name="secondary_unit" value={variantForm.secondary_unit} onChange={handleVariantChange} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
                      <option value="">None</option>
                      {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Capacity (qty per primary)</label>
                    <input name="capacity_value" type="number" step="any" min="0" value={variantForm.capacity_value} onChange={handleVariantChange} placeholder="e.g. 24" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Base Qty per Unit *</label>
                  <input name="base_quantity" type="number" step="any" min="0" value={variantForm.base_quantity} onChange={handleVariantChange} placeholder="e.g. 0.5" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  <p className="text-[10px] text-gray-400 mt-0.5">Base product consumed per unit of this variant</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">SKU Code</label>
                  <input name="sku_code" value={variantForm.sku_code} onChange={handleVariantChange} placeholder="Auto-generated if left blank" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  <p className="text-[10px] text-gray-400 mt-0.5">Unique · uppercase · no spaces · auto-generated if blank, editable anytime</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Variant Name</label>
                <input name="name" value={variantForm.name} onChange={handleVariantChange} placeholder="e.g. 0.5 KG CHASIS GREASE CAN" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Product Code</label>
                <input name="product_code" value={variantForm.product_code} onChange={handleVariantChange} placeholder="e.g. E-G-150" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>

              <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Requires Sticker</p>
                    <p className="text-xs text-gray-400">Packaging orders must confirm sticker before completing</p>
                  </div>
                  <button type="button" onClick={() => setVariantForm(f => ({ ...f, added_sticker: !f.added_sticker }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${variantForm.added_sticker ? 'bg-amber-500' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${variantForm.added_sticker ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                {variantForm.added_sticker && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Sticker Name / Label</label>
                    <input name="sticker_name" value={variantForm.sticker_name} onChange={handleVariantChange} placeholder="e.g. Product Label v2" className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Available</p>
                  <p className="text-xs text-gray-400">Mark whether this variant is active</p>
                </div>
                <button type="button" onClick={() => setVariantForm(f => ({ ...f, is_available: !f.is_available }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${variantForm.is_available ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${variantForm.is_available ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={closeVariantModal} className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleVariantSubmit} disabled={variantSubmitting} className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {variantSubmitting ? 'Saving...' : editVariant ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOM Modal */}
      {bomVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Stickers &amp; Caps Requirement</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">{bomVariant.volume}{bomVariant.volume_unit_symbol} {bomVariant.unit_name} — materials per unit</p>
              </div>
              <button onClick={() => setBomVariant(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {bomError && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{bomError}</div>}

              {/* Existing BOM lines */}
              {bomLines.length > 0 ? (
                <div className="space-y-1.5">
                  {bomLines.map(line => (
                    <div key={line.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-teal-50 border border-teal-100">
                      <div>
                        <span className="text-xs font-semibold text-teal-800">{line.material_name}</span>
                        <span className="text-[10px] text-teal-500 ml-1">({line.material_type})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-teal-700">{parseFloat(line.quantity_per_unit)} <span className="font-normal text-teal-400">{line.unit_symbol}</span></span>
                        <button onClick={() => deleteBomLine(line.id)} className="text-red-400 hover:text-red-600 text-xs px-1.5 py-0.5 rounded hover:bg-red-50">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic text-center py-3">No packaging materials defined yet.</p>
              )}

              {/* Add new BOM line */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Add Material</p>
                <div className="flex gap-2">
                  <select value={newBomMaterial} onChange={e => setNewBomMaterial(e.target.value)} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-teal-500 outline-none">
                    <option value="">Select consumable...</option>
                    {bomConsumables.filter(c => !bomLines.some(l => l.material === c.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.unit_symbol})</option>
                    ))}
                  </select>
                  <input type="number" step="any" min="0" placeholder="Qty/unit" value={newBomQty} onChange={e => setNewBomQty(e.target.value)} onWheel={e => e.target.blur()} className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-teal-500 outline-none" />
                  <button onClick={addBomLine} disabled={bomSubmitting || !newBomMaterial || !newBomQty} className="rounded-lg bg-teal-500 px-3 py-2 text-xs font-bold text-white hover:bg-teal-600 disabled:opacity-50">Add</button>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-slate-50/30">
              <button onClick={() => setBomVariant(null)} className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-bold text-white hover:bg-orange-600">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FinishedProductsPage
