import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${mm}${dd}${yyyy}`
}

// ── ZPL builder — 4" × 6" label (812 × 1218 dots at 203 DPI) ─────────────────

function buildPalletZPL(pallet) {
  const status   = pallet.is_sealed ? 'SEALED' : 'OPEN'
  const itemCount = pallet.total_items ?? (pallet.items?.length ?? 0)
  const date     = fmtDate(pallet.created_at)
  const creator  = pallet.created_by_name || ''

  return `^XA
^CI28
^PQ1,0,1,Y

^FO20,30^A0N,28,28^FDPALLET^FS
^FO${pallet.is_sealed ? 600 : 620},30^A0N,28,28^FD${status}^FS

^FO20,80^GB770,3,3^FS

^FO20,110^A0N,80,80^FD${pallet.pallet_code}^FS

^FO20,210^GB770,3,3^FS

^FO20,240^A0N,40,40^FDItems: ${itemCount}^FS

^FO20,320^A0N,30,30^FDDate: ${date}^FS
${creator ? `^FO20,365^A0N,30,30^FDBy: ${creator}^FS` : ''}

^FO560,220^BQN,2,10^FDMA${pallet.pallet_code}^FS

^XZ`
}

// ── Screen preview ────────────────────────────────────────────────────────────

function LabelPreview({ pallet }) {
  const itemCount = pallet.total_items ?? (pallet.items?.length ?? 0)
  const date      = fmtDate(pallet.created_at)

  return (
    <div
      className="relative bg-white border-2 border-dashed border-gray-300 rounded-md overflow-hidden"
      style={{ width: 380, padding: 16, fontFamily: 'monospace' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: 3 }}>PALLET</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: pallet.is_sealed ? '#dcfce7' : '#fef3c7',
          color: pallet.is_sealed ? '#15803d' : '#b45309',
          border: `1px solid ${pallet.is_sealed ? '#86efac' : '#fcd34d'}`,
        }}>
          {pallet.is_sealed ? 'SEALED' : 'OPEN'}
        </span>
      </div>

      <div style={{ height: 1, background: '#e5e7eb', marginBottom: 10 }} />

      {/* Pallet code — large */}
      <p style={{ fontSize: 22, fontWeight: 900, color: '#ea580c', letterSpacing: 1, marginBottom: 10 }}>
        {pallet.pallet_code}
      </p>

      <div style={{ height: 1, background: '#e5e7eb', marginBottom: 10 }} />

      {/* Body + QR side by side */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Items: {itemCount}</p>
          <p style={{ fontSize: 11, color: '#6b7280' }}>Date: {date}</p>
          {pallet.created_by_name && (
            <p style={{ fontSize: 11, color: '#6b7280' }}>By: {pallet.created_by_name}</p>
          )}
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 7, color: '#9ca3af', marginBottom: 4, letterSpacing: 1 }}>SCAN</p>
          <QRCodeSVG value={pallet.pallet_code} size={80} level="M" />
        </div>
      </div>
    </div>
  )
}

// ── Print preview (new tab) ───────────────────────────────────────────────────

function openPalletPrintPreview(pallet) {
  const win = window.open('', '_blank')
  if (!win) { alert('Allow pop-ups to use Print Preview'); return }

  const itemCount   = pallet.total_items ?? (pallet.items?.length ?? 0)
  const date        = fmtDate(pallet.created_at)
  const status      = pallet.is_sealed ? 'SEALED' : 'OPEN'
  const statusColor = pallet.is_sealed ? '#15803d' : '#b45309'
  const statusBg    = pallet.is_sealed ? '#dcfce7' : '#fef3c7'
  const byLine      = pallet.created_by_name
    ? `<p class="meta">By: ${pallet.created_by_name}</p>`
    : ''

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Pallet Label — ${pallet.pallet_code}</title>
  <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f0f0f0; padding: 20px; font-family: 'Courier New', monospace; }
    .controls { margin-bottom: 16px; display: flex; gap: 8px; align-items: center; }
    .controls button { padding: 8px 16px; background: #f97316; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .label {
      width: 384px; background: white;
      border: 2px dashed #ccc; border-radius: 8px; padding: 16px;
    }
    .label-header  { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .label-title   { font-size: 11px; font-weight: 700; letter-spacing: 3px; color: #374151; }
    .status-badge  { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px;
                     background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusColor}40; }
    .divider       { height: 1px; background: #e5e7eb; margin: 8px 0; }
    .pallet-code   { font-size: 24px; font-weight: 900; color: #ea580c; letter-spacing: 1px; margin: 8px 0; }
    .body-row      { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4px; }
    .item-count    { font-size: 17px; font-weight: 700; color: #111827; margin-bottom: 6px; }
    .meta          { font-size: 11px; color: #6b7280; margin-top: 4px; }
    .qr-block      { text-align: center; }
    .qr-label      { font-size: 7px; color: #9ca3af; letter-spacing: 1px; margin-bottom: 4px; }
    @media print {
      body { background: white; padding: 0; }
      .controls { display: none; }
    }
  </style>
</head>
<body>
  <div class="controls">
    <button onclick="window.print()">Print / Save PDF</button>
    <span style="font-size:13px;color:#555">Pallet: ${pallet.pallet_code}</span>
  </div>
  <div class="label">
    <div class="label-header">
      <span class="label-title">PALLET</span>
      <span class="status-badge">${status}</span>
    </div>
    <div class="divider"></div>
    <div class="pallet-code">${pallet.pallet_code}</div>
    <div class="divider"></div>
    <div class="body-row">
      <div>
        <p class="item-count">Items: ${itemCount}</p>
        <p class="meta">Date: ${date}</p>
        ${byLine}
      </div>
      <div class="qr-block" id="qr-container">
        <div class="qr-label">SCAN</div>
      </div>
    </div>
  </div>
  <script>
    var qr = qrcode(0, 'M');
    qr.addData(${JSON.stringify(pallet.pallet_code)});
    qr.make();
    var img = qr.createImgTag(3, 0);
    var div = document.createElement('div');
    div.innerHTML = img;
    var imgEl = div.querySelector('img');
    imgEl.style.width = '80px';
    imgEl.style.height = '80px';
    imgEl.style.imageRendering = 'pixelated';
    document.getElementById('qr-container').appendChild(imgEl);
  </script>
</body>
</html>`)
  win.document.close()
}

