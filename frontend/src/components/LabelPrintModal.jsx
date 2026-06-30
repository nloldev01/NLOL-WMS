import { useRef, useEffect, useState } from 'react'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'

// Update this base URL when the redemption page is ready
const REDEEM_BASE = 'https://nlol.com/redeem'

function buildIdentityData(data) {
  return JSON.stringify({
    p: data.product_name,
    v: data.variant_label,
    b: data.batch_code,
    d: data.produced_at,
  })
}

function buildRedeemUrl(redeemCode) {
  return `${REDEEM_BASE}?code=${redeemCode}`
}

function buildZPL(data, copies) {
  const idData   = buildIdentityData(data)
  const redeemUrl = buildRedeemUrl(data.redeem_code)
  return `^XA
^CI28
^PQ${copies},0,1,Y
^FO15,12^A0N,24,24^FD${data.product_name || ''}^FS
^FO15,40^A0N,18,18^FD${data.variant_label || ''}^FS
^FO15,62^A0N,14,14^FDBatch: ${data.batch_code || ''}^FS
^FO15,80^A0N,14,14^FDLPN: ${data.lpn_code || ''}^FS
^FO15,98^A0N,14,14^FD${data.produced_at || ''}^FS
^FO15,118^A0N,11,11^FDIDENTITY^FS
^FO15,130^BQN,2,4^FDMA${idData}^FS
^FO195,118^A0N,11,11^FDREDEEM^FS
^FO195,130^BQN,2,4^FDMA${redeemUrl}^FS
^XZ`
}

// ── Single label preview rendered at screen size ──────────────────────────────
function LabelPreview({ data }) {
  const idData    = buildIdentityData(data)
  const redeemUrl = buildRedeemUrl(data.redeem_code)

  return (
    <div
      className="relative bg-white border-2 border-dashed border-gray-300 rounded-md overflow-hidden"
      style={{ width: 340, height: 194, fontFamily: 'monospace' }}
    >
      {/* Text block */}
      <div className="absolute top-3 left-3 max-w-[155px]">
        <p className="font-bold text-gray-900 leading-tight" style={{ fontSize: 11 }}>{data.product_name}</p>
        <p className="text-gray-700 leading-tight mt-0.5" style={{ fontSize: 9 }}>{data.variant_label}</p>
        <p className="text-gray-500 mt-1" style={{ fontSize: 8 }}>Batch: {data.batch_code}</p>
        <p className="text-gray-500" style={{ fontSize: 8 }}>LPN: {data.lpn_code}</p>
        <p className="text-gray-500" style={{ fontSize: 8 }}>{data.produced_at}</p>
      </div>

      {/* Identity QR */}
      <div className="absolute" style={{ left: 10, bottom: 10 }}>
        <p className="text-center text-gray-400 mb-0.5" style={{ fontSize: 7 }}>IDENTITY</p>
        <QRCodeSVG value={idData} size={80} level="H" />
      </div>

      {/* Redeem QR */}
      <div className="absolute" style={{ right: 10, bottom: 10 }}>
        <p className="text-center text-gray-400 mb-0.5" style={{ fontSize: 7 }}>REDEEM</p>
        <QRCodeSVG value={redeemUrl} size={80} level="H" />
      </div>

      {/* Qty badge */}
      <div className="absolute top-2 right-2 bg-gray-100 rounded px-1.5 py-0.5 text-gray-500" style={{ fontSize: 8 }}>
        ×{data.quantity} {data.unit_name}
      </div>
    </div>
  )
}

