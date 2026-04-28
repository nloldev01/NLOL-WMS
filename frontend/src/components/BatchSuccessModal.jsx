import React, { useRef } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';

const BatchSuccessModal = ({ log, onClose }) => {
  const qrRef = useRef();
  const printRef = useRef();

  if (!log || !log.batch_code) return null;

  const qrData = {
    type: log.lpn_code ? 'lpn' : 'batch',
    id: log.lpn || log.batch,
    code: log.lpn_code || log.batch_code
  };

  const handlePrint = () => {
    const printContents = printRef.current?.innerHTML;
    if (!printContents) return;

    const win = window.open('', '_blank', 'width=560,height=320');
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Label – ${log.lpn_code || log.batch_code}</title>
          <style>
            @page {
              size: 70mm 40mm;
              margin: 0;
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              background: #fff;
              width: 70mm;
              height: 40mm;
              overflow: hidden;
            }
            .label {
              display: flex;
              width: 70mm;
              height: 40mm;
              padding: 5mm 6mm;
              background: #fff;
              gap: 5mm;
            }
            .label-left {
              flex: 1;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              gap: 2mm;
            }
            .label-right {
              width: 22mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 1.5mm;
              padding-left: 4mm;
              border-left: 0.3mm solid #e2e8f0;
            }
            .product-name {
              font-size: 5.5pt;
              font-weight: 800;
              color: #94a3b8;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              text-transform: uppercase;
              letter-spacing: 0.6px;
              margin-bottom: 1mm;
            }
            .lpn-code {
              font-family: "Courier New", monospace;
              font-size: 13pt;
              font-weight: 900;
              color: #0f172a;
              line-height: 1.1;
              letter-spacing: -0.3px;
              margin-bottom: 1.5mm;
            }
            .batch-code {
              font-size: 6.5pt;
              font-weight: 700;
              color: #475569;
              margin-bottom: 1mm;
            }
            .divider {
              height: 0.3mm;
              background: #f1f5f9;
              margin: 1mm 0;
            }
            .meta-row {
              display: flex;
              gap: 5mm;
              margin-top: auto;
            }
            .meta-item {}
            .meta-label {
              font-size: 4.5pt;
              font-weight: 700;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 0.4px;
              margin-bottom: 0.5mm;
            }
            .meta-value {
              font-size: 6pt;
              font-weight: 700;
              color: #334155;
            }
            .scan-label {
              font-size: 4.5pt;
              font-weight: 700;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 0.4px;
              text-align: center;
            }
            svg {
              width: 18mm !important;
              height: 18mm !important;
            }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="label-left">
              <div class="product-name">${log.product_name || log.material_name}</div>
              <div class="lpn-code">${log.lpn_code || log.batch_code}</div>
              ${log.lpn_code ? `<div class="batch-code">B: ${log.batch_code}</div>` : ''}
              <div class="divider"></div>
              <div class="meta-row">
                <div class="meta-item">
                  <div class="meta-label">Date</div>
                  <div class="meta-value">${new Date().toLocaleDateString()}</div>
                </div>
                <div class="meta-item">
                  <div class="meta-label">Qty</div>
                  <div class="meta-value">${log.quantity || ''} ${log.unit || ''}</div>
                </div>
                <div class="meta-item">
                  <div class="meta-label">Location</div>
                  <div class="meta-value">${log.location_name || ''}</div>
                </div>
              </div>
            </div>
            <div class="label-right">
              ${printRef.current?.querySelector('svg')?.outerHTML || ''}
              <div class="scan-label">Scan to Track</div>
            </div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 300);
  };

  const handleDownload = () => {
    const originalSvg = printRef.current?.querySelector('svg');
    if (!originalSvg) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const SCALE = 4;

    // Label: 264 x 151 px @ 1x → sticker proportions (roughly 70x40mm)
    const labelW = 264 * SCALE;
    const labelH = 151 * SCALE;
    const OUTER_MARGIN = 6 * SCALE;
    const W = labelW + OUTER_MARGIN * 2;
    const H = labelH + OUTER_MARGIN * 2;

    canvas.width = W;
    canvas.height = H;

    // Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, W, H);

    // Card
    ctx.translate(OUTER_MARGIN, OUTER_MARGIN);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.07)';
    ctx.shadowBlur = 14 * SCALE;
    ctx.shadowOffsetY = 3 * SCALE;
    ctx.fillRect(0, 0, labelW, labelH);
    ctx.shadowColor = 'transparent';

    // Card border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.6 * SCALE;
    ctx.strokeRect(0, 0, labelW, labelH);

    // QR column width
    const qrColW = 80 * SCALE;
    const dividerX = labelW - qrColW;

    // Divider line
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5 * SCALE;
    ctx.beginPath();
    ctx.moveTo(dividerX, 12 * SCALE);
    ctx.lineTo(dividerX, labelH - 12 * SCALE);
    ctx.stroke();

    // === LEFT SIDE ===
    const padX = 18 * SCALE;
    const padY = 18 * SCALE;

    // Product name
    ctx.fillStyle = '#94a3b8';
    ctx.font = `700 ${5.5 * SCALE * 1.33}px Helvetica, Arial, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const name = (log.product_name || log.material_name || '').toUpperCase();
    ctx.fillText(name.length > 28 ? name.slice(0, 28) + '…' : name, padX, padY);

    // LPN Code
    ctx.fillStyle = '#0f172a';
    ctx.font = `900 ${13 * SCALE * 1.33}px "Courier New", monospace`;
    ctx.fillText(log.lpn_code || log.batch_code, padX, padY + 9 * SCALE);

    // Batch code
    if (log.lpn_code) {
      ctx.fillStyle = '#475569';
      ctx.font = `700 ${6.5 * SCALE * 1.33}px Helvetica, Arial, sans-serif`;
      ctx.fillText(`B: ${log.batch_code}`, padX, padY + 30 * SCALE);
    }

    // Divider rule
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 0.5 * SCALE;
    ctx.beginPath();
    ctx.moveTo(padX, labelH - 38 * SCALE);
    ctx.lineTo(dividerX - 14 * SCALE, labelH - 38 * SCALE);
    ctx.stroke();

    // Date label + value
    ctx.fillStyle = '#94a3b8';
    ctx.font = `700 ${4.5 * SCALE * 1.33}px Helvetica, Arial, sans-serif`;
    ctx.fillText('DATE', padX, labelH - 32 * SCALE);
    ctx.fillStyle = '#334155';
    ctx.font = `700 ${6 * SCALE * 1.33}px Helvetica, Arial, sans-serif`;
    ctx.fillText(new Date().toLocaleDateString(), padX, labelH - 24 * SCALE);

    // Qty label + value
    const qtyX = padX + 55 * SCALE;
    ctx.fillStyle = '#94a3b8';
    ctx.font = `700 ${4.5 * SCALE * 1.33}px Helvetica, Arial, sans-serif`;
    ctx.fillText('QTY', qtyX, labelH - 32 * SCALE);
    ctx.fillStyle = '#334155';
    ctx.font = `700 ${6 * SCALE * 1.33}px Helvetica, Arial, sans-serif`;
    ctx.fillText(`${log.quantity || ''} ${log.unit || ''}`.trim(), qtyX, labelH - 24 * SCALE);

    // === RIGHT SIDE: QR Code ===
    const svgData = new XMLSerializer().serializeToString(originalSvg);
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const qrSize = 58 * SCALE;
      const qrX = dividerX + (qrColW - qrSize) / 2;
      const qrY = (labelH - qrSize) / 2 - 6 * SCALE;
      ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

      // Scan label
      ctx.fillStyle = '#94a3b8';
      ctx.font = `700 ${4.5 * SCALE * 1.33}px Helvetica, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('SCAN TO TRACK', dividerX + qrColW / 2, qrY + qrSize + 6 * SCALE);

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `Label-${log.lpn_code || log.batch_code}.png`;
      link.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <>
      {/* Hidden SVG for QR extraction */}
      <div style={{ display: 'none' }}>
        <div ref={printRef}>
          <QRCodeSVG value={JSON.stringify(qrData)} size={72} level="H" />
        </div>
      </div>

      {/* Modal UI */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">

          {/* Header */}
          <div className="bg-slate-900 px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center text-white flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-bold text-sm leading-none">Movement Recorded</h3>
                <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest mt-0.5">{log.lpn_code ? 'LPN Label Ready' : 'Batch Label Ready'}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="p-6 flex gap-6 items-start">
            {/* Left: Info */}
            <div className="flex-1 space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Item</label>
                <h4 className="text-base font-bold text-slate-800 leading-tight">{log.product_name || log.material_name}</h4>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">{log.lpn_code ? 'LPN Code' : 'Batch Code'}</label>
                <p className={`text-xl font-mono font-black tracking-tight ${log.lpn_code ? 'text-indigo-600' : 'text-orange-600'}`}>
                  {log.lpn_code || log.batch_code}
                </p>
                {log.lpn_code && (
                  <p className="text-xs font-bold text-slate-400 mt-1">Batch: {log.batch_code}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Quantity</label>
                  <p className="text-xs font-bold text-slate-700">{log.quantity} {log.unit}</p>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Date</label>
                  <p className="text-xs font-bold text-slate-700">{new Date(log.created_at).toLocaleDateString()}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Movement</label>
                  <p className="text-xs font-bold text-slate-700 capitalize">{log.movement_type.replace('_', ' ')}</p>
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Movement Path</label>
                  <div className="flex flex-col gap-1.5">
                    {/* FROM logic */}
                    {(log.movement_type === 'transfer_out' || log.movement_type === 'transfer_in' || ['sale', 'usage', 'wastage', 'purchase_return', 'adjustment'].includes(log.movement_type)) && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-rose-400 shadow-sm" />
                        <span className="text-[10px] font-bold text-slate-400 min-w-[32px]">FROM</span>
                        <span className="text-[11px] font-bold text-slate-600">
                          {log.movement_type === 'transfer_in' ? log.counterpart_location_name : log.location_name}
                        </span>
                      </div>
                    )}
                    
                    {/* Arrow for transfers */}
                    {log.movement_type.includes('transfer') && (
                      <div className="pl-1 py-0.5">
                        <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </div>
                    )}

                    {/* TO logic */}
                    {(log.movement_type === 'transfer_out' || log.movement_type === 'transfer_in' || ['production', 'purchase', 'sale_return', 'adjustment_in'].includes(log.movement_type)) && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm" />
                        <span className="text-[10px] font-bold text-slate-400 min-w-[32px]">TO</span>
                        <span className="text-[11px] font-bold text-slate-600">
                          {log.movement_type === 'transfer_out' ? log.counterpart_location_name : log.location_name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {log.reference && (
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Reference</label>
                    <p className="text-xs font-medium text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-100 italic">"{log.reference}"</p>
                  </div>
                )}
                {log.notes && (
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Notes</label>
                    <p className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">{log.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: QR */}
            {log.lpn_code ? (
              <div ref={qrRef} className="flex-shrink-0 flex flex-col items-center gap-2 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <QRCodeCanvas
                  value={JSON.stringify(qrData)}
                  size={110}
                  level="H"
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scan to Track</p>
              </div>
            ) : (
              <div className="flex-shrink-0 w-32 h-32 flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-300">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
            >
              Skip
            </button>
            {log.lpn_code && (
              <>
                <button
                  onClick={handleDownload}
                  className="px-5 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-700 transition-all flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PNG
                </button>
                <button
                  onClick={handlePrint}
                  className="px-5 py-2 bg-orange-500 text-white rounded-lg text-xs font-bold hover:bg-orange-600 transition-all shadow-md shadow-orange-200 flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print Label
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default BatchSuccessModal;