// ── ZPL download ──────────────────────────────────────────────────────────────

function downloadPalletZPL(pallet) {
  const zpl  = buildPalletZPL(pallet)
  const blob = new Blob([zpl], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `pallet-${pallet.pallet_code}.zpl`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Zebra Browser Print hook ──────────────────────────────────────────────────

function useZebraPrinters() {
  const [printers, setPrinters]        = useState([])
  const [selectedPrinter, setSelected] = useState(null)
  const [zebraAvailable, setAvailable] = useState(false)

  useEffect(() => {
    if (typeof window.BrowserPrint === 'undefined') { setAvailable(false); return }
    setAvailable(true)
    window.BrowserPrint.getLocalDevices(
      (devs) => {
        const list = devs || []
        setPrinters(list)
        if (list.length > 0) setSelected(list[0])
      },
      () => setPrinters([]),
      'printer'
    )
  }, [])

  return { printers, selectedPrinter, setSelected, zebraAvailable }
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function PalletLabelModal({ pallet, onClose }) {
  const { printers, selectedPrinter, setSelected, zebraAvailable } = useZebraPrinters()
  const [printing, setPrinting] = useState(false)
  const [printMsg, setPrintMsg] = useState('')

  const handleZebraPrint = () => {
    if (!selectedPrinter) return
    setPrinting(true)
    setPrintMsg('')
    const zpl = buildPalletZPL(pallet)
    selectedPrinter.send(
      zpl,
      () => { setPrinting(false); setPrintMsg('Sent to printer successfully.') },
      (err) => { setPrinting(false); setPrintMsg(`Printer error: ${err}`) }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div>
            <h2 className="text-base font-bold text-gray-900">Print Pallet Label</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {pallet.pallet_code} · {pallet.total_items ?? (pallet.items?.length ?? 0)} item{(pallet.total_items ?? pallet.items?.length ?? 0) !== 1 ? 's' : ''} · {pallet.is_sealed ? 'Sealed' : 'Open'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-full transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* Label preview */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Label Preview (4" × 6" / 102 × 152 mm)
            </p>
            <div className="flex justify-center">
              <LabelPreview pallet={pallet} />
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => openPalletPrintPreview(pallet)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="text-xs font-medium">Print Preview</span>
              <span className="text-[10px] text-gray-400">Browser / PDF</span>
            </button>

            <button
              onClick={() => downloadPalletZPL(pallet)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="text-xs font-medium">Download ZPL</span>
              <span className="text-[10px] text-gray-400">For Zebra printer</span>
            </button>

            <button
              onClick={handleZebraPrint}
              disabled={!zebraAvailable || !selectedPrinter || printing}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span className="text-xs font-medium">{printing ? 'Sending…' : 'Print via Zebra'}</span>
              <span className="text-[10px] text-gray-400">
                {zebraAvailable
                  ? (printers.length > 0 ? 'Direct to printer' : 'No printers found')
                  : 'Browser Print not running'}
              </span>
            </button>
          </div>

          {zebraAvailable && printers.length > 0 && (
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Zebra Printer</label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                onChange={e => setSelected(printers[parseInt(e.target.value)])}
              >
                {printers.map((p, i) => (
                  <option key={i} value={i}>{p.name || `Printer ${i + 1}`}</option>
                ))}
              </select>
            </div>
          )}

          {!zebraAvailable && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
              <strong>Zebra Browser Print not detected.</strong> Install and run Zebra Browser Print on this PC to print directly. Use Print Preview or Download ZPL in the meantime.
            </div>
          )}

          {printMsg && (
            <p className={`text-xs text-center font-medium ${printMsg.startsWith('Sent') ? 'text-green-600' : 'text-red-500'}`}>
              {printMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
