import { useState, useEffect } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch } from '../utils/api'
import {
  MagnifyingGlassIcon,
  MapIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline'

const InventoryExplorerPage = () => {
  const [locations, setLocations]         = useState([])
  const [rawStock, setRawStock]           = useState([])
  const [productStock, setProductStock]   = useState([])
  const [finishedStock, setFinishedStock] = useState([])
  const [loading, setLoading]             = useState(true)
  const [searchQuery, setSearchQuery]     = useState('')
  const [selectedReportLocation, setSelectedReportLocation] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [locRes, rawRes, prodRes, fpRes] = await Promise.all([
        apiFetch('/master-data/locations/'),
        apiFetch('/raw-materials-stock/stock/'),
        apiFetch('/products-stock/stock/'),
        apiFetch('/products-stock/finished-product-stock/')
      ])

      if (locRes && rawRes && prodRes && fpRes) {
        const [locData, rawData, prodData, fpData] = await Promise.all([
          locRes.json(),
          rawRes.json(),
          prodRes.json(),
          fpRes.json()
        ])
        setLocations(locData)
        setRawStock(Array.isArray(rawData) ? rawData : (rawData.results ?? []))
        setProductStock(Array.isArray(prodData) ? prodData : (prodData.results ?? []))
        setFinishedStock(Array.isArray(fpData) ? fpData : (fpData.results ?? []))
      }
    } catch (error) {
      console.error('Error fetching inventory data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getDescendantLocationIds = (parentId) => {
    const ids = []
    const queue = [parentId]
    while (queue.length > 0) {
      const current = queue.shift()
      ids.push(current)
      const children = locations.filter(l => l.parent === current).map(l => l.id)
      queue.push(...children)
    }
    return ids
  }

  const getStockForLocation = (locationId) => {
    const locationIds = getDescendantLocationIds(locationId)
    const raw      = rawStock.filter(s => locationIds.includes(s.location) && parseFloat(s.quantity) > 0)
    const prod     = productStock.filter(s => locationIds.includes(s.location) && parseFloat(s.quantity) > 0)
    const finished = finishedStock.filter(s => locationIds.includes(s.location) && parseFloat(s.quantity) > 0)
    return { raw, prod, finished }
  }

  const getItemName = (item) => {
    if (item.type === 'raw')      return item.material_name
    if (item.type === 'prod')     return item.product_name
    return item.finished_product_variant_label || item.finished_product_name
  }

  const groupStockItems = (items) => {
    const grouped = {}
    items.forEach(item => {
      const name = getItemName(item)
      const key = `${item.type}||${name}||${item.unit || ''}`
      const batchLabel = item.batch_code || item.lpn_code || 'NO_BATCH'

      if (!grouped[key]) {
        grouped[key] = {
          ...item,
          quantity: parseFloat(item.quantity),
          secondary_quantity: parseFloat(item.secondary_quantity || 0),
          locations: [item.location],
          batchLabels: new Set([batchLabel])
        }
      } else {
        grouped[key].quantity += parseFloat(item.quantity)
        grouped[key].secondary_quantity += parseFloat(item.secondary_quantity || 0)
        grouped[key].locations.push(item.location)
        grouped[key].batchLabels.add(batchLabel)
      }
    })
    return Object.values(grouped).map(item => ({
      ...item,
      quantity: item.quantity.toString(),
      secondary_quantity: item.secondary_quantity.toString(),
      batchLabel: item.batchLabels.size === 1 ? [...item.batchLabels][0] : 'MULTIPLE BATCHES'
    }))
  }

  const itemColor = (type) => {
    if (type === 'raw')      return 'text-blue-600'
    if (type === 'prod')     return 'text-orange-600'
    return 'text-emerald-600'
  }

  const parentLocations = locations.filter(loc => loc.parent === null)

  const filteredLocations = parentLocations.filter(loc => {
    const query = searchQuery.toLowerCase()
    const nameMatch = loc.name.toLowerCase().includes(query) || loc.full_path?.toLowerCase().includes(query)

    const { raw, prod, finished } = getStockForLocation(loc.id)
    const itemMatch =
      raw.some(s => s.material_name?.toLowerCase().includes(query) || s.batch_code?.toLowerCase().includes(query) || s.lpn_code?.toLowerCase().includes(query)) ||
      prod.some(s => s.product_name?.toLowerCase().includes(query) || s.batch_code?.toLowerCase().includes(query) || s.lpn_code?.toLowerCase().includes(query)) ||
      finished.some(s =>
        s.finished_product_variant_label?.toLowerCase().includes(query) ||
        s.finished_product_name?.toLowerCase().includes(query) ||
        s.batch_code?.toLowerCase().includes(query) ||
        s.lpn_code?.toLowerCase().includes(query)
      )

    return nameMatch || itemMatch
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-8">
          {/* Header */}
          <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-orange-500 mb-1">
                <MapIcon className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-widest">WMS Intelligence</span>
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Warehouse Explorer</h1>
              <p className="text-slate-500 mt-1">Live inventory distribution across all storage locations.</p>
            </div>

            <div className="flex items-center gap-4">
              {/* Legend */}
              <div className="hidden md:flex items-center gap-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>Raw</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block"></span>Base</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>Finished</span>
              </div>
              <div className="relative group">
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input
                  type="text"
                  placeholder="Search location or item..."
                  className="pl-11 pr-6 py-3 bg-white border border-slate-200 rounded-2xl w-full md:w-80 shadow-sm focus:ring-4 focus:ring-orange-100 focus:border-orange-500 outline-none transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="h-40 bg-white rounded-2xl animate-pulse border border-slate-100 shadow-sm"></div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredLocations.map(loc => {
                const { raw, prod, finished } = getStockForLocation(loc.id)
                const hasAnyStock = raw.length > 0 || prod.length > 0 || finished.length > 0

                if (!hasAnyStock && searchQuery === '') return null

                const combinedItems = groupStockItems([
                  ...raw.map(r => ({ ...r, type: 'raw' })),
                  ...prod.map(p => ({ ...p, type: 'prod' })),
                  ...finished.map(f => ({ ...f, type: 'finished' })),
                ])

                return (
                  <div key={loc.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-50 bg-slate-50/30">
                      <div className="flex items-center gap-2 mb-1">
                        <MapPinIcon className={`w-4 h-4 ${hasAnyStock ? 'text-orange-500' : 'text-slate-300'}`} />
                        <h3 className="text-sm font-bold text-slate-900 truncate">{loc.name}</h3>
                      </div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase truncate">
                        {loc.short_code || loc.full_path}
                      </p>
                    </div>

                    <div className="p-3 flex-1 overflow-y-auto max-h-48 space-y-3">
                      {combinedItems.map((item, idx) => {
                        const exactLocations = [...new Set(item.locations)]
                          .map(lid => locations.find(l => l.id === lid))
                          .filter(Boolean)
                        const locationLabel = exactLocations.length === 1
                          ? (exactLocations[0].full_code || exactLocations[0].full_path || exactLocations[0].name)
                          : `${exactLocations.length} sub locations`

                        return (
                          <div key={idx} className="border-b border-slate-50 last:border-0 pb-2 mb-2 last:mb-0 last:pb-0">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-bold text-slate-700 truncate leading-tight">
                                  {getItemName(item)}
                                </p>
                                <div className="flex items-center gap-1 mt-0.5 overflow-hidden">
                                  <p className="text-[9px] font-mono text-slate-500 bg-slate-100 px-1 rounded flex-shrink-0">
                                    {item.batchLabel === 'NO_BATCH' ? 'NO BATCH' : item.batchLabel}
                                  </p>
                                  <p className="text-[8px] font-bold text-slate-400 uppercase truncate">
                                    @ {locationLabel}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-[11px] font-black ${itemColor(item.type)}`}>
                                  {parseFloat(item.quantity).toLocaleString()}{' '}
                                  <span className="text-[8px] font-bold text-slate-400 uppercase">{item.unit || item.unit_name}</span>
                                </p>
                                {parseFloat(item.secondary_quantity) > 0 && item.secondary_unit && (
                                  <p className="text-[10px] font-bold text-indigo-500">
                                    {parseFloat(item.secondary_quantity).toLocaleString()}{' '}
                                    <span className="text-[8px] uppercase">{item.secondary_unit}</span>
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {!hasAnyStock && (
                        <div className="py-4 text-center">
                          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Empty</p>
                        </div>
                      )}
                    </div>

                    {hasAnyStock && (
                      <div className="px-3 py-2 bg-slate-50/50 border-t border-slate-50 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">
                            {combinedItems.length} Items
                          </span>
                          <div className="flex gap-1">
                            {raw.length > 0      && <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>}
                            {prod.length > 0     && <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>}
                            {finished.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>}
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedReportLocation(loc)}
                          className="text-[9px] font-bold text-orange-500 hover:text-orange-600 uppercase tracking-wider"
                        >
                          Details
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {filteredLocations.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="bg-white p-6 rounded-full shadow-xl shadow-slate-100 mb-6">
                <MagnifyingGlassIcon className="w-12 h-12 text-slate-200" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">No matches found</h2>
              <p className="text-slate-500 mt-2 max-w-sm">We couldn't find any locations or items matching your search criteria.</p>
              <button onClick={() => setSearchQuery('')} className="mt-6 text-orange-500 font-bold hover:underline">
                Clear search
              </button>
            </div>
          )}

          {/* Detailed Report Modal */}
          {selectedReportLocation && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">Detailed Report: {selectedReportLocation.name}</h2>
                    <p className="text-sm font-medium text-slate-500 mt-1">{selectedReportLocation.full_code || selectedReportLocation.full_path}</p>
                  </div>
                  <button onClick={() => setSelectedReportLocation(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                    <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-400 sticky top-0 shadow-sm">
                      <tr>
                        <th className="px-6 py-4 font-bold">Item</th>
                        <th className="px-6 py-4 font-bold">Type</th>
                        <th className="px-6 py-4 font-bold">Batch / LPN</th>
                        <th className="px-6 py-4 font-bold">Exact Location</th>
                        <th className="px-6 py-4 text-right font-bold">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        const { raw, prod, finished } = getStockForLocation(selectedReportLocation.id)
                        const items = [
                          ...raw.map(r => ({ ...r, _type: 'Raw Material' })),
                          ...prod.map(p => ({ ...p, _type: 'Base Product' })),
                          ...finished.map(f => ({ ...f, _type: 'Finished Product' })),
                        ]
                        return items.map((item, idx) => {
                          const exactLoc = locations.find(l => l.id === item.location)
                          const name = item._type === 'Raw Material'
                            ? item.material_name
                            : item._type === 'Base Product'
                              ? item.product_name
                              : (item.finished_product_variant_label || item.finished_product_name)
                          const badgeColor = item._type === 'Raw Material'
                            ? 'bg-blue-100 text-blue-700'
                            : item._type === 'Base Product'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-emerald-100 text-emerald-700'

                          return (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 font-bold text-slate-900">{name}</td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${badgeColor}`}>
                                  {item._type}
                                </span>
                              </td>
                              <td className="px-6 py-4 font-mono text-xs">{item.batch_code || item.lpn_code || '—'}</td>
                              <td className="px-6 py-4 text-xs font-medium text-slate-500">
                                {exactLoc ? (exactLoc.full_code || exactLoc.full_path) : 'Unknown'}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className="font-black text-slate-900">{parseFloat(item.quantity).toLocaleString()}</span>
                                <span className="text-xs font-bold text-slate-400 ml-1 uppercase">{item.unit || item.unit_name}</span>
                                {item.secondary_quantity && item.secondary_unit && (
                                  <div className="text-[10px] font-bold text-indigo-500 mt-0.5">
                                    {parseFloat(item.secondary_quantity).toLocaleString()} {item.secondary_unit}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default InventoryExplorerPage
