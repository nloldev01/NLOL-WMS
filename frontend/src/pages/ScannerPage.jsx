import { useState, useRef, useEffect, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch, getApiError, hasAccess } from '../utils/api'

// ─── Constants ────────────────────────────────────────────────────────────────

const RECENT_KEY = 'scanner_recent_locations'
const MAX_RECENT = 5

const REASON_CODES = [
  { value: 'COUNT_CORRECTION', label: 'Count Correction' },
  { value: 'DAMAGE',           label: 'Damage / Wastage' },
  { value: 'PRODUCTION',       label: 'Production Use' },
  { value: 'RETURN',           label: 'Return from Production' },
  { value: 'OTHER',            label: 'Other' },
]

const TYPE_COLOR = {
  FIN: 'bg-green-100 text-green-700',
  PRD: 'bg-blue-100 text-blue-700',
  RAW: 'bg-amber-100 text-amber-700',
}

const TYPE_LABEL = {
  FIN: 'Finished Goods',
  PRD: 'Production Goods',
  RAW: 'Raw Materials',
}

function Badge({ type }) {
  const c = TYPE_COLOR[type] || 'bg-gray-100 text-gray-600'
  return <span className={`text-xs font-bold px-2 py-1 rounded ${c}`}>{TYPE_LABEL[type] || type}</span>
}

function CameraButton({ onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? 'Stop camera' : 'Scan with camera'}
      className={`px-4 py-3 min-h-[48px] border rounded-lg flex flex-col items-center justify-center gap-0.5 flex-shrink-0 transition-colors ${
        active
          ? 'bg-red-50 border-red-300 text-red-500 hover:bg-red-100'
          : 'bg-white border-gray-300 text-gray-500 hover:border-orange-300 hover:text-orange-600'
      }`}
    >
      {active ? (
        <>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-[10px] font-semibold leading-none">Stop</span>
        </>
      ) : (
        <>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-[10px] font-semibold leading-none">Camera</span>
        </>
      )}
    </button>
  )
}

function getItemKey(data) {
  if (data.lpn_id) return `lpn-${data.lpn_id}`
  if (data.variant_id) return `var-${data.variant_id}-${data.batch_id || 'x'}`
  if (data.product_id) return `prd-${data.product_id}-${data.batch_id || 'x'}`
  if (data.material_id) return `raw-${data.material_id}-${data.batch_id || 'x'}`
  return `unk-${Math.random()}`
}

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}