// ── Print preview: opens a new tab with N labels laid out ─────────────────────
function openPrintPreview(data) {
  const idData    = buildIdentityData(data)
  const redeemUrl = buildRedeemUrl(data.redeem_code)

  // Generate N QR code canvases as data-URLs client-side
  // We pass the raw strings into the new window and regenerate QRs there
  // using a small inline script with qrcode-generator (loaded from CDN)

  const win = window.open('', '_blank')
  if (!win) { alert('Allow pop-ups to use Print Preview'); return }

  const product_name   = data.product_name || ''
  const variant_label  = data.variant_label || ''
  const batch_code     = data.batch_code || ''
  const lpn_code       = data.lpn_code || ''
  const produced_at    = data.produced_at || ''
  const quantity       = data.quantity
  const unit_name      = data.unit_name || ''

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Labels — ${product_name}</title>
  <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f0f0f0; padding: 20px; font-family: Arial, sans-serif; }
    .page { display: flex; flex-wrap: wrap; gap: 8px; }
    .label {
      width: 264px; height: 151px;
      background: white;
      border: 1px solid #ccc;
      position: relative;
      padding: 8px;
      page-break-inside: avoid;
    }
    .text-block { max-width: 140px; }
    .text-block .name  { font-size: 10px; font-weight: bold; line-height: 1.2; }
    .text-block .var   { font-size: 8px; color: #444; margin-top: 2px; }
    .text-block .meta  { font-size: 7px; color: #666; margin-top: 3px; }
    .qr-block { position: absolute; bottom: 8px; display: flex; flex-direction: column; align-items: center; }
    .qr-block.left  { left: 10px; }
    .qr-block.right { right: 10px; }
    .qr-label { font-size: 6px; color: #999; text-align: center; margin-bottom: 2px; letter-spacing: 1px; }
    canvas { display: block; }
    .controls { margin-bottom: 16px; display: flex; gap: 8px; align-items: center; }
    .controls button { padding: 8px 16px; background: #f97316; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .controls button:hover { background: #ea580c; }
    @media print {
      body { background: white; padding: 0; }
      .controls { display: none; }
      .page { gap: 4px; }
    }
  </style>
</head>
<body>
  <div class="controls">
    <button onclick="window.print()">Print / Save PDF</button>
    <span style="font-size:13px;color:#555">${quantity} labels — ${product_name} ${variant_label}</span>
  </div>
  <div class="page" id="labels"></div>
  <script>
    function makeQR(text, size) {
      var qr = qrcode(0, 'H');
      qr.addData(text);
      qr.make();
      var img = qr.createImgTag(Math.floor(size / qr.getModuleCount()), 0);
      var div = document.createElement('div');
      div.innerHTML = img;
      var imgEl = div.querySelector('img');
      imgEl.style.width = size + 'px';
      imgEl.style.height = size + 'px';
      imgEl.style.imageRendering = 'pixelated';
      return imgEl;
    }

    var container = document.getElementById('labels');
    for (var i = 0; i < ${quantity}; i++) {
      var label = document.createElement('div');
      label.className = 'label';
      label.innerHTML = \`
        <div class="text-block">
          <div class="name">${product_name}</div>
          <div class="var">${variant_label}</div>
          <div class="meta">Batch: ${batch_code}</div>
          <div class="meta">LPN: ${lpn_code}</div>
          <div class="meta">${produced_at}</div>
        </div>
      \`;

      var idBlock = document.createElement('div');
      idBlock.className = 'qr-block left';
      idBlock.innerHTML = '<div class="qr-label">IDENTITY</div>';
      idBlock.appendChild(makeQR(${JSON.stringify(idData)}, 62));
      label.appendChild(idBlock);

      var rdBlock = document.createElement('div');
      rdBlock.className = 'qr-block right';
      rdBlock.innerHTML = '<div class="qr-label">REDEEM</div>';
      rdBlock.appendChild(makeQR(${JSON.stringify(redeemUrl)}, 62));
      label.appendChild(rdBlock);

      container.appendChild(label);
    }
  </script>
</body>
</html>`)
  win.document.close()
}

// ── ZPL download ─────────────────────────────────────────────────────────────
function downloadZPL(data) {
  const zpl  = buildZPL(data, data.quantity)
  const blob = new Blob([zpl], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `labels-${data.batch_code || 'order'}.zpl`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Zebra Browser Print ───────────────────────────────────────────────────────
function useZebraPrinters() {
  const [printers, setPrinters]         = useState([])
  const [selectedPrinter, setSelected]  = useState(null)
  const [zebraAvailable, setAvailable]  = useState(false)

  useEffect(() => {
    if (typeof window.BrowserPrint === 'undefined') {
      setAvailable(false)
      return
    }
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
const LabelPrintModal = ({ data, onClose }) => {
  const { printers, selectedPrinter, setSelected, zebraAvailable } = useZebraPrinters()
  const [printing, setPrinting] = useState(false)
  const [printMsg, setPrintMsg] = useState('')

  const handleZebraPrint = () => {
    if (!selectedPrinter) return
    setPrinting(true)
    setPrintMsg('')
    const zpl = buildZPL(data, data.quantity)
    selectedPrinter.send(
      zpl,
      () => { setPrinting(false); setPrintMsg('Sent to printer successfully.') },
      (err) => { setPrinting(false); setPrintMsg(`Printer error: ${err}`) }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div>
            <h2 className="text-base font-bold text-gray-900">Print Labels</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {data.quantity} × {data.variant_label} — {data.batch_code ? `Batch ${data.batch_code}` : data.assembly_number}
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
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Label Preview (70 × 40 mm)</p>
            <div className="flex justify-center">
              <LabelPreview data={data} />
            </div>
            <p className="text-center text-[10px] text-gray-400 mt-2">
              {data.quantity} identical labels will be printed
            </p>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-3">

            {/* Print preview */}
            <button
              onClick={() => openPrintPreview(data)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="text-xs font-medium">Print Preview</span>
              <span className="text-[10px] text-gray-400">Browser / PDF</span>
            </button>

            {/* Download ZPL */}
            <button
              onClick={() => downloadZPL(data)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="text-xs font-medium">Download ZPL</span>
              <span className="text-[10px] text-gray-400">For Zebra printer</span>
            </button>

            {/* Zebra direct print */}
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
                {zebraAvailable ? (printers.length > 0 ? 'Direct to printer' : 'No printers found') : 'Browser Print not running'}
              </span>
            </button>
          </div>

          {/* Zebra printer selector */}
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

          {/* Zebra not available notice */}
          {!zebraAvailable && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
              <strong>Zebra Browser Print not detected.</strong> To print directly, install Zebra Browser Print on this PC and make sure it is running. Use Print Preview or Download ZPL in the meantime.
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

export default LabelPrintModal
