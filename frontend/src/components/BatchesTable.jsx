import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { apiFetch } from '../utils/api'

// ─── QR Modal Component ────────────────────────────────────────────────────────
const BatchQRModal = ({ item, onClose }) => {
  const qrRef = useRef();

  const qrData = {
    type: item.lpn_code ? 'lpn' : 'batch',
    id: item.lpn_id || item.id,
    code: item.lpn_code || item.batch_code
  };

  const handleDownload = () => {
    const originalCanvas = qrRef.current?.querySelector('canvas');
    if (!originalCanvas) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const textSpace = 80;
    canvas.width = originalCanvas.width;
    canvas.height = originalCanvas.height + textSpace;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalCanvas, 0, 0);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';

    ctx.font = 'bold 16px Inter, system-ui, sans-serif';
    const displayName = item.product_name || item.raw_material_name || 'Item';
    ctx.fillText(displayName, canvas.width / 2, originalCanvas.height + 30);

    ctx.font = 'bold 20px monospace';
    ctx.fillText(item.lpn_code || item.batch_code, canvas.width / 2, originalCanvas.height + 55);

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${item.lpn_code ? 'LPN-' + item.lpn_code : 'Batch-' + item.batch_code}.png`;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="font-semibold text-gray-800">Batch Label</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-xl">×</button>
        </div>
        <div className="p-8 flex flex-col items-center text-center">
          <div ref={qrRef} className="p-2 border border-gray-100 rounded-lg bg-white">
            <QRCodeCanvas
              value={JSON.stringify(qrData)}
              size={200}
              level="H"
              includeMargin={false}
            />
          </div>
          <div className="mt-4">
            <p className="text-sm font-bold text-gray-800">
              {item.product_name || item.raw_material_name}
            </p>
            <p className="text-lg font-mono font-bold text-orange-600">
              {item.lpn_code || item.batch_code}
            </p>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-2">
          <button onClick={handleDownload} className="flex-1 bg-orange-600 text-white py-2 rounded-lg font-medium hover:bg-orange-700">
            Download PNG
          </button>
          <button onClick={onClose} className="flex-1 border border-gray-300 py-2 rounded-lg font-medium hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const PAGE_SIZE = 10;

const BATCH_TYPE_CHOICES = [
  { value: 'RAW', label: 'Raw Material' },
  { value: 'PRD', label: 'Product' },
]

const EMPTY_FORM = {
  batch_type: 'RAW',
  raw_material: '',
  product: '',
  supplier: '',
  expiry_date: '',
}

// ─── Type Badge ───────────────────────────────────────────────────────────────
const TYPE_COLORS = {
  RAW: 'bg-blue-50 text-blue-600 border border-blue-200',
  PRD: 'bg-purple-50 text-purple-600 border border-purple-200',
}

const TypeBadge = ({ type }) => {
  const label = BATCH_TYPE_CHOICES.find(t => t.value === type)?.label || type
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${TYPE_COLORS[type] || 'bg-gray-100 text-gray-500'}`}>
      {label}
    </span>
  )
}

