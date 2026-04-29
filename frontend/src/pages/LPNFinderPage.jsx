import { useState, useEffect } from 'react'
import { Html5Qrcode, Html5QrcodeScanner } from 'html5-qrcode'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch } from '../utils/api'
import { 
  QrCodeIcon,
  ClockIcon, 
  MapPinIcon, 
  CubeIcon, 
  ArchiveBoxIcon,
  ArrowRightIcon,
  MagnifyingGlassIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'

const LPNFinderPage = () => {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [item, setItem] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState(null)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [scanner, setScanner] = useState(null)
  const [scannedCode, setScannedCode] = useState('')

  useEffect(() => {
    return () => {
      if (scanner) {
        scanner.clear()
      }
    }
  }, [scanner])

  const handleSearch = async (inputCode) => {
    if (!inputCode) return
    
    let code = inputCode
    // Handle JSON format if scanned
    try {
      if (inputCode.trim().startsWith('{')) {
        const parsed = JSON.parse(inputCode)
        code = parsed.code || parsed.batch_code || inputCode
      }
    } catch (e) {
      // Not JSON, use as is
    }

    setLoading(true)
    setError(null)
    setItem(null)
    setHistory([])
    setQuery(code)
    setScannedCode(code) // Track what we are looking for

    try {
      // 1. Search Core Identity (Batches)
      let batchRes = await apiFetch(`/inventory-core/batches/?search=${code}`)
      let batchDataRaw = await batchRes.json()
      let batches = Array.isArray(batchDataRaw) ? batchDataRaw : (batchDataRaw.results || [])
      let foundBatch = batches.find(b => b.batch_code === code)

      // 2. If not found, Search LPNs
      if (!foundBatch) {
        let lpnRes = await apiFetch(`/inventory-core/lpns/?search=${code}`)
        let lpnDataRaw = await lpnRes.json()
        let lpns = Array.isArray(lpnDataRaw) ? lpnDataRaw : (lpnDataRaw.results || [])
        let foundLPN = lpns.find(l => l.lpn_code === code)
        
        if (foundLPN) {
          // Get the full batch details for this LPN
          let bRes = await apiFetch(`/inventory-core/batches/${foundLPN.batch}/`)
          foundBatch = await bRes.json()
        }
      }

      if (foundBatch) {
        const type = foundBatch.batch_type === 'RAW' ? 'raw' : 'product'
        
        // 3. Check Current Stock Status (Optional/Additional)
        const stockEndpoint = type === 'raw' 
          ? `/raw-materials-stock/stock/?batch=${foundBatch.id}`
          : `/products-stock/stock/?batch=${foundBatch.id}`
        
        const stockRes = await apiFetch(stockEndpoint)
        const stockDataRaw = await stockRes.json()
        const stockData = Array.isArray(stockDataRaw) ? stockDataRaw : (stockDataRaw.results || [])
        
        // Calculate Total Stock across all locations
        const totalQuantity = stockData.reduce((sum, s) => sum + parseFloat(s.quantity || 0), 0)
        
        // Find specific record if LPN was scanned
        const specificRecord = stockData.find(s => s.lpn_code === code)
        
        setItem({
          ...foundBatch,
          type,
          material_name: foundBatch.raw_material_name || foundBatch.material_name,
          product_name: foundBatch.product_name,
          totalQuantity,
          quantity: specificRecord ? specificRecord.quantity : totalQuantity,
          location_name: specificRecord ? specificRecord.location_name : (stockData.length > 1 ? `${stockData.length} Locations` : (stockData[0]?.location_name || 'No Active Stock')),
          allLocations: stockData,
          unit: stockData[0]?.unit || (type === 'raw' ? 'Units' : 'Units'),
          lpn_code: specificRecord ? specificRecord.lpn_code : (foundBatch.lpns?.[0]?.lpn_code || 'N/A')
        })

        // 4. Fetch History
        const logEndpoint = type === 'raw' 
          ? `/raw-materials-stock/stock-movements/?batch=${foundBatch.id}` 
          : `/products-stock/stock-movements/?batch=${foundBatch.id}`
        
        const historyRes = await apiFetch(logEndpoint)
        const historyData = await historyRes.json()
        setHistory(historyData.results || historyData)
        setIsScannerOpen(false) // Close scanner if open
      } else {
        setError('No record found for this identifier in the master database.')
      }
    } catch (err) {
      console.error('Identity fetch error:', err)
      setError('System error while identifying code.')
    } finally {
      setLoading(false)
    }
  }

  const startScanner = () => {
    setIsScannerOpen(true)
    setTimeout(() => {
      const newScanner = new Html5QrcodeScanner("reader", { 
        fps: 10, 
        qrbox: {width: 250, height: 250},
        aspectRatio: 1.0
      })
      newScanner.render((decodedText) => {
        newScanner.clear()
        handleSearch(decodedText)
      }, (err) => {
        // Silently handle scan errors
      })
      setScanner(newScanner)
    }, 100)
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const html5QrCode = new Html5Qrcode("reader-hidden")
    try {
      const decodedText = await html5QrCode.scanFile(file, true)
      handleSearch(decodedText)
    } catch (err) {
      setError("Could not find a valid QR code in this image.")
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <div className="ml-16">
        <Topbar />
        <main className="p-8 max-w-5xl mx-auto">
          {/* Main Scanner Input */}
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-4">LPN & Batch Finder</h1>
            <p className="text-slate-500 mb-8 max-w-lg mx-auto">Scan or enter any License Plate Number (LPN) or Batch Code to find its exact location and history.</p>
            
            <div className="relative max-w-2xl mx-auto mb-6">
              <div className="absolute left-6 top-1/2 -translate-y-1/2">
                <QrCodeIcon className="w-8 h-8 text-orange-500" />
              </div>
              <input 
                autoFocus
                type="text"
                placeholder="READY TO SCAN..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch(query)
                }}
                className="w-full pl-18 pr-32 py-6 bg-white border-4 border-slate-200 rounded-[2.5rem] text-2xl font-black text-slate-900 placeholder:text-slate-200 outline-none focus:border-orange-500 focus:ring-8 focus:ring-orange-100 transition-all shadow-2xl shadow-slate-200"
              />
              <button 
                onClick={() => handleSearch(query)}
                disabled={loading}
                className="absolute right-4 top-1/2 -translate-y-1/2 px-8 py-3 bg-slate-900 text-white font-bold rounded-2xl hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50"
              >
                {loading ? 'IDENTIFYING...' : 'FIND'}
              </button>
            </div>

            <div className="flex flex-wrap justify-center gap-4">
               <button 
                onClick={startScanner}
                className="flex items-center gap-3 px-6 py-3 bg-white border-2 border-slate-100 rounded-2xl text-slate-600 font-bold hover:border-orange-200 hover:text-orange-500 transition-all shadow-sm group"
               >
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-orange-50 transition-colors">
                    <MapPinIcon className="w-5 h-5" />
                  </div>
                  <span>Camera Scan</span>
               </button>
               
               <label className="flex items-center gap-3 px-6 py-3 bg-white border-2 border-slate-100 rounded-2xl text-slate-600 font-bold hover:border-orange-200 hover:text-orange-500 transition-all shadow-sm group cursor-pointer">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-orange-50 transition-colors">
                    <QrCodeIcon className="w-5 h-5" />
                  </div>
                  <span>Upload Image</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
               </label>
            </div>
          </div>

          {isScannerOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
              <div className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-black text-slate-900 uppercase tracking-widest text-sm">Live QR Scanner</h3>
                  <button 
                    onClick={() => {
                      if (scanner) scanner.clear()
                      setIsScannerOpen(false)
                    }}
                    className="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-100 text-slate-400 hover:bg-slate-200 transition-all"
                  >✕</button>
                </div>
                <div id="reader" className="w-full"></div>
                <div className="p-6 bg-slate-50 text-center">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Point camera at a Batch or LPN Label</p>
                </div>
              </div>
            </div>
          )}

          <div id="reader-hidden" style={{ display: 'none' }}></div>

          {error && (
            <div className="mb-8 p-4 bg-red-50 border border-red-100 text-red-700 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <InformationCircleIcon className="w-5 h-5" />
              <span className="font-bold">{error}</span>
            </div>
          )}

          {item && (
            <div className="space-y-8 animate-in fade-in zoom-in duration-500">
              {/* 1. HERO STATUS BAR */}
              <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-slate-200 flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
                <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                
                <div className="flex items-center gap-6 relative z-10">
                  <div className={`w-20 h-20 rounded-3xl flex items-center justify-center ${item.type === 'raw' ? 'bg-blue-500' : 'bg-orange-500'} shadow-xl shadow-black/20`}>
                    {item.type === 'raw' ? <CubeIcon className="w-12 h-12" /> : <ArchiveBoxIcon className="w-12 h-12" />}
                  </div>
                  <div>
                    <h2 className="text-3xl font-black leading-tight">{item.type === 'raw' ? item.material_name : item.product_name}</h2>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">
                      {item.type === 'raw' ? 'Raw Material' : 'Finished Product'} • {item.batch_code}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-8 relative z-10 bg-white/10 px-8 py-4 rounded-3xl backdrop-blur-md border border-white/10">
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      {scannedCode === item.lpn_code ? 'LPN Location' : 'Primary Location'}
                    </p>
                    <div className="flex items-center gap-2 justify-center">
                      <MapPinIcon className="w-5 h-5 text-orange-500" />
                      <span className="text-xl font-black">{item.location_name}</span>
                    </div>
                  </div>
                  <div className="w-px h-10 bg-white/10"></div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      {scannedCode === item.lpn_code ? 'LPN Quantity' : 'Total Batch Stock'}
                    </p>
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-black text-orange-500">
                        {parseFloat(item.quantity).toLocaleString()} <span className="text-sm text-white/60">{item.unit}</span>
                      </span>
                      {scannedCode === item.lpn_code && item.totalQuantity !== parseFloat(item.quantity) && (
                        <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase">
                          Batch Total: {item.totalQuantity.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* 2. STATS & IDENTITY */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Identity Details</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Physical LPN</span>
                        <span className={`font-mono font-bold px-2 py-0.5 rounded ${item.lpn_code === scannedCode ? 'bg-orange-500 text-white' : 'text-slate-900'}`}>
                          {item.lpn_code}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Batch Registry</span>
                        <span className={`font-mono font-bold px-2 py-0.5 rounded ${item.batch_code === scannedCode ? 'bg-orange-500 text-white' : 'text-slate-900'}`}>
                          {item.batch_code}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">First Seen</span>
                        <span className="text-xs font-bold text-slate-700">{new Date(item.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Expiry Date</span>
                        <span className="text-xs font-bold text-rose-500">{item.expiry_date || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
 
                  {/* 3. STOCK DISTRIBUTION */}
                  <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Stock Distribution</h3>
                      <span className="text-[10px] font-black text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">{item.allLocations?.length || 0} Locations</span>
                    </div>
                    <div className="space-y-3">
                      {(item.allLocations || [])
                        .filter(loc => parseFloat(loc.quantity) > 0)
                        .map((loc, idx) => (
                          <div key={idx} className={`p-3 rounded-2xl border ${loc.lpn_code === scannedCode ? 'border-orange-200 bg-orange-50/30 ring-2 ring-orange-100' : 'border-slate-50 bg-slate-50/50'}`}>
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-[11px] font-black text-slate-900 truncate pr-2">{loc.location_name}</span>
                            <span className="text-[11px] font-black text-slate-900 shrink-0">{parseFloat(loc.quantity).toLocaleString()} <span className="text-[9px] text-slate-400">{loc.unit}</span></span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <QrCodeIcon className="w-3 h-3 text-slate-300" />
                            <span className={`text-[9px] font-mono ${loc.lpn_code === scannedCode ? 'font-black text-orange-600' : 'text-slate-400'}`}>
                              {loc.lpn_code || 'No LPN'}
                            </span>
                          </div>
                        </div>
                      ))}
                      {(!item.allLocations || item.allLocations.length === 0) && (
                        <p className="text-[10px] text-slate-400 italic text-center py-4">No active stock in any location.</p>
                      )}
                    </div>
                  </div>
 
                  <div className="bg-orange-50 rounded-[2rem] border border-orange-100 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <InformationCircleIcon className="w-5 h-5 text-orange-500" />
                      <h4 className="text-sm font-black text-orange-900 uppercase">Quick Actions</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button className="bg-white p-3 rounded-2xl text-[10px] font-bold text-slate-700 shadow-sm hover:shadow-md transition-shadow border border-orange-100">
                        Print LPN Tag
                      </button>
                      <button className="bg-white p-3 rounded-2xl text-[10px] font-bold text-slate-700 shadow-sm hover:shadow-md transition-shadow border border-orange-100">
                        Move Stock
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. COMPACT TIMELINE */}
                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-4 px-2">
                    <div className="flex items-center gap-2">
                      <ClockIcon className="w-4 h-4 text-slate-400" />
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Movement Log</h3>
                    </div>
                    <span className="text-[9px] font-black text-slate-400 uppercase">{history.length} Events</span>
                  </div>

                  <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                    <div className="divide-y divide-slate-50">
                      {history.map((log, idx) => {
                        const isInbound = ['purchase', 'production', 'return', 'transfer_in', 'adjustment_in', 'sale_return'].includes(log.movement_type);
                        const qty = parseFloat(log.quantity);
                        
                        return (
                          <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors group">
                            <div className="flex justify-between items-start">
                              <div className="flex gap-3">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isInbound ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                  {isInbound ? <ArrowRightIcon className="w-4 h-4 rotate-180" /> : <ArrowRightIcon className="w-4 h-4" />}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-[11px] font-black text-slate-900 uppercase">{log.movement_type_display || log.movement_type}</p>
                                    {log.lpn_code && (
                                      <span className={`text-[8px] font-mono px-1 rounded ${log.lpn_code === scannedCode ? 'bg-orange-500 text-white font-bold' : 'text-slate-400 bg-slate-100'}`}>
                                        {log.lpn_code}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <MapPinIcon className="w-3 h-3 text-slate-300" />
                                    <p className="text-[10px] font-bold text-slate-500">{log.location_name}</p>
                                    {log.counterpart_location_name && (
                                      <>
                                        <ArrowRightIcon className="w-2.5 h-2.5 text-slate-300" />
                                        <p className="text-[10px] font-bold text-slate-500">{log.counterpart_location_name}</p>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`text-sm font-black ${isInbound ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {isInbound ? '+' : '-'}{qty.toLocaleString()}
                                </p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">{log.unit}</p>
                                <p className="text-[8px] font-bold text-slate-300 mt-1">{new Date(log.created_at).toLocaleDateString()}</p>
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {history.length === 0 && (
                        <div className="p-12 text-center">
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No movements found</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!item && !loading && !error && (
            <div className="py-24 text-center">
               <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-slate-100 border border-slate-50">
                  <QrCodeIcon className="w-16 h-16 text-slate-100" />
               </div>
               <h2 className="text-2xl font-bold text-slate-900">Waiting for Identity Scan...</h2>
               <p className="text-slate-500 mt-2">Use your scanner or type the code above to reveal item intelligence.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default LPNFinderPage