function saveRecent(loc) {
  const prev = loadRecent().filter(r => r.id !== loc.id)
  localStorage.setItem(RECENT_KEY, JSON.stringify([loc, ...prev].slice(0, MAX_RECENT)))
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const [tab, setTab] = useState('check')
  const canAdjust = hasAccess('inventory_adjust')

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar title="Warehouse Scanner" />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Inventory / Scanner</p>

          <div className="rounded-xl bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Warehouse Scanner</h2>
                <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">
                  Scan QR codes to check stock, transfer items, or adjust inventory
                </p>
              </div>
            </div>
            {/* Tab bar — primary color header matching other pages */}
            <div className="bg-primary flex">
              {['check', 'transfer', ...(canAdjust ? ['adjust'] : [])].map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-6 py-3.5 text-sm font-semibold tracking-widest uppercase transition-colors ${
                    tab === t
                      ? 'bg-white/15 text-white border-b-2 border-white'
                      : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="bg-slate-50">
              {tab === 'check'    && <CheckTab />}
              {tab === 'transfer' && <TransferTab />}
              {tab === 'adjust'   && canAdjust && <AdjustTab />}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

// ─── CHECK tab ────────────────────────────────────────────────────────────────

function CheckTab() {
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [result, setResult]     = useState(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const doScan = async (qr) => {
    if (!qr) return
    setError(''); setLoading(true)
    try {
      const res = await apiFetch(`/inventory-core/transfers/scan/?qr=${encodeURIComponent(qr)}`)
      if (!res?.ok) { setError(await getApiError(res)); return }
      const json = await res.json()
      setResult(json)
      setInput('')
      setTimeout(() => inputRef.current?.focus(), 50)
    } catch { setError('Connection error') }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Scan location or item</p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doScan(input.trim())}
            placeholder="Scan QR or type code…"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-300"
            autoComplete="off"
          />
          <CameraButton onClick={() => setCameraOpen(c => !c)} active={cameraOpen} />
          <button
            onClick={() => doScan(input.trim())}
            disabled={loading || !input.trim()}
            className="px-5 py-3.5 min-h-[48px] bg-orange-500 text-white rounded-lg text-base font-semibold hover:bg-orange-600 disabled:opacity-40"
          >
            {loading ? '…' : 'Check'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {result && <CheckResult result={result} />}
      {cameraOpen && <QrScanner onScan={doScan} onClose={() => setCameraOpen(false)} />}
    </div>
  )
}

function CheckResult({ result }) {
  const { type, data } = result

  if (type === 'pallet') {
    const items = data.items || []
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-gray-900 font-mono">{data.pallet_code}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {data.is_sealed ? 'Sealed' : 'Open'} pallet
            </p>
          </div>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        {!items.length ? (
          <p className="px-6 py-8 text-center text-gray-400 text-sm">Empty pallet.</p>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-primary text-white text-xs uppercase">
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Item</th>
                <th className="px-6 py-3">Batch / LPN</th>
                <th className="px-6 py-3 text-right">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((s, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4"><Badge type={s.stock_type} /></td>
                  <td className="px-6 py-4 font-medium text-gray-900">{s.item_label || '—'}</td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-400">
                    {s.batch_code}{s.batch_code && s.lpn_code && ' · '}{s.lpn_code}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-800">{s.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }

  if (type === 'location') {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-gray-900 font-mono">{data.location_code}</p>
            <p className="text-xs text-gray-400 mt-0.5">{data.location_label}</p>
          </div>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">
            {data.stock?.length ?? 0} lines
          </span>
        </div>
        {!data.stock?.length ? (
          <p className="px-6 py-8 text-center text-gray-400 text-sm">No stock at this location.</p>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-primary text-white text-xs uppercase">
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Item</th>
                <th className="px-6 py-3">Batch / LPN</th>
                <th className="px-6 py-3 text-right">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.stock.map((s, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4"><Badge type={s.stock_type} /></td>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {s.variant_label || s.product_label || s.material_label || '—'}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-400">
                    {s.batch_code}{s.batch_code && s.lpn_code && ' · '}{s.lpn_code}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-800">{s.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }

  // LPN or variant — show where it lives
  const locations = data.locations || []
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge type={data.stock_type} />
            <p className="text-base font-semibold text-gray-900">{data.item_label}</p>
          </div>
          {data.lpn_code && <p className="text-xs text-gray-400 mt-0.5 font-mono">{data.lpn_code}</p>}
          {data.batch_code && <p className="text-xs text-gray-400 font-mono">{data.batch_code}</p>}
        </div>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">
          {data.total_quantity ?? 0} total
        </span>
      </div>
      {!locations.length ? (
        <p className="px-6 py-8 text-center text-gray-400 text-sm">Not found in any location.</p>
      ) : (
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-primary text-white text-xs uppercase">
              <th className="px-6 py-3">Location</th>
              <th className="px-6 py-3 text-right">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {locations.map((l, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-mono text-sm text-gray-800">{l.location_code}</td>
                <td className="px-6 py-4 text-right font-semibold text-gray-800">{l.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── TRANSFER tab ─────────────────────────────────────────────────────────────

const TRANSFER_INITIAL = {
  phase: 'scan',
  items: [],
  toLocation: null,
  notes: '',
  preflightErrors: [],
  destSearch: '',
  allLocations: [],
  locationsLoaded: false,
}

function TransferTab() {
  const [state, setState] = useState(TRANSFER_INITIAL)
  const scanRef = useRef(null)
  const destRef = useRef(null)

  const set = (patch) => setState(s => ({ ...s, ...patch }))

  useEffect(() => {
    if (state.phase === 'scan') setTimeout(() => scanRef.current?.focus(), 80)
  }, [state.phase])

  useEffect(() => {
    if (state.phase !== 'destination' || state.locationsLoaded) return
    apiFetch('/inventory-core/transfers/locations/').then(async res => {
      if (res?.ok) {
        const data = await res.json()
        set({ allLocations: data, locationsLoaded: true })
      }
    })
  }, [state.phase, state.locationsLoaded])

  useEffect(() => {
    if (state.phase === 'destination') setTimeout(() => destRef.current?.focus(), 80)
  }, [state.phase])

  const restart = () => setState({ ...TRANSFER_INITIAL })

  return (
    <div className="max-w-2xl mx-auto p-6">
      {state.phase === 'scan'        && <ScanPhase state={state} set={set} scanRef={scanRef} restart={restart} />}
      {state.phase === 'destination' && <DestPhase state={state} set={set} destRef={destRef} />}
      {state.phase === 'confirm'     && <ConfirmPhase state={state} set={set} restart={restart} />}
      {state.phase === 'success'     && <SuccessPhase restart={restart} count={state.items.length} />}
    </div>
  )
}

// Phase A — scan items

function ScanPhase({ state, set, scanRef, restart }) {
  const [scanInput, setScanInput] = useState('')
  const [scanError, setScanError] = useState('')
  const [scanning, setScanning]   = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [multiScan, setMultiScan] = useState(false)
  const [locResult, setLocResult] = useState(null)
  const [locSelected, setLocSelected] = useState(new Map())

  // Capture latest state.items in a ref so the camera callback isn't stale
  const itemsRef = useRef(state.items)
  useEffect(() => { itemsRef.current = state.items }, [state.items])

  const toggleLocRow = (key, s) => {
    setLocSelected(prev => {
      const next = new Map(prev)
      if (next.has(key)) next.delete(key)
      else next.set(key, s.quantity)
      return next
    })
  }

  const addLocSelected = () => {
    const newItems = []
    for (const [key, qty] of locSelected.entries()) {
      const s = locResult.stock.find(s => getItemKey(s) === key)
      if (!s) continue
      newItems.push({
        ...s,
        item_label: s.variant_label || s.product_label || s.material_label || '—',
        quantity: parseFloat(qty) || 1,
        from_location_id: locResult.location_id,
        from_location_label: locResult.location_code,
        locations: [{ location_id: locResult.location_id, location_label: locResult.location_label, location_code: locResult.location_code, quantity: s.quantity }],
      })
    }
    set({ items: mergeItems(itemsRef.current, newItems) })
    setLocResult(null)
    setLocSelected(new Map())
  }

  const doScan = async (qr) => {
    if (!qr) return
    setScanError(''); setScanning(true)
    try {
      const res = await apiFetch(`/inventory-core/transfers/scan/?qr=${encodeURIComponent(qr)}`)
      if (!res?.ok) { setScanError(await getApiError(res)); setScanning(false); return }
      const { type, data } = await res.json()

      if (type === 'location') {
        setLocResult(data)
        setLocSelected(new Map())
        setScanInput('')
        setScanning(false)
        return
      }

      const expandedItems = type === 'pallet'
        ? (data.items || [])
        : [{ ...data, quantity: data.quantity ?? 1 }]

      set({ items: mergeItems(itemsRef.current, expandedItems) })
      setScanInput('')
      setTimeout(() => scanRef.current?.focus(), 50)
    } catch { setScanError('Connection error') }
    finally { setScanning(false) }
  }

  const updateItem = (key, patch) => {
    set({ items: state.items.map(it => it._key === key ? { ...it, ...patch } : it) })
  }

  const removeItem = (key) => {
    set({ items: state.items.filter(it => it._key !== key) })
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Scan items to transfer</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMultiScan(m => !m)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                multiScan
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'border-gray-300 text-gray-400 hover:border-orange-300 hover:text-orange-500'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${multiScan ? 'bg-white' : 'bg-gray-300'}`} />
              Multi-scan
            </button>
            {state.items.length > 0 && (
              <button onClick={restart} className="text-xs text-gray-400 hover:text-red-500">Restart</button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <input
            ref={scanRef}
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doScan(scanInput.trim())}
            placeholder="Scan LPN, pallet, location, or item QR…"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-300"
            autoComplete="off"
          />
          <CameraButton onClick={() => setCameraOpen(c => !c)} active={cameraOpen} />
          <button
            onClick={() => doScan(scanInput.trim())}
            disabled={scanning || !scanInput.trim()}
            className="px-5 py-3.5 min-h-[48px] bg-orange-500 text-white rounded-lg text-base font-semibold hover:bg-orange-600 disabled:opacity-40"
          >
            {scanning ? '…' : '+'}
          </button>
        </div>
        {scanError && <p className="text-sm text-red-600">{scanError}</p>}
      </div>

      {locResult && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-gray-900 font-mono">{locResult.location_code}</p>
              <p className="text-xs text-gray-400 mt-0.5">{locResult.stock?.length ?? 0} items at this location</p>
            </div>
            <button onClick={() => setLocResult(null)} className="text-xs text-gray-400 hover:text-red-500">✕ Clear</button>
          </div>
          {!locResult.stock?.length ? (
            <p className="px-6 py-8 text-center text-gray-400 text-sm">No stock at this location.</p>
          ) : (
            <>
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-primary text-white text-xs uppercase">
                    <th className="px-4 py-3 w-10"></th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">LPN / Batch</th>
                    <th className="px-4 py-3 text-right">Avail</th>
                    <th className="px-4 py-3 w-28 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {locResult.stock.map((s, i) => {
                    const key = getItemKey(s)
                    const isChecked = locSelected.has(key)
                    return (
                      <tr key={i} onClick={() => toggleLocRow(key, s)}
                        className={`cursor-pointer transition-colors ${isChecked ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={isChecked} readOnly className="w-4 h-4 accent-orange-500" />
                        </td>
                        <td className="px-4 py-3"><Badge type={s.stock_type} /></td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {s.variant_label || s.product_label || s.material_label || '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">
                          {s.lpn_code || s.batch_code || '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{s.quantity}</td>
                        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                          {isChecked && (
                            <input type="number" value={locSelected.get(key)} min={0.001} max={s.quantity}
                              onChange={e => setLocSelected(prev => { const n = new Map(prev); n.set(key, e.target.value); return n })}
                              className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-300"
                            />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {locSelected.size > 0 && (
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-orange-50">
                  <p className="text-sm font-medium text-orange-700">{locSelected.size} item{locSelected.size !== 1 ? 's' : ''} selected</p>
                  <button onClick={addLocSelected}
                    className="px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600">
                    Add to Transfer →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {state.items.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-1">
            Items ({state.items.length})
          </p>
          {state.items.map(item => (
            <ItemRow key={item._key} item={item} onUpdate={updateItem} onRemove={removeItem} />
          ))}
          <button
            onClick={() => set({ phase: 'destination' })}
            className="w-full mt-2 py-4 bg-orange-500 text-white rounded-xl font-semibold text-base hover:bg-orange-600"
          >
            Set Destination →
          </button>
        </div>
      )}

      {cameraOpen && <QrScanner onScan={doScan} onClose={() => setCameraOpen(false)} continuous={multiScan} />}
    </div>
  )
}

function ItemRow({ item, onUpdate, onRemove }) {
  const multiLoc = (item.locations || []).length > 1

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Badge type={item.stock_type} />
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium text-gray-800 truncate">{item.item_label}</p>
          {item.lpn_code && <p className="text-xs text-gray-400 font-mono">{item.lpn_code}</p>}
        </div>
        <button
          onClick={() => onRemove(item._key)}
          className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
        >
          ✕
        </button>
      </div>

      {/* FROM selector */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">FROM</p>
        {!item.locations?.length ? (
          <p className="text-sm text-amber-600">No stock location found</p>
        ) : multiLoc ? (
          <select
            value={item.from_location_id || ''}
            onChange={e => {
              const loc = item.locations.find(l => String(l.location_id) === e.target.value)
              onUpdate(item._key, {
                from_location_id: loc?.location_id,
                from_location_label: loc?.location_label,
              })
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          >
            <option value="">— pick location —</option>
            {item.locations.map(l => (
              <option key={l.location_id} value={l.location_id}>
                {l.location_label} ({l.quantity} avail.)
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-gray-600">
            {item.from_location_label}
            {item.locations[0]?.quantity != null && (
              <span className="text-gray-400"> ({item.locations[0].quantity} avail.)</span>
            )}
          </p>
        )}
      </div>

      {/* Quantity */}
      <div className="flex items-center gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">QTY</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdate(item._key, { quantity: Math.max(1, (item.quantity || 1) - 1) })}
            className="w-11 h-11 rounded-lg border border-gray-300 text-xl font-bold text-gray-500 hover:bg-gray-50 flex items-center justify-center"
          >−</button>
          <input
            type="number"
            value={item.quantity || 1}
            min={1}
            onChange={e => onUpdate(item._key, { quantity: Number(e.target.value) })}
            className="w-20 border border-gray-300 rounded-lg px-2 py-2.5 text-lg font-semibold text-center focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <button
            onClick={() => onUpdate(item._key, { quantity: (item.quantity || 1) + 1 })}
            className="w-11 h-11 rounded-lg border border-gray-300 text-xl font-bold text-gray-500 hover:bg-gray-50 flex items-center justify-center"
          >+</button>
        </div>
      </div>
    </div>
  )
}

// Phase B — destination picker

function DestPhase({ state, set, destRef }) {
  const [destInput, setDestInput] = useState('')
  const [scanning, setScanning]   = useState(false)
  const [scanError, setScanError] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const recentLocs = loadRecent()

  const filtered = destInput.trim()
    ? state.allLocations.filter(l =>
        l.label.toLowerCase().includes(destInput.toLowerCase()) ||
        l.code.toLowerCase().includes(destInput.toLowerCase())
      )
    : state.allLocations

  const selectLocation = useCallback((loc) => {
    saveRecent(loc)
    set({ toLocation: loc, phase: 'confirm' })
  }, [set])

  const doDestScan = async (qr) => {
    if (!qr) return
    setScanError(''); setScanning(true)
    try {
      const res = await apiFetch(`/inventory-core/transfers/scan/?qr=${encodeURIComponent(qr)}`)
      if (!res?.ok) { setScanError(await getApiError(res)); setScanning(false); return }
      const { type, data } = await res.json()
      if (type !== 'location') { setScanError('Scan a location code for the destination.'); setScanning(false); return }
      selectLocation({ id: data.location_id, label: data.location_label, code: data.location_code })
    } catch { setScanError('Connection error') }
    finally { setScanning(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Destination</p>
          <button onClick={() => set({ phase: 'scan' })} className="text-sm text-gray-400 hover:text-orange-500">← Back</button>
        </div>
        <div className="flex gap-2">
          <input
            ref={destRef}
            value={destInput}
            onChange={e => setDestInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doDestScan(destInput.trim())}
            placeholder="Scan location QR or search…"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-300"
            autoComplete="off"
          />
          <CameraButton onClick={() => setCameraOpen(c => !c)} active={cameraOpen} />
          {destInput.trim() && (
            <button
              onClick={() => doDestScan(destInput.trim())}
              disabled={scanning}
              className="px-5 py-3.5 min-h-[48px] bg-orange-500 text-white rounded-lg text-base font-semibold disabled:opacity-40"
            >
              {scanning ? '…' : 'Use'}
            </button>
          )}
        </div>
        {scanError && <p className="text-sm text-red-600">{scanError}</p>}
      </div>

      {recentLocs.length > 0 && !destInput && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <p className="px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest border-b border-gray-100">
            Recent
          </p>
          {recentLocs.map(loc => (
            <button
              key={loc.id}
              onClick={() => selectLocation(loc)}
              className="w-full text-left px-4 py-4 text-base text-gray-700 hover:bg-orange-50 hover:text-orange-700 border-b border-gray-100 last:border-0"
            >
              {loc.label}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <p className="px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest border-b border-gray-100">
          {destInput ? `Results (${filtered.length})` : 'All Locations'}
        </p>
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-gray-400 text-sm">No locations found.</p>
        ) : (
          filtered.map(loc => (
            <button
              key={loc.id}
              onClick={() => selectLocation(loc)}
              className="w-full text-left px-4 py-4 text-base text-gray-700 hover:bg-orange-50 hover:text-orange-700 border-b border-gray-100 last:border-0"
            >
              {loc.label}
              <span className="text-xs text-gray-400 font-mono ml-2">{loc.code}</span>
            </button>
          ))
        )}
      </div>

      {cameraOpen && <QrScanner onScan={doDestScan} onClose={() => setCameraOpen(false)} />}
    </div>
  )
}

// Phase C — confirm

function ConfirmPhase({ state, set, restart }) {
  const [loading, setLoading] = useState(false)
  const [errors, setErrors]   = useState([])

  const missingFrom = state.items.filter(it => !it.from_location_id)

  const handleSubmit = async () => {
    if (missingFrom.length) {
      setErrors([{ item_label: 'Some items have no source location selected.', requested: 0, available: 0, location: '' }])
      return
    }
    setErrors([]); setLoading(true)
    try {
      const payload = {
        to_location: state.toLocation.id,
        items: state.items.map(it => ({
          stock_type:       it.stock_type,
          variant_id:       it.variant_id,
          product_id:       it.product_id,
          material_id:      it.material_id,
          batch_id:         it.batch_id,
          lpn_id:           it.lpn_id,
          quantity:         it.quantity,
          from_location_id: it.from_location_id,
          item_label:       it.item_label,
        })),
        notes: state.notes,
      }
      const res = await apiFetch('/inventory-core/transfers/execute/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res?.ok) {
        set({ phase: 'success' })
      } else {
        const json = await res.json().catch(() => ({}))
        setErrors(json.errors || [{ item_label: json.detail || 'Transfer failed.', requested: 0, available: 0, location: '' }])
      }
    } catch { setErrors([{ item_label: 'Connection error', requested: 0, available: 0, location: '' }]) }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Confirm Transfer</p>
          <button onClick={() => set({ phase: 'destination' })} className="text-sm text-gray-400 hover:text-orange-500">← Edit</button>
        </div>
        <div className="flex items-center gap-2 mb-4 p-3 bg-orange-50 rounded-lg">
          <span className="text-xs text-gray-500">TO:</span>
          <span className="text-base font-semibold text-orange-700">{state.toLocation?.label}</span>
        </div>
        <div className="divide-y divide-gray-50">
          {state.items.map(it => (
            <div key={it._key} className="py-3">
              <p className="text-base font-medium text-gray-800">{it.quantity} × {it.item_label}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                from {it.from_location_label || <span className="text-red-500">no source set</span>}
              </p>
            </div>
          ))}
        </div>
        <textarea
          value={state.notes}
          onChange={e => set({ notes: e.target.value })}
          placeholder="Notes (optional)…"
          rows={2}
          className="mt-4 w-full border border-gray-300 rounded-lg px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
        />
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-red-500 mb-2">Stock errors</p>
          {errors.map((e, i) => (
            <p key={i} className="text-sm text-red-700">
              {e.item_label}{e.location ? ` @ ${e.location}` : ''}{e.requested ? ` — need ${e.requested}, have ${e.available}` : ''}
            </p>
          ))}
        </div>
      )}

      {missingFrom.length > 0 && (
        <p className="text-sm text-amber-600 px-1">
          {missingFrom.length} item(s) still need a source location — go back to set them.
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || missingFrom.length > 0}
        className="w-full py-4 bg-orange-500 text-white rounded-xl font-semibold text-base hover:bg-orange-600 disabled:opacity-40"
      >
        {loading ? 'Transferring…' : 'Confirm Transfer'}
      </button>
    </div>
  )
}

function SuccessPhase({ restart, count }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-4xl">✓</div>
      <p className="text-xl font-semibold text-gray-800">Transfer Complete</p>
      <p className="text-base text-gray-500">{count} item{count !== 1 ? 's' : ''} moved successfully.</p>
      <button
        onClick={restart}
        className="mt-4 px-8 py-4 bg-orange-500 text-white rounded-xl font-semibold text-base hover:bg-orange-600"
      >
        New Transfer
      </button>
    </div>
  )
}

// ─── ADJUST tab ───────────────────────────────────────────────────────────────

const ADJUST_INITIAL = {
  itemInput: '', item: null, itemLoading: false, itemError: '',
  locSearch: '', location: null, locLoading: false, locError: '', locResults: [],
  quantity: '', direction: 'in', reason: 'COUNT_CORRECTION', notes: '',
  submitting: false, submitError: '', done: false,
}

function AdjustTab() {
  const [s, setS]   = useState(ADJUST_INITIAL)
  const [cameraOpen, setCameraOpen] = useState(false)
  const set = (patch) => setS(p => ({ ...p, ...patch }))
  const itemRef = useRef(null)

  useEffect(() => { itemRef.current?.focus() }, [])

  const doScanItem = async (qr) => {
    if (!qr) return
    set({ itemLoading: true, itemError: '', item: null })
    try {
      const res = await apiFetch(`/inventory-core/transfers/scan/?qr=${encodeURIComponent(qr)}`)
      if (!res?.ok) { set({ itemError: await getApiError(res), itemLoading: false }); return }
      const { type, data } = await res.json()
      if (type === 'location') { set({ itemError: 'Scan an item, not a location.', itemLoading: false }); return }
      set({ item: data, itemInput: '', itemLoading: false })
    } catch { set({ itemError: 'Connection error', itemLoading: false }) }
  }

  const searchLocations = useCallback(async (q) => {
    set({ locSearch: q, locLoading: true, locError: '' })
    try {
      const res = await apiFetch(`/inventory-core/transfers/locations/?q=${encodeURIComponent(q)}`)
      if (res?.ok) {
        const data = await res.json()
        set({ locResults: data, locLoading: false })
      } else {
        set({ locLoading: false })
      }
    } catch { set({ locLoading: false }) }
  }, [])

  const submit = async () => {
    if (!s.item || !s.location || !s.quantity) {
      set({ submitError: 'Item, location, and quantity are all required.' }); return
    }
    set({ submitting: true, submitError: '' })
    try {
      const payload = {
        stock_type:  s.item.stock_type,
        variant_id:  s.item.variant_id,
        product_id:  s.item.product_id,
        material_id: s.item.material_id,
        batch_id:    s.item.batch_id,
        location_id: s.location.id,
        quantity:    s.quantity,
        direction:   s.direction,
        reason_code: s.reason,
        notes:       s.notes,
      }
      const res = await apiFetch('/inventory-core/transfers/adjust/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res?.ok) {
        set({ done: true, submitting: false })
      } else {
        const json = await res.json().catch(() => ({}))
        set({ submitError: json.detail || 'Adjustment failed.', submitting: false })
      }
    } catch { set({ submitError: 'Connection error', submitting: false }) }
  }

  if (s.done) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-4xl">✓</div>
        <p className="text-xl font-semibold text-gray-800">Adjustment Recorded</p>
        <button
          onClick={() => setS(ADJUST_INITIAL)}
          className="mt-4 px-8 py-4 bg-orange-500 text-white rounded-xl font-semibold text-base hover:bg-orange-600"
        >
          New Adjustment
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      {/* Item */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Item</p>
        {s.item ? (
          <div className="flex items-center gap-2">
            <Badge type={s.item.stock_type} />
            <span className="text-base font-medium text-gray-800 flex-1">{s.item.item_label}</span>
            <button
              onClick={() => set({ item: null })}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
            >✕</button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                ref={itemRef}
                value={s.itemInput}
                onChange={e => set({ itemInput: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && doScanItem(s.itemInput.trim())}
                placeholder="Scan item QR…"
                className="flex-1 border border-gray-300 rounded-lg px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-300"
                autoComplete="off"
              />
              <CameraButton onClick={() => setCameraOpen(c => !c)} active={cameraOpen} />
              <button
                onClick={() => doScanItem(s.itemInput.trim())}
                disabled={s.itemLoading || !s.itemInput.trim()}
                className="px-5 py-3.5 min-h-[48px] bg-orange-500 text-white rounded-lg text-base font-semibold disabled:opacity-40"
              >
                {s.itemLoading ? '…' : 'Scan'}
              </button>
            </div>
            {s.itemError && <p className="text-sm text-red-600">{s.itemError}</p>}
          </>
        )}
      </div>

      {/* Location */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Location</p>
        {s.location ? (
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-gray-800 flex-1">{s.location.label}</span>
            <button
              onClick={() => set({ location: null, locSearch: '', locResults: [] })}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
            >✕</button>
          </div>
        ) : (
          <>
            <input
              value={s.locSearch}
              onChange={e => searchLocations(e.target.value)}
              placeholder="Search location…"
              className="w-full border border-gray-300 rounded-lg px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-300"
              autoComplete="off"
            />
            {s.locLoading && <p className="text-sm text-gray-400">Searching…</p>}
            {s.locResults.length > 0 && (
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-48 overflow-auto">
                {s.locResults.map(loc => (
                  <button
                    key={loc.id}
                    onClick={() => set({ location: loc, locResults: [] })}
                    className="w-full text-left px-4 py-4 text-base text-gray-700 hover:bg-orange-50"
                  >
                    {loc.label}
                  </button>
                ))}
              </div>
            )}
            {s.locError && <p className="text-sm text-red-600">{s.locError}</p>}
          </>
        )}
      </div>

      {/* Direction, Qty, Reason */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex gap-3">
          {['in', 'out'].map(d => (
            <button
              key={d}
              onClick={() => set({ direction: d })}
              className={`flex-1 py-4 rounded-lg text-base font-bold transition-colors ${
                s.direction === d
                  ? d === 'in' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d === 'in' ? '+ Add Stock' : '− Remove Stock'}
            </button>
          ))}
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 block mb-1">Quantity</label>
          <input
            type="number"
            value={s.quantity}
            min={0.001}
            step="any"
            onChange={e => set({ quantity: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-300"
            placeholder="0"
          />
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 block mb-1">Reason</label>
          <select
            value={s.reason}
            onChange={e => set({ reason: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-300"
          >
            {REASON_CODES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 block mb-1">Notes</label>
          <input
            value={s.notes}
            onChange={e => set({ notes: e.target.value })}
            placeholder="Optional notes…"
            className="w-full border border-gray-300 rounded-lg px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
      </div>

      {s.submitError && (
        <p className="text-sm text-red-600 px-1">{s.submitError}</p>
      )}

      <button
        onClick={submit}
        disabled={s.submitting || !s.item || !s.location || !s.quantity}
        className="w-full py-4 bg-orange-500 text-white rounded-xl font-semibold text-base hover:bg-orange-600 disabled:opacity-40"
      >
        {s.submitting ? 'Submitting…' : 'Submit Adjustment'}
      </button>

      {cameraOpen && <QrScanner onScan={doScanItem} onClose={() => setCameraOpen(false)} />}
    </div>
  )
}

// ─── Camera QR Scanner ────────────────────────────────────────────────────────

function QrScanner({ onScan, onClose, continuous = false }) {
  const qrRef = useRef(null)
  const [camError, setCamError] = useState('')
  const [fileError, setFileError] = useState('')
  const [flash, setFlash] = useState(false)
  const fileInputRef = useRef(null)
  const lastScanned = useRef({ text: '', time: 0 })

  const releaseCamera = () => {
    // html5-qrcode may move or rename its video element during stop, so stop
    // tracks on every video element rather than querying a specific selector.
    document.querySelectorAll('video').forEach(v => {
      if (v.srcObject instanceof MediaStream) {
        v.srcObject.getTracks().forEach(t => t.stop())
        v.srcObject = null
      }
    })
  }

  // Only call stop() when the scanner is actually running — calling it otherwise
  // throws "Cannot stop, scanner is not running or paused" from html5-qrcode.
  const safeStop = (qr, then) => {
    if (qr?.isScanning) {
      qr.stop().catch(() => {}).finally(() => { releaseCamera(); then?.() })
    } else {
      releaseCamera()
      then?.()
    }
  }

  useEffect(() => {
    let cancelled = false

    // Clear any leftover DOM from React StrictMode's double-invoke
    const el = document.getElementById('qr-scanner-reader')
    if (el) el.innerHTML = ''

    const qr = new Html5Qrcode('qr-scanner-reader')
    qrRef.current = qr

    // No qrbox — full-frame scanning, no shaded rectangle overlay
    const config = { fps: 15 }
    const onSuccess = (text) => {
      // Ignore callbacks that fire after cleanup (StrictMode's first mount)
      if (cancelled) return
      if (continuous) {
        // Debounce: ignore the same QR within 2 seconds to avoid double-adds
        const now = Date.now()
        if (text === lastScanned.current.text && now - lastScanned.current.time < 2000) return
        lastScanned.current = { text, time: now }
        onScan(resolveQrText(text))
        setFlash(true)
        setTimeout(() => setFlash(false), 600)
      } else {
        safeStop(qr, () => { onScan(resolveQrText(text)); onClose() })
      }
    }

    // Keep the start promise so cleanup can wait for it before stopping.
    // Without this, cleanup runs before start() resolves → isScanning is still
    // false → safeStop skips the stop → camera stays on with no owner.
    const startPromise = qr.start({ facingMode: 'environment' }, config, onSuccess)
      .catch(() => {
        if (cancelled) return
        return qr.start({}, config, onSuccess)
          .catch(() => { if (!cancelled) setCamError('Camera access denied or unavailable.') })
      })

    return () => {
      cancelled = true
      // Wait for start() to finish before stopping so isScanning is reliable.
      // Always call releaseCamera in finally so the light turns off even if
      // safeStop throws or qr.stop() rejects.
      startPromise
        .then(() => safeStop(qr))
        .catch(() => {})
        .finally(releaseCamera)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => safeStop(qrRef.current, onClose)

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError('')
    try {
      const qr = new Html5Qrcode('qr-file-reader')
      const text = await qr.scanFile(file, false)
      onScan(resolveQrText(text))
      onClose()
    } catch {
      setFileError('No QR code found in that image.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 bg-black relative mt-1">
      {/* Flash confirmation for continuous mode */}
      {flash && (
        <div className="absolute inset-0 bg-green-500/25 flex items-center justify-center pointer-events-none z-20">
          <div className="bg-green-500 text-white rounded-xl px-5 py-2.5 text-base font-bold shadow-lg">✓ Added</div>
        </div>
      )}
      {/* Stop button overlaid on the camera feed */}
      <div className="absolute top-2 right-2 z-10">
        <button
          onClick={handleClose}
          className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 flex items-center gap-1 shadow"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Stop Camera
        </button>
      </div>

      {camError ? (
        <div className="px-4 py-10 text-center bg-white">
          <p className="text-sm text-red-600">{camError}</p>
        </div>
      ) : (
        <div id="qr-scanner-reader" className="w-full" style={{ minHeight: '240px' }} />
      )}

      <div className="bg-white px-4 py-2.5 border-t border-gray-100 flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Upload image
        </button>
        {fileError && <p className="text-xs text-red-600">{fileError}</p>}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>

      {/* Hidden element required by Html5Qrcode.scanFile() */}
      <div id="qr-file-reader" style={{ display: 'none' }} />
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// QR codes in this system encode JSON objects like {"type":"lpn","code":"L-000000148"}
// or {"type":"location","code":"LOC-01-A"}. Extract the code so the backend scan
// endpoint receives a plain string it can look up rather than a raw JSON blob.
function resolveQrText(raw) {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.code) return String(parsed.code)
  } catch {}
  return raw
}

function mergeItems(existing, incoming) {
  const map = new Map(existing.map(it => [it._key, it]))
  for (const raw of incoming) {
    const key = getItemKey(raw)
    const locs = raw.locations || []
    const singleLoc = locs.length === 1 ? locs[0] : null
    if (map.has(key)) {
      const prev = map.get(key)
      map.set(key, { ...prev, quantity: (prev.quantity || 1) + 1 })
    } else {
      map.set(key, {
        ...raw,
        _key: key,
        quantity: raw.quantity ?? 1,
        from_location_id: singleLoc?.location_id ?? null,
        from_location_label: singleLoc?.location_label ?? null,
        locations: locs,
      })
    }
  }
  return Array.from(map.values())
}
