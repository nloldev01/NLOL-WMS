import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch, getApiError } from '../utils/api'
import PalletLabelModal from '../components/PalletLabelModal'

const PAGE_SIZE = 15

const BATCH_TYPE_CONFIG = {
  FIN: { label: 'Finished Goods',  color: 'bg-green-50 text-green-700 border-green-200' },
  PRD: { label: 'Production Goods', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  RAW: { label: 'Raw Materials',    color: 'bg-amber-50 text-amber-700 border-amber-200' },
}

function StatCard({ label, value, valueColor = 'text-gray-800', bg = 'bg-white', isActive, onClick }) {
  return (
    <button onClick={onClick}
      className={`rounded-xl p-4 text-left shadow-sm border transition-all ${bg} ${isActive ? 'ring-2 ring-orange-400 border-orange-300' : 'border-transparent hover:shadow-md'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueColor}`}>{value}</p>
    </button>
  )
}

export default function PalletsPage() {
  // ── List state ─────────────────────────────────────────────────────────────
  const [pallets, setPallets]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [sealedFilter, setSealedFilter] = useState('')
  const [filterOpen, setFilterOpen]     = useState(false)
  const [activeCard, setActiveCard]     = useState('')
  const [page, setPage]                 = useState(1)
  const [error, setError]               = useState('')
  const filterRef                       = useRef(null)

  // ── Drawer: null=closed | 'new'=create mode | {pallet}=edit mode ───────────
  const [drawer, setDrawer]             = useState(null)
  const [activeTab, setActiveTab]       = useState('scan')
  const [actionLoading, setActionLoading] = useState(null)
  const [actionError, setActionError]   = useState('')
  const [labelPallet, setLabelPallet]   = useState(null)
  const [labelLoading, setLabelLoading] = useState(null)

  // ── Scan tab ───────────────────────────────────────────────────────────────
  const [scanCode, setScanCode]         = useState('')
  const [scanQty, setScanQty]           = useState('1')
  const [scanError, setScanError]       = useState('')
  const [scanLoading, setScanLoading]   = useState(false)
  const scanInputRef                    = useRef(null)

  // ── Location tab ───────────────────────────────────────────────────────────
  const [allLocations, setAllLocations]       = useState([])
  const [locQuery, setLocQuery]               = useState('')
  const [locDropOpen, setLocDropOpen]         = useState(false)
  const [locLoading, setLocLoading]           = useState(false)
  const [locStockLoading, setLocStockLoading] = useState(false)
  const [locError, setLocError]               = useState('')
  const [locData, setLocData]                 = useState(null)
  const [locStock, setLocStock]               = useState([])
  const [locSelected, setLocSelected]         = useState(new Map())
  const [locAddLoading, setLocAddLoading]     = useState(false)
  const [transferDestMode, setTransferDestMode] = useState(false)
  const [transferDestQuery, setTransferDestQuery] = useState('')
  const [transferDest, setTransferDest]       = useState(null)
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferResult, setTransferResult]   = useState(null)

  // ── New pallet: pending items before creation ──────────────────────────────
  const [pendingItems, setPendingItems] = useState([])
  const [newNotes, setNewNotes]         = useState('')
  const [creating, setCreating]         = useState(false)
  const [createError, setCreateError]   = useState('')

  useEffect(() => { fetchPallets() }, [search, sealedFilter])

  useEffect(() => {
    const h = e => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const fetchPallets = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)       params.append('search', search)
      if (sealedFilter) params.append('is_sealed', sealedFilter)
      const res = await apiFetch(`/inventory-core/pallets/?${params}`)
      if (res?.ok) { const d = await res.json(); setPallets(Array.isArray(d) ? d : (d.results ?? [])) }
      else setPallets([])
    } catch { setError('Failed to load pallets') }
    finally { setLoading(false) }
  }

  // ── Drawer open/close ──────────────────────────────────────────────────────

  const openNew = async () => {
    setDrawer('new'); setActiveTab('scan')
    setPendingItems([]); setNewNotes(''); setCreateError('')
    resetScan(); resetLoc()
    await loadLocations()
    setTimeout(() => scanInputRef.current?.focus(), 100)
  }

  const openEdit = (pallet) => {
    setDrawer(pallet); setActiveTab('scan')
    resetScan(); resetLoc(); setActionError('')
  }

  const closeDrawer = () => { setDrawer(null); resetScan(); setLabelPallet(null) }

  const resetScan = () => { setScanCode(''); setScanQty('1'); setScanError('') }

  const resetLoc = () => {
    setLocQuery(''); setLocData(null); setLocStock([])
    setLocSelected(new Map()); setLocError(''); setLocDropOpen(false)
    setTransferDestMode(false); setTransferDestQuery(''); setTransferDest(null)
    setTransferResult(null); setTransferLoading(false)
  }

  // ── Location helpers ───────────────────────────────────────────────────────

  const loadLocations = async () => {
    if (allLocations.length > 0) return
    setLocLoading(true)
    try {
      const res = await apiFetch('/inventory-core/transfers/locations/')
      if (res?.ok) setAllLocations(await res.json())
    } catch { /* silent */ }
    finally { setLocLoading(false) }
  }

  const handleLocSelect = async (loc) => {
    setLocQuery(loc.label); setLocDropOpen(false)
    setLocData(loc); setLocStock([]); setLocSelected(new Map()); setLocError('')
    setLocStockLoading(true)
    try {
      const res = await apiFetch(`/inventory-core/pallets/location-stock/?location_id=${loc.id}`)
      if (res?.ok) setLocStock(await res.json())
      else setLocError(await getApiError(res))
    } catch { setLocError('Connection error') }
    finally { setLocStockLoading(false) }
  }

  const toggleLocSelect = (row) => {
    setLocSelected(prev => {
      const next = new Map(prev)
      if (next.has(row.lpn_id)) next.delete(row.lpn_id)
      else next.set(row.lpn_id, row.available_qty)
      return next
    })
  }

  const handleLocAdd = async () => {
    if (locSelected.size === 0) return
    const items = Array.from(locSelected.entries())
      .map(([lpn_id, qty]) => ({ lpn_id, quantity: parseFloat(qty) || 0 }))
      .filter(i => i.quantity > 0)

    if (drawer === 'new') {
      const stockMap = Object.fromEntries(locStock.map(r => [r.lpn_id, r]))
      setPendingItems(prev => {
        const next = [...prev]
        for (const item of items) {
          const idx = next.findIndex(p => p.lpn_id === item.lpn_id)
          if (idx >= 0) next[idx] = { ...next[idx], quantity: parseFloat(next[idx].quantity) + item.quantity }
          else {
            const r = stockMap[item.lpn_id]
            next.push({ lpn_id: item.lpn_id, lpn_code: r?.lpn_code, quantity: item.quantity, item_label: r?.item_label, batch_type: r?.stock_type, batch_code: r?.batch_code })
          }
        }
        return next
      })
      setLocSelected(new Map())
    } else {
      setLocAddLoading(true); setActionError('')
      try {
        const res = await apiFetch(`/inventory-core/pallets/${drawer.id}/bulk-add-items/`, {
          method: 'POST', body: JSON.stringify({ items }),
        })
        if (res?.ok) { setDrawer(await res.json()); fetchPallets(); setLocSelected(new Map()) }
        else setActionError(await getApiError(res))
      } catch { setActionError('Connection error') }
      finally { setLocAddLoading(false) }
    }
  }

  const handleLocTransfer = async () => {
    if (!transferDest || locSelected.size === 0) return
    const items = Array.from(locSelected.entries()).map(([lpn_id, qty]) => {
      const row = locStock.find(r => r.lpn_id === lpn_id)
      return {
        stock_type: row.stock_type,
        variant_id: row.variant_id ?? null,
        product_id: row.product_id ?? null,
        material_id: row.material_id ?? null,
        batch_id: row.batch_id ?? null,
        lpn_id,
        quantity: parseFloat(qty) || 0,
        from_location_id: locData.id,
        item_label: row.item_label,
      }
    }).filter(i => i.quantity > 0)

    setTransferLoading(true); setTransferResult(null)
    try {
      const res = await apiFetch('/inventory-core/transfers/execute/', {
        method: 'POST',
        body: JSON.stringify({ to_location: transferDest.id, items }),
      })
      if (res?.ok) {
        const data = await res.json()
        setTransferResult({ ok: true, count: data.transferred ?? items.length })
        setLocSelected(new Map()); setTransferDest(null); setTransferDestMode(false)
        setTransferDestQuery(''); fetchPallets()
        // reload stock for source location so counts update
        setLocStockLoading(true)
        try {
          const r2 = await apiFetch(`/inventory-core/pallets/location-stock/?location_id=${locData.id}`)
          if (r2?.ok) setLocStock(await r2.json())
        } catch { /* silent */ }
        finally { setLocStockLoading(false) }
      } else {
        setTransferResult({ error: await getApiError(res) })
      }
    } catch { setTransferResult({ error: 'Connection error' }) }
    finally { setTransferLoading(false) }
  }

  // ── Scan handler ───────────────────────────────────────────────────────────

  const handleScan = async () => {
    const code = scanCode.trim()
    const qty  = parseFloat(scanQty)
    if (!code) { setScanError('Scan or enter an LPN code.'); return }
    if (!qty || qty <= 0) { setScanError('Quantity must be > 0.'); return }
    setScanError(''); setScanLoading(true)

    if (drawer === 'new') {
      try {
        const res = await apiFetch(`/inventory-core/transfers/scan/?qr=${encodeURIComponent(code)}`)
        if (!res?.ok) { setScanError(await getApiError(res)); return }
        const { type, data } = await res.json()
        if (type !== 'lpn') { setScanError('Not a valid LPN code.'); return }
        setPendingItems(prev => {
          const next = [...prev]
          const idx = next.findIndex(p => p.lpn_id === data.lpn_id)
          if (idx >= 0) next[idx] = { ...next[idx], quantity: parseFloat(next[idx].quantity) + qty }
          else next.push({ lpn_id: data.lpn_id, lpn_code: data.lpn_code, quantity: qty, item_label: data.item_label, batch_type: data.batch_type, batch_code: data.batch_code })
          return next
        })
        setScanCode(''); setScanQty('1')
        setTimeout(() => scanInputRef.current?.focus(), 50)
      } catch { setScanError('Connection error') }
      finally { setScanLoading(false) }
    } else {
      try {
        const res = await apiFetch(`/inventory-core/pallets/${drawer.id}/add-item/`, {
          method: 'POST', body: JSON.stringify({ lpn_code: code, quantity: qty }),
        })
        if (res?.ok) {
          setDrawer(await res.json()); fetchPallets()
          setScanCode(''); setScanQty('1')
          setTimeout(() => scanInputRef.current?.focus(), 50)
        } else setScanError(await getApiError(res))
      } catch { setScanError('Connection error') }
      finally { setScanLoading(false) }
    }
  }

  // ── Create pallet (new mode) ───────────────────────────────────────────────

  const handleCreate = async () => {
    if (pendingItems.length === 0) { setCreateError('Add at least one item.'); return }
    setCreating(true); setCreateError('')
    try {
      const res = await apiFetch('/inventory-core/pallets/create-from-location/', {
        method: 'POST',
        body: JSON.stringify({
          items: pendingItems.map(i => ({ lpn_id: i.lpn_id, quantity: parseFloat(i.quantity) })),
          notes: newNotes,
        }),
      })
      if (res?.ok) {
        const data = await res.json()
        await fetchPallets()
        openEdit(data)
      } else setCreateError(await getApiError(res))
    } catch { setCreateError('Connection error') }
    finally { setCreating(false) }
  }

  // ── Seal / Unseal / Remove ─────────────────────────────────────────────────

  const handleSeal = async () => {
    setActionLoading('seal')
    try {
      const res = await apiFetch(`/inventory-core/pallets/${drawer.id}/seal/`, { method: 'POST' })
      if (res?.ok) { setDrawer(await res.json()); fetchPallets() }
      else setActionError(await getApiError(res))
    } catch { setActionError('Connection error') }
    finally { setActionLoading(null) }
  }

  const handleUnseal = async () => {
    setActionLoading('unseal')
    try {
      const res = await apiFetch(`/inventory-core/pallets/${drawer.id}/unseal/`, { method: 'POST' })
      if (res?.ok) { setDrawer(await res.json()); fetchPallets() }
      else setActionError(await getApiError(res))
    } catch { setActionError('Connection error') }
    finally { setActionLoading(null) }
  }

  const handleTableQr = async (pallet) => {
    setLabelLoading(pallet.id)
    try {
      const res = await apiFetch(`/inventory-core/pallets/${pallet.id}/`)
      if (res?.ok) setLabelPallet(await res.json())
    } catch { /* silent */ }
    finally { setLabelLoading(null) }
  }

  const handleDelete = async () => {
    if (!isEdit) return
    if (!window.confirm(`Delete pallet ${drawer.pallet_code}? This cannot be undone.`)) return
    setActionLoading('delete')
    try {
      const res = await apiFetch(`/inventory-core/pallets/${drawer.id}/`, { method: 'DELETE' })
      if (res?.ok || res?.status === 204) { closeDrawer(); fetchPallets() }
      else setActionError(await getApiError(res))
    } catch { setActionError('Connection error') }
    finally { setActionLoading(null) }
  }

  const handleRemoveItem = async (itemId) => {
    setActionLoading(`remove-${itemId}`)
    try {
      const res = await apiFetch(`/inventory-core/pallets/${drawer.id}/remove-item/${itemId}/`, { method: 'DELETE' })
      if (res?.ok) setDrawer(await res.json())
      else setActionError(await getApiError(res))
    } catch { setActionError('Connection error') }
    finally { setActionLoading(null) }
  }

  // ── Stats & pagination ─────────────────────────────────────────────────────

  const stats = {
    total:  pallets.length,
    open:   pallets.filter(p => !p.is_sealed).length,
    sealed: pallets.filter(p => p.is_sealed).length,
  }

  const handleCardClick = (card) => {
    if (activeCard === card) { setActiveCard(''); setSealedFilter(''); setPage(1); return }
    setActiveCard(card); setPage(1)
    setSealedFilter({ total: '', open: 'false', sealed: 'true' }[card] ?? '')
  }

  const paginated  = pallets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(pallets.length / PAGE_SIZE))

  const isNew  = drawer === 'new'
  const isEdit = drawer && drawer !== 'new'
  const canAdd = isNew || (isEdit && !drawer.is_sealed)

  const alreadyAddedLpnIds = new Set(
    isNew
      ? pendingItems.map(i => i.lpn_id)
      : (isEdit ? (drawer.items || []).map(i => i.lpn) : [])
  )
  const eligibleLocStock  = locStock.filter(r => r.lpn_id !== null && r.available_qty > 0 && !alreadyAddedLpnIds.has(r.lpn_id))
  const filteredLocations = allLocations.filter(l =>
    !locQuery.trim() ||
    l.label.toLowerCase().includes(locQuery.toLowerCase()) ||
    (l.short_code && l.short_code.toLowerCase().includes(locQuery.toLowerCase()))
  )

  const filteredTransferDests = allLocations.filter(l =>
    l.id !== locData?.id &&
    (!transferDestQuery.trim() ||
      l.label.toLowerCase().includes(transferDestQuery.toLowerCase()) ||
      (l.short_code && l.short_code.toLowerCase().includes(transferDestQuery.toLowerCase())))
  )

  const handleTabSwitch = async (tab) => {
    setActiveTab(tab)
    if (tab === 'location') await loadLocations()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className={`transition-all duration-300 ${drawer ? 'mr-[440px]' : ''} md:ml-16`}>
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Inventory / Pallets</p>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard label="Total"  value={stats.total}  valueColor="text-gray-800"  isActive={activeCard === 'total'}  onClick={() => handleCardClick('total')} />
            <StatCard label="Open"   value={stats.open}   valueColor="text-amber-600" bg="bg-amber-50" isActive={activeCard === 'open'}   onClick={() => handleCardClick('open')} />
            <StatCard label="Sealed" value={stats.sealed} valueColor="text-green-700" bg="bg-green-50" isActive={activeCard === 'sealed'} onClick={() => handleCardClick('sealed')} />
          </div>

          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Pallets</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Group LPNs under a single scannable pallet code</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search pallets…"
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-44" />
                </div>
                <div className="relative" ref={filterRef}>
                  <button onClick={() => setFilterOpen(o => !o)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${sealedFilter ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    Filters {sealedFilter && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] text-white font-semibold">1</span>}
                  </button>
                  {filterOpen && (
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-xl bg-white border border-gray-200 shadow-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">Filters</p>
                        {sealedFilter && <button onClick={() => { setSealedFilter(''); setActiveCard(''); setPage(1) }} className="text-[10px] text-orange-500 hover:underline">Clear</button>}
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Status</label>
                        <select value={sealedFilter} onChange={e => { setSealedFilter(e.target.value); setActiveCard(''); setPage(1) }}
                          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300">
                          <option value="">All</option>
                          <option value="false">Open</option>
                          <option value="true">Sealed</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={openNew}
                  className="rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-orange-600 transition-colors">
                  + New Pallet
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-gray-400 text-sm">Loading…</div>
            ) : error ? (
              <div className="p-10 text-center text-red-500 text-sm">{error}</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-primary text-white text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 w-10">No</th>
                    <th className="px-4 py-3">Pallet #</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created By</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-400 italic">No pallets found.</td></tr>
                  ) : paginated.map((pallet, idx) => (
                    <tr key={pallet.id}
                      className={`hover:bg-gray-50 transition-colors cursor-pointer ${isEdit && drawer.id === pallet.id ? 'bg-orange-50' : ''}`}
                      onClick={() => openEdit(pallet)}>
                      <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{pallet.pallet_code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold ${pallet.total_items > 0 ? 'text-gray-800' : 'text-gray-300'}`}>{pallet.total_items}</span>
                        <span className="text-[10px] text-gray-400 ml-1">items</span>
                      </td>
                      <td className="px-4 py-3">
                        {pallet.is_sealed
                          ? <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-green-50 text-green-700">Sealed</span>
                          : <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-600">Open</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{pallet.created_by_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(pallet.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleTableQr(pallet)}
                          disabled={labelLoading === pallet.id}
                          title="Print label"
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-orange-50 hover:text-orange-500 hover:border-orange-200 disabled:opacity-40 transition-colors">
                          {labelLoading === pallet.id
                            ? <span className="text-[10px]">…</span>
                            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                              </svg>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {pallets.length === 0 ? '0' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, pallets.length)}`} of {pallets.length} pallets
              </p>
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

      {labelPallet && (
        <PalletLabelModal pallet={labelPallet} onClose={() => setLabelPallet(null)} />
      )}

      {/* ── Right Drawer ──────────────────────────────────────────────────────── */}
      {drawer && (
        <div className="fixed right-0 top-0 h-full w-[440px] bg-white shadow-2xl border-l border-gray-200 z-40 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 shrink-0">
            <div className="flex-1 min-w-0">
              {isNew ? (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">New Pallet</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">{pendingItems.length} item{pendingItems.length !== 1 ? 's' : ''} queued</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded">
                      {drawer.pallet_code}
                    </span>
                    {drawer.is_sealed
                      ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200">Sealed</span>
                      : <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">Open</span>}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {drawer.total_items} item{drawer.total_items !== 1 ? 's' : ''} · {new Date(drawer.created_at).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 ml-3 shrink-0">
              {isEdit && (
                <>
                  <button onClick={() => setLabelPallet(drawer)}
                    title="Print label"
                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-orange-50 hover:text-orange-500 hover:border-orange-200 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                  </button>
                  <button onClick={handleDelete} disabled={actionLoading === 'delete'}
                    title="Delete pallet"
                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 disabled:opacity-50 transition-colors">
                    {actionLoading === 'delete'
                      ? <span className="text-xs">…</span>
                      : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>}
                  </button>
                  {drawer.is_sealed ? (
                    <button onClick={handleUnseal} disabled={!!actionLoading}
                      className="text-xs px-3 py-1.5 rounded-lg border border-amber-400 text-amber-600 hover:bg-amber-50 disabled:opacity-50 transition-colors">
                      {actionLoading === 'unseal' ? '…' : 'Unseal'}
                    </button>
                  ) : (
                    <button onClick={handleSeal} disabled={!!actionLoading}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 transition-colors">
                      {actionLoading === 'seal' ? '…' : 'Seal'}
                    </button>
                  )}
                </>
              )}
              <button onClick={closeDrawer} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
          </div>

          {actionError && (
            <div className="mx-5 mt-3 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg shrink-0">{actionError}</div>
          )}

          {/* Tabs — Scan / From Location (only when editable) */}
          {canAdd && (
            <div className="flex border-b border-gray-100 shrink-0">
              {[['scan', 'Scan / LPN'], ['location', 'From Location']].map(([tab, label]) => (
                <button key={tab} onClick={() => handleTabSwitch(tab)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${activeTab === tab ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-600'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">

            {/* ── Scan tab ── */}
            {canAdd && activeTab === 'scan' && (
              <div className="px-5 py-4 space-y-3 shrink-0">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">LPN Code</label>
                  <input ref={scanInputRef} value={scanCode} onChange={e => setScanCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleScan()}
                    placeholder="Scan or type LPN code…"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Quantity</label>
                    <input type="number" min="0.0001" step="any" value={scanQty} onChange={e => setScanQty(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleScan()}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <button onClick={handleScan} disabled={scanLoading}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
                    {scanLoading ? '…' : isNew ? '+ Queue' : '+ Add'}
                  </button>
                </div>
                {scanError && <p className="text-xs text-red-600">{scanError}</p>}
                <p className="text-[10px] text-gray-400">Press Enter to add · Compatible with barcode scanners</p>
              </div>
            )}

            {/* ── Location tab ── */}
            {canAdd && activeTab === 'location' && (
              <div className="flex flex-col min-h-0 flex-1">
                {/* Location combobox */}
                <div className="px-5 py-3 shrink-0">
                  {locLoading ? (
                    <p className="text-xs text-gray-400 py-1">Loading locations…</p>
                  ) : (
                    <div className="relative">
                      <input type="text" placeholder="Search location…" value={locQuery}
                        onChange={e => { setLocQuery(e.target.value); if (locData) { setLocData(null); setLocStock([]); setLocSelected(new Map()) } }}
                        onFocus={() => setLocDropOpen(true)}
                        onBlur={() => setTimeout(() => setLocDropOpen(false), 150)}
                        className={`w-full rounded-lg border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 ${locData ? 'border-orange-300 bg-orange-50 font-medium text-orange-700' : 'border-gray-200'}`}
                        autoFocus={activeTab === 'location'}
                      />
                      {locDropOpen && filteredLocations.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto divide-y divide-gray-50">
                          {filteredLocations.map(loc => (
                            <button key={loc.id} onMouseDown={() => handleLocSelect(loc)}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-orange-50 transition-colors flex items-center gap-2">
                              <span className="font-medium text-gray-800 flex-1">{loc.label}</span>
                              <span className="font-mono text-[10px] text-gray-400">{loc.short_code}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {locError && <p className="mt-1 text-xs text-red-600">{locError}</p>}
                    </div>
                  )}
                </div>

                {/* Stock table */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  {!locData ? (
                    <div className="p-8 text-center text-gray-300 text-xs italic">Select a location above</div>
                  ) : locStockLoading ? (
                    <div className="p-8 text-center text-gray-400 text-xs">Loading stock…</div>
                  ) : locStock.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-xs italic">No stock at this location.</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase sticky top-0">
                        <tr>
                          <th className="px-3 py-2 w-8">
                            <input type="checkbox"
                              checked={eligibleLocStock.length > 0 && locSelected.size === eligibleLocStock.length}
                              onChange={e => setLocSelected(e.target.checked
                                ? new Map(eligibleLocStock.map(r => [r.lpn_id, r.available_qty]))
                                : new Map())} />
                          </th>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {locStock.map((row, i) => {
                          const hasLpn      = !!row.lpn_id
                          const alreadyAdded = alreadyAddedLpnIds.has(row.lpn_id)
                          const canSelect   = hasLpn && !alreadyAdded && row.available_qty > 0
                          const isChk       = locSelected.has(row.lpn_id)
                          const tc          = BATCH_TYPE_CONFIG[row.stock_type] || { label: row.stock_type, color: 'bg-gray-50 text-gray-600 border-gray-200' }
                          return (
                            <tr key={i}
                              className={`transition-colors ${canSelect ? 'cursor-pointer hover:bg-gray-50' : 'opacity-50'} ${isChk ? 'bg-orange-50' : ''}`}
                              onClick={() => canSelect && toggleLocSelect(row)}>
                              <td className="px-3 py-2">
                                <input type="checkbox" disabled={!canSelect} checked={isChk || alreadyAdded}
                                  onChange={() => canSelect && toggleLocSelect(row)} onClick={e => e.stopPropagation()} />
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1 mb-0.5">
                                  <span className={`px-1 py-0.5 rounded text-[9px] font-bold border ${tc.color}`}>{tc.label}</span>
                                  <span className="font-mono text-[10px] text-gray-500">{row.lpn_code}</span>
                                </div>
                                <p className="text-[11px] text-gray-800 font-medium truncate max-w-[180px]">{row.item_label}</p>
                                <p className="text-[10px] text-gray-400">{row.batch_code}</p>
                              </td>
                              <td className="px-3 py-2 text-right" onClick={e => isChk && e.stopPropagation()}>
                                {isChk ? (
                                  <input type="number" min="0.0001" step="any" value={locSelected.get(row.lpn_id)}
                                    onChange={e => { const n = new Map(locSelected); n.set(row.lpn_id, e.target.value); setLocSelected(n) }}
                                    className="w-16 text-right rounded border border-orange-200 bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-300"
                                    onClick={e => e.stopPropagation()} />
                                ) : (
                                  <span className={`font-semibold ${alreadyAdded ? 'text-gray-400' : 'text-gray-700'}`}>
                                    {row.available_qty}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {alreadyAdded ? (
                                  <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-green-50 text-green-700 border border-green-200 whitespace-nowrap">Added</span>
                                ) : row.palletized_qty > 0 ? (
                                  <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">{row.palletized_qty} palletized</span>
                                ) : null}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Action footer — add to pallet / transfer */}
                {locSelected.size > 0 && (
                  <div className="px-5 py-3 border-t border-gray-100 shrink-0 space-y-2">

                    {transferResult?.ok && (
                      <p className="text-xs text-center font-semibold text-green-600">
                        ✓ Transferred {transferResult.count} item{transferResult.count !== 1 ? 's' : ''} successfully
                      </p>
                    )}
                    {transferResult?.error && (
                      <p className="text-xs text-center text-red-500">{transferResult.error}</p>
                    )}

                    {!transferDestMode ? (
                      <div className="flex gap-2">
                        <button onClick={handleLocAdd} disabled={locAddLoading}
                          className="flex-1 py-2 text-xs font-bold rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
                          {locAddLoading
                            ? 'Adding…'
                            : isNew
                              ? `Queue ${locSelected.size} Item${locSelected.size !== 1 ? 's' : ''}`
                              : `Add ${locSelected.size} Item${locSelected.size !== 1 ? 's' : ''} to Pallet`}
                        </button>
                        <button onClick={() => { setTransferDestMode(true); setTransferResult(null) }}
                          className="flex-1 py-2 text-xs font-bold rounded-lg border border-blue-400 text-blue-600 hover:bg-blue-50 transition-colors">
                          Transfer →
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Transfer to location</p>
                          <button onClick={() => { setTransferDestMode(false); setTransferDestQuery(''); setTransferDest(null); setTransferResult(null) }}
                            className="text-[10px] text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>

                        <input
                          type="text"
                          placeholder="Search destination…"
                          value={transferDestQuery}
                          onChange={e => { setTransferDestQuery(e.target.value); setTransferDest(null) }}
                          autoFocus
                          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />

                        <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
                          {filteredTransferDests.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-gray-400 italic">No locations found</p>
                          ) : filteredTransferDests.map(loc => (
                            <button key={loc.id} onClick={() => setTransferDest(loc)}
                              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-blue-50 transition-colors ${transferDest?.id === loc.id ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-700'}`}>
                              <span>{loc.label}</span>
                              <span className="font-mono text-[10px] text-gray-400">{loc.short_code}</span>
                            </button>
                          ))}
                        </div>

                        {transferDest && (
                          <button onClick={handleLocTransfer} disabled={transferLoading}
                            className="w-full py-2 text-xs font-bold rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors">
                            {transferLoading
                              ? 'Transferring…'
                              : `Transfer ${locSelected.size} item${locSelected.size !== 1 ? 's' : ''} → ${transferDest.label}`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Items list ── */}
            <div className="px-5 py-4 space-y-2 shrink-0">
              {isNew ? (
                <>
                  {pendingItems.length > 0 && (
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                      Queued ({pendingItems.length})
                    </p>
                  )}
                  {pendingItems.map((item, i) => {
                    const tc = BATCH_TYPE_CONFIG[item.batch_type] || { label: item.batch_type, color: 'bg-gray-50 text-gray-600 border-gray-200' }
                    return (
                      <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl px-3 py-3 border border-gray-100">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${tc.color}`}>{tc.label}</span>
                            <span className="font-mono text-[10px] font-semibold text-gray-700">{item.lpn_code}</span>
                            <span className="font-mono text-[9px] text-gray-400">{item.batch_code}</span>
                          </div>
                          <p className="text-xs font-medium text-gray-800 truncate">{item.item_label}</p>
                          <p className="text-[10px] text-gray-400">Qty: {item.quantity}</p>
                        </div>
                        <button onClick={() => setPendingItems(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-500 text-base leading-none mt-0.5 transition-colors" title="Remove">×</button>
                      </div>
                    )
                  })}
                </>
              ) : (
                <>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                    Items ({drawer.items?.length ?? 0})
                  </p>
                  {!drawer.items?.length ? (
                    <p className="text-xs text-gray-400 italic py-2">No items yet.</p>
                  ) : drawer.items.map(item => {
                    const tc = BATCH_TYPE_CONFIG[item.batch_type] || { label: item.batch_type, color: 'bg-gray-50 text-gray-600 border-gray-200' }
                    return (
                      <div key={item.id} className="flex items-start gap-3 bg-gray-50 rounded-xl px-3 py-3 border border-gray-100">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${tc.color}`}>{tc.label}</span>
                            <span className="font-mono text-[10px] font-semibold text-gray-700">{item.lpn_code}</span>
                            <span className="font-mono text-[9px] text-gray-400">{item.batch_code}</span>
                          </div>
                          <p className="text-xs font-medium text-gray-800 truncate">{item.item_label}</p>
                          <p className="text-[10px] text-gray-400">Qty: {item.quantity}</p>
                        </div>
                        {!drawer.is_sealed && (
                          <button onClick={() => handleRemoveItem(item.id)} disabled={actionLoading === `remove-${item.id}`}
                            className="text-gray-300 hover:text-red-500 text-base leading-none mt-0.5 disabled:opacity-50 transition-colors" title="Remove">
                            {actionLoading === `remove-${item.id}` ? '…' : '×'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {drawer.notes && (
                    <div className="mt-2">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                      <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3">{drawer.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Footer — create pallet button (new mode only) */}
          {isNew && (
            <div className="px-5 py-4 border-t border-gray-100 shrink-0 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Notes (optional)</label>
                <input type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)}
                  placeholder="Pallet notes…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              {createError && <p className="text-xs text-red-600">{createError}</p>}
              <button onClick={handleCreate} disabled={creating || pendingItems.length === 0}
                className="w-full py-2.5 text-xs font-bold rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
                {creating ? 'Creating Pallet…' : `Create Pallet (${pendingItems.length} item${pendingItems.length !== 1 ? 's' : ''})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

