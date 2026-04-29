import { useState, useEffect } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch } from '../utils/api'
import { 
  MagnifyingGlassIcon, 
  MapIcon, 
  CubeIcon, 
  ArchiveBoxIcon, 
  MapPinIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  QrCodeIcon
} from '@heroicons/react/24/outline'

const InventoryExplorerPage = () => {
  const [locations, setLocations] = useState([])
  const [rawStock, setRawStock] = useState([])
  const [productStock, setProductStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedLocations, setExpandedLocations] = useState({})

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [locRes, rawRes, prodRes] = await Promise.all([
        apiFetch('/master-data/locations/'),
        apiFetch('/raw-materials-stock/stock/'),
        apiFetch('/products-stock/stock/')
      ])

      if (locRes && rawRes && prodRes) {
        const [locData, rawData, prodData] = await Promise.all([
          locRes.json(),
          rawRes.json(),
          prodRes.json()
        ])
        setLocations(locData)
        setRawStock(rawData)
        setProductStock(prodData)
      }
    } catch (error) {
      console.error('Error fetching inventory data:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleLocation = (id) => {
    setExpandedLocations(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  // Group locations by their hierarchy (simplified view)
  const getStockForLocation = (locationId) => {
    const raw = rawStock.filter(s => s.location === locationId && s.quantity > 0)
    const prod = productStock.filter(s => s.location === locationId && s.quantity > 0)
    return { raw, prod }
  }

  // Filter locations based on search query or if they have stock
  const filteredLocations = locations.filter(loc => {
    const query = searchQuery.toLowerCase()
    
    // Check if location name matches
    const nameMatch = loc.name.toLowerCase().includes(query) ||
                      loc.full_path?.toLowerCase().includes(query)
    
    // Check if any items in this location match the query (Batch or LPN)
    const { raw, prod } = getStockForLocation(loc.id)
    const itemMatch = raw.some(s => 
      s.material_name.toLowerCase().includes(query) || 
      s.batch_code?.toLowerCase().includes(query) || 
      s.lpn_code?.toLowerCase().includes(query)
    ) || prod.some(s => 
      s.product_name.toLowerCase().includes(query) || 
      s.batch_code?.toLowerCase().includes(query) || 
      s.lpn_code?.toLowerCase().includes(query)
    )
    
    return nameMatch || itemMatch
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <div className="ml-16">
        <Topbar />
        <main className="p-8">
          {/* Header section */}
          <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-orange-500 mb-1">
                <MapIcon className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-widest">WMS Intelligence</span>
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Warehouse Explorer</h1>
              <p className="text-slate-500 mt-1">Live inventory distribution across all storage locations.</p>
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

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="h-40 bg-white rounded-2xl animate-pulse border border-slate-100 shadow-sm"></div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredLocations.map(loc => {
                const { raw, prod } = getStockForLocation(loc.id)
                const hasAnyStock = raw.length > 0 || prod.length > 0
                
                if (!hasAnyStock && searchQuery === '') return null

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
                      {/* Combined Items View */}
                      {[...raw.map(r => ({...r, type: 'raw'})), ...prod.map(p => ({...p, type: 'prod'}))].map((item, idx) => (
                        <div key={idx} className="group relative">
                          <div className="flex justify-between items-start gap-2">
                             <div className="flex-1 min-w-0">
                               <p className="text-[11px] font-bold text-slate-700 truncate leading-tight">
                                 {item.type === 'raw' ? item.material_name : item.product_name}
                               </p>
                               <p className="text-[9px] font-mono text-slate-400 truncate">
                                 {item.batch_code}
                               </p>
                             </div>
                             <div className="text-right">
                               <p className={`text-[11px] font-black ${item.type === 'raw' ? 'text-blue-600' : 'text-orange-600'}`}>
                                 {parseFloat(item.quantity).toLocaleString()}
                               </p>
                               <p className="text-[8px] font-bold text-slate-400 uppercase leading-none">{item.unit}</p>
                             </div>
                          </div>
                        </div>
                      ))}

                      {!hasAnyStock && (
                        <div className="py-4 text-center">
                          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Empty</p>
                        </div>
                      )}
                    </div>
                    
                    {hasAnyStock && (
                      <div className="px-3 py-2 bg-slate-50/50 border-t border-slate-50 flex justify-between items-center">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">
                          {raw.length + prod.length} Units
                        </span>
                        <div className="flex gap-1">
                          {raw.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>}
                          {prod.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>}
                        </div>
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
              <p className="text-slate-500 mt-2 max-w-sm">We couldn't find any locations or items matching your search criteria. Try a different keyword.</p>
              <button 
                onClick={() => setSearchQuery('')}
                className="mt-6 text-orange-500 font-bold hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </main>
      </div>

    </div>
  )
}

export default InventoryExplorerPage