// ─── Form ─────────────────────────────────────────────────────────────────────
const BatchForm = ({ units, rawMaterials, products, suppliers, onSubmit, onClose, loading }) => {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = () => {
    if (!form.batch_type) return setError('Batch type is required.')
    if (form.batch_type === 'RAW' && !form.raw_material) return setError('Raw material is required for RAW batches.')
    if (form.batch_type === 'PRD' && !form.product) return setError('Product is required for PRD batches.')

    setError('')
    onSubmit({
      batch_type: form.batch_type,
      raw_material: form.batch_type === 'RAW' ? form.raw_material : null,
      product: form.batch_type === 'PRD' ? form.product : null,
      supplier: form.supplier || null,
      expiry_date: form.expiry_date || null,
    })
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="px-6 py-5 space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
      )}

      {/* Type */}
      <div>
        <label className={labelCls}>Batch Type *</label>
        <select
          value={form.batch_type}
          onChange={e => set('batch_type', e.target.value)}
          className={inputCls}
        >
          {BATCH_TYPE_CHOICES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {form.batch_type === 'RAW' ? (
        <div>
          <label className={labelCls}>Raw Material *</label>
          <select
            value={form.raw_material}
            onChange={e => set('raw_material', e.target.value)}
            className={inputCls}
          >
            <option value="">— Select Material —</option>
            {rawMaterials.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label className={labelCls}>Product *</label>
          <select
            value={form.product}
            onChange={e => set('product', e.target.value)}
            className={inputCls}
          >
            <option value="">— Select Product —</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className={labelCls}>Supplier (Optional)</label>
        <select
          value={form.supplier}
          onChange={e => set('supplier', e.target.value)}
          className={inputCls}
        >
          <option value="">— Select Supplier —</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Expiry Date</label>
        <input
          type="date"
          value={form.expiry_date}
          onChange={e => set('expiry_date', e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="px-0 py-4 border-t border-gray-100 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {loading ? 'Generating...' : 'Generate Batch'}
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
const BatchesTable = () => {
  const [items, setItems] = useState([])
  const [rawMaterials, setRawMaterials] = useState([])
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [qrTarget, setQrTarget] = useState(null)
  const [toast, setToast] = useState(null)
  const navigate = useNavigate()

  useEffect(() => { fetchAll() }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [bRes, rmRes, pRes, sRes] = await Promise.all([
        apiFetch('/inventory-core/batches/'),
        apiFetch('/master-data/raw-materials-and-consumables/'),
        apiFetch('/master-data/products/'),
        apiFetch('/master-data/suppliers/'),
      ])
      if (bRes && rmRes && pRes && sRes) {
        const [b, rm, p, s] = await Promise.all([
          bRes.json(), rmRes.json(), pRes.json(), sRes.json()
        ])
        setItems(Array.isArray(b) ? b : b.results || [])
        setRawMaterials(Array.isArray(rm) ? rm : rm.results || [])
        setProducts(Array.isArray(p) ? p : p.results || [])
        setSuppliers(Array.isArray(s) ? s : s.results || [])
      }
    } catch {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (data) => {
    setSaving(true)
    try {
      const res = await apiFetch('/inventory-core/batches/', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      if (!res) return
      if (!res.ok) throw new Error()
      const created = await res.json()
      setItems(prev => [created, ...prev])
      setModalOpen(false)
      showToast('Batch generated successfully')
    } catch {
      showToast('Failed to generate batch', 'error')
    } finally {
      setSaving(false)
    }
  }

  const filtered = items.filter(item => {
    const matchSearch = !search || item.batch_code.toLowerCase().includes(search.toLowerCase())
    const matchType = !typeFilter || item.batch_type === typeFilter
    return matchSearch && matchType
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (error) return <div className="text-red-500 text-sm p-6">{error}</div>

  return (
    <>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm text-white transition-all ${toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>
          {toast.msg}
        </div>
      )}

      <div className="rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Batch Management</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-orange-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-orange-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Batch
            </button>

            <div className="relative">
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search batch..."
                className="pl-3 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-40"
              />
            </div>

            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
              className="rounded-lg border border-gray-300 text-xs px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-300"
            >
              <option value="">All Types</option>
              {BATCH_TYPE_CHOICES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-primary text-white text-xs uppercase">
              <tr>
                <th className="px-6 py-3 w-10">No</th>
                <th className="px-6 py-3">Batch Code</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Item</th>
                <th className="px-6 py-3 min-w-[150px]">LPNs</th>
                <th className="px-6 py-3">Expiry</th>
                <th className="px-6 py-3">Created</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-400">No batches found</td>
                </tr>
              ) : paginated.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className="px-6 py-3 font-bold text-gray-900 font-mono text-xs">{item.batch_code}</td>
                  <td className="px-6 py-3">
                    <TypeBadge type={item.batch_type} />
                  </td>
                  <td className="px-6 py-3 text-gray-700">
                    {item.raw_material_name || item.product_name || '—'}
                  </td>
                  <td className="px-6 py-3">
                    {item.lpns && item.lpns.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.lpns.map(lpn => (
                          <button
                            key={lpn.id}
                            onClick={() => setQrTarget({ 
                              ...item, 
                              lpn_id: lpn.id, 
                              lpn_code: lpn.lpn_code 
                            })}
                            className="px-2 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-600 font-mono font-bold border border-indigo-100 hover:bg-indigo-500 hover:text-white transition-colors"
                            title="Generate LPN Label"
                          >
                            {lpn.lpn_code}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-500 text-xs">
                    {item.expiry_date || '—'}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-400 text-[10px]">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => {
                        if (item.batch_type === 'RAW') {
                          navigate(`/stock/raw-materials-logs?material=${item.raw_material}&batch=${item.id}`)
                        } else if (item.batch_type === 'PRD') {
                          navigate(`/stock/product-logs?product=${item.product}&batch=${item.id}`)
                        }
                      }}
                      className="rounded-md bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-100 transition-colors"
                      title="View Movement Logs"
                    >
                      View Logs
                    </button>
                    <button
                      onClick={() => setQrTarget(item)}
                      className="ml-2 rounded-md bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-orange-500 transition-colors"
                      title="Print Batch QR"
                    >
                      QR
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
            >‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-7 h-7 rounded text-xs font-medium ${page === p ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >{p}</button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
            >›</button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Generate New Batch</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <BatchForm
              rawMaterials={rawMaterials}
              products={products}
              suppliers={suppliers}
              onSubmit={handleCreate}
              onClose={() => setModalOpen(false)}
              loading={saving}
            />
          </div>
        </div>
      )}
      {qrTarget && <BatchQRModal item={qrTarget} onClose={() => setQrTarget(null)} />}
    </>
  )
}

export default BatchesTable
