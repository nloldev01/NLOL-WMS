import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';

const PAGE_SIZE = 10;

// ─── tiny helpers ────────────────────────────────────────────────────────────
const fmt = (n) =>
  typeof n === 'number'
    ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

// ─── Upload state machine ─────────────────────────────────────────────────────
// idle → parsing → preview → confirming → done
//                          ↘ idle (cancel)

export default function SalesBillsTable() {
  // ── Invoice list ──────────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // ── Upload flow ───────────────────────────────────────────────────────────
  const [uploadStage, setUploadStage] = useState('idle'); // idle|parsing|preview|confirming|done
  const [previewData, setPreviewData] = useState(null);   // { summary, invoices }
  const [confirmResult, setConfirmResult] = useState(null);
  const [uploadError, setUploadError] = useState('');

  // expanded bill rows in preview
  const [expandedBills, setExpandedBills] = useState({});

  const fileInputRef = useRef(null);
  const csvInputRef  = useRef(null);

  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError,     setCsvError]     = useState('');
  const [csvResult,    setCsvResult]    = useState(null);
  const [showCsvDone,  setShowCsvDone]  = useState(false);

  // ── Fetch invoices ────────────────────────────────────────────────────────
  useEffect(() => { fetchInvoices(); }, []);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/sales/invoices/');
      if (res.ok) {
        const data = await res.json();
        setInvoices(Array.isArray(data) ? data : (data.results ?? []));
      }
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1 — send file → /upload-excel/preview/ (no DB write)
  // ─────────────────────────────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';                       // reset so same file can be re-picked

    if (!file.name.match(/\.xlsx?$/i)) {
      setUploadError('Please upload an Excel (.xlsx / .xls) file.');
      return;
    }

    setUploadError('');
    setUploadStage('parsing');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('/sales/invoices/upload-excel/preview/', {
        method: 'POST',
        body: formData,
      });

      const body = await res.json();

      if (!res.ok) {
        setUploadError(body.detail || 'Preview failed — check the file and try again.');
        setUploadStage('idle');
        return;
      }

      setPreviewData(body);          // { summary: { total_invoices, total_items }, invoices: [...] }
      setExpandedBills({});
      setUploadStage('preview');
    } catch {
      setUploadError('Network error while parsing the file.');
      setUploadStage('idle');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2 — POST normalised JSON → /upload-excel/confirm/ (DB write)
  // ─────────────────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!previewData) return;

    setUploadStage('confirming');
    setUploadError('');

    const formData = new FormData();
    formData.append('invoices', JSON.stringify(previewData.invoices));

    try {
      const res = await apiFetch('/sales/invoices/upload-excel/confirm/', {
        method: 'POST',
        body: formData,  // no Content-Type header — browser sets multipart automatically
      });

      const body = await res.json();

      if (!res.ok) {
        setUploadError(body.detail || 'Save failed.');
        setUploadStage('preview');   // let user retry or cancel
        return;
      }

      setConfirmResult(body);        // { message, summary, errors }
      setUploadStage('done');
      fetchInvoices();               // refresh table
    } catch {
      setUploadError('Network error while saving.');
      setUploadStage('preview');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Cancel / reset upload flow
  // ─────────────────────────────────────────────────────────────────────────
  const resetUpload = () => {
    setUploadStage('idle');
    setPreviewData(null);
    setConfirmResult(null);
    setUploadError('');
    setExpandedBills({});
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CSV upload → save directly to DB
  // ─────────────────────────────────────────────────────────────────────────
  const handleCsvUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    if (!file.name.match(/\.csv$/i)) {
      setCsvError('Please upload a CSV file.');
      return;
    }

    setCsvError('');
    setCsvUploading(true);
    setShowCsvDone(false);
    setCsvResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res  = await apiFetch('/sales/invoices/upload-csv/', {
        method: 'POST',
        body: formData,
      });
      const body = await res.json();

      if (!res.ok) {
        setCsvError(body.detail || 'CSV upload failed.');
      } else {
        setCsvResult(body);
        setShowCsvDone(true);
        fetchInvoices();
      }
    } catch {
      setCsvError('Network error while uploading CSV.');
    } finally {
      setCsvUploading(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────
  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    return (
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.customer_name?.toLowerCase().includes(q) ||
      inv.customer?.customer_name?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearch = (v) => { setSearch(v); setPage(1); };

  const toggleBill = (idx) =>
    setExpandedBills((prev) => ({ ...prev, [idx]: !prev[idx] }));

  // ─────────────────────────────────────────────────────────────────────────
  // Download normalised data as CSV
  // ─────────────────────────────────────────────────────────────────────────
  const downloadCSV = () => {
    if (!previewData?.invoices) return;

    const rows = [];
    // Header
    rows.push([
      'bill_no', 'bill_date',
      'customer_code', 'customer_name',
      'gross_amount', 'discount', 'net_amount',
      'product_name', 'batch', 'expiry',
      'quantity', 'free_quantity', 'unit', 'rate', 'amount',
    ]);

    // One row per line item (invoice fields repeat for each item)
    for (const inv of previewData.invoices) {
      for (const item of inv.items) {
        rows.push([
          inv.bill_no,
          inv.bill_date ?? '',
          inv.customer_code ?? '',
          inv.customer_name,
          inv.gross_amount,
          inv.discount,
          inv.net_amount,
          item.product_name,
          item.batch ?? '',
          item.expiry ?? '',
          item.quantity,
          item.free_quantity,
          item.unit ?? '',
          item.rate,
          item.amount,
        ]);
      }
    }

    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'finpro_normalized.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Main table card ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Sales Bills / Invoices</h2>

          <div className="flex items-center gap-3">
            {/* Search */}
            <input
              type="text"
              placeholder="Search invoice or customer…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-56 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />

            {/* Upload button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadStage === 'parsing'}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-lg transition-colors"
            >
              {uploadStage === 'parsing'
                ? <><Spinner /> Parsing…</>
                : <><UploadIcon /> Upload FinPro Excel</>
              }
            </button>

            {/* CSV upload button */}
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="hidden"
            />
            <button
              onClick={() => csvInputRef.current?.click()}
              disabled={csvUploading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg transition-colors"
            >
              {csvUploading
                ? <><Spinner /> Uploading…</>
                : <><UploadIcon /> Upload CSV Data</>
              }
            </button>
          </div>
        </div>

        {/* Inline error — Excel upload */}
        {uploadError && uploadStage === 'idle' && (
          <div className="mx-6 mt-4 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <span className="mt-0.5">⚠️</span>
            <span>{uploadError}</span>
          </div>
        )}

        {/* Inline error — CSV upload */}
        {csvError && (
          <div className="mx-6 mt-4 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <span className="mt-0.5">⚠️</span>
            <span>{csvError}</span>
          </div>
        )}

        {/* CSV upload success banner */}
        {showCsvDone && csvResult && (
          <div className="mx-6 mt-4 p-3 text-sm bg-blue-50 border border-blue-200 rounded-lg flex items-start justify-between gap-2">
            <div className="text-blue-800">
              <span className="font-semibold">CSV imported — </span>
              {csvResult.summary?.invoices_created ?? 0} invoice{csvResult.summary?.invoices_created !== 1 ? 's' : ''} created
              {csvResult.summary?.failed > 0 && (
                <span className="text-red-600 ml-2">· {csvResult.summary.failed} failed</span>
              )}
            </div>
            <button onClick={() => setShowCsvDone(false)} className="text-blue-400 hover:text-blue-600 text-base leading-none shrink-0">×</button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 flex justify-center">
              <Spinner className="text-emerald-600 w-6 h-6" />
            </div>
          ) : paginated.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              {search ? 'No invoices match your search.' : 'No invoices yet. Upload a FinPro Excel to get started.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-3">Invoice #</th>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3 text-right">Gross</th>
                  <th className="px-6 py-3 text-right">Discount</th>
                  <th className="px-6 py-3 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3 font-mono text-emerald-700 font-medium">{inv.invoice_number}</td>
                    <td className="px-6 py-3 text-gray-800">{inv.customer?.customer_name ?? inv.customer_name ?? '—'}</td>
                    <td className="px-6 py-3 text-gray-500">{fmtDate(inv.invoice_date)}</td>
                    <td className="px-6 py-3 text-right text-gray-700">{fmt(inv.gross_amount)}</td>
                    <td className="px-6 py-3 text-right text-red-500">{fmt(inv.discount)}</td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">{fmt(inv.net_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</span>
            <div className="flex items-center gap-1">
              <PageBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</PageBtn>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce((acc, p, idx, arr) => {
                  if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '…'
                    ? <span key={`e${i}`} className="px-1">…</span>
                    : <PageBtn key={p} onClick={() => setPage(p)} active={page === p}>{p}</PageBtn>
                )}
              <PageBtn onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</PageBtn>
            </div>
          </div>
        )}
      </div>

      {/* ── Preview / Confirm modal ── */}
      {(uploadStage === 'preview' || uploadStage === 'confirming' || uploadStage === 'done') && (
        <Modal onClose={uploadStage !== 'confirming' ? resetUpload : undefined}>
          {uploadStage === 'done' ? (
            // ── Done screen ────────────────────────────────────────────────
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xl">✓</div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">Import Complete</h3>
                  <p className="text-sm text-gray-500">{confirmResult?.message}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Submitted" value={confirmResult?.summary?.total_submitted} />
                <StatCard label="Created" value={confirmResult?.summary?.invoices_created} color="emerald" />
                <StatCard label="Failed" value={confirmResult?.summary?.failed} color={confirmResult?.summary?.failed > 0 ? 'red' : 'gray'} />
              </div>

              {confirmResult?.errors?.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
                  <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Errors</p>
                  {confirmResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">
                      Bill {e.bill_no}: {e.error}
                    </p>
                  ))}
                </div>
              )}

              <button
                onClick={resetUpload}
                className="w-full mt-2 py-2.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            // ── Preview screen ─────────────────────────────────────────────
            <div className="flex flex-col max-h-[85vh]">
              {/* Modal header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between shrink-0">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">Review Import Data</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {previewData?.summary?.total_invoices} invoice{previewData?.summary?.total_invoices !== 1 ? 's' : ''} ·{' '}
                    {previewData?.summary?.total_items} line item{previewData?.summary?.total_items !== 1 ? 's' : ''} detected
                  </p>
                </div>
                <button
                  onClick={resetUpload}
                  disabled={uploadStage === 'confirming'}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none disabled:opacity-30"
                >×</button>
              </div>

              {/* Error inside modal */}
              {uploadError && (
                <div className="mx-6 mt-3 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg shrink-0">
                  {uploadError}
                </div>
              )}

              {/* Scrollable bill list */}
              <div className="overflow-y-auto px-6 py-3 space-y-3 flex-1">
                {previewData?.invoices?.map((inv, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Bill header row */}
                    <button
                      onClick={() => toggleBill(idx)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-emerald-700 font-semibold text-sm shrink-0">{inv.bill_no}</span>
                        <span className="text-gray-400 text-xs shrink-0">|</span>
                        <span className="text-gray-700 text-sm font-medium truncate">{inv.customer_name}</span>
                        {inv.customer_code && (
                          <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-mono shrink-0">{inv.customer_code}</span>
                        )}
                        <span className="text-gray-400 text-xs shrink-0">{fmtDate(inv.bill_date)}</span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 ml-3">
                        <span className="text-xs text-gray-400">{inv.items?.length} items</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500">Gross <span className="text-gray-700 font-medium">₹{fmt(inv.gross_amount)}</span></span>
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-500">Disc <span className="text-red-500 font-medium">₹{fmt(inv.discount)}</span></span>
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-500">Net <span className="text-gray-900 font-semibold">₹{fmt(inv.net_amount)}</span></span>
                        </div>
                        <span className="text-gray-400 text-xs">{expandedBills[idx] ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {/* Expandable items */}
                    {expandedBills[idx] && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-white border-b border-gray-100 text-gray-400 uppercase tracking-wide">
                              <th className="px-4 py-2 text-left font-semibold">Product</th>
                              <th className="px-4 py-2 text-left font-semibold">Batch</th>
                              <th className="px-4 py-2 text-left font-semibold">Expiry</th>
                              <th className="px-4 py-2 text-right font-semibold">Qty</th>
                              <th className="px-4 py-2 text-right font-semibold">Free</th>
                              <th className="px-4 py-2 text-right font-semibold">Rate</th>
                              <th className="px-4 py-2 text-right font-semibold">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {inv.items?.map((item, iidx) => (
                              <tr key={iidx} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-gray-800 font-medium max-w-[200px] truncate">{item.product_name}</td>
                                <td className="px-4 py-2 text-gray-500">{item.batch || '—'}</td>
                                <td className="px-4 py-2 text-gray-500">{fmtDate(item.expiry)}</td>
                                <td className="px-4 py-2 text-right text-gray-700">{item.quantity}</td>
                                <td className="px-4 py-2 text-right text-gray-400">{item.free_quantity || '—'}</td>
                                <td className="px-4 py-2 text-right text-gray-700">{fmt(item.rate)}</td>
                                <td className="px-4 py-2 text-right font-semibold text-gray-800">{fmt(item.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Footer actions */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={resetUpload}
                    disabled={uploadStage === 'confirming'}
                    className="px-4 py-2.5 text-sm font-medium border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={downloadCSV}
                    disabled={uploadStage === 'confirming'}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors disabled:opacity-40"
                  >
                    ⬇ Download CSV
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <p className="text-xs text-gray-400">
                    Verify the data above, then click Save to import.
                  </p>
                  <button
                    onClick={handleConfirm}
                    disabled={uploadStage === 'confirming'}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg transition-colors"
                  >
                    {uploadStage === 'confirming'
                      ? <><Spinner /> Saving…</>
                      : <>Save {previewData?.summary?.total_invoices} Invoice{previewData?.summary?.total_invoices !== 1 ? 's' : ''}</>
                    }
                  </button>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl z-10 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'gray' }) {
  const colors = {
    gray:    'bg-gray-50 text-gray-800',
    emerald: 'bg-emerald-50 text-emerald-700',
    red:     'bg-red-50 text-red-700',
  };
  return (
    <div className={`rounded-xl p-4 text-center ${colors[color]}`}>
      <p className="text-2xl font-bold">{value ?? 0}</p>
      <p className="text-xs mt-1 opacity-70 font-medium uppercase tracking-wide">{label}</p>
    </div>
  );
}

function PageBtn({ children, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 flex items-center justify-center rounded-md text-sm transition-colors
        ${active
          ? 'bg-emerald-600 text-white font-semibold'
          : 'hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed'
        }`}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" />
    </svg>
  );
}