import React, { useState, useEffect } from 'react';
import Topbar from '../components/Topbar';
import Sidebar from '../components/Sidebar';
import { BeakerIcon, ArrowPathIcon, ClockIcon, CheckCircleIcon, MagnifyingGlassIcon, PlusIcon, PlayIcon, FireIcon, DocumentPlusIcon, ChevronDownIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import { apiFetch } from '../utils/api';

// ── Live countdown ─────────────────────────────────────────────────────────────
const useCountdown = (endTime) => {
  const [label, setLabel] = useState('');
  const [isOverdue, setIsOverdue] = useState(false);
  useEffect(() => {
    if (!endTime) return;
    const tick = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) { 
        setLabel('Completed'); 
        setIsOverdue(true);
        return; 
      }
      setIsOverdue(false);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [endTime]);
  return { label, isOverdue };
};

// ── Check Materials Modal ─────────────────────────────────────────────────────
const CheckMaterialsModal = ({ order, kettle, onClose, onSuccess, onEditMaterials }) => {
  const [factoryStock, setFactoryStock] = useState([]);
  const [kettleStockByMaterial, setKettleStockByMaterial] = useState([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [checkedMaterials, setCheckedMaterials] = useState(
    () => Object.fromEntries((order.materials || []).map(m => [m.material, m.is_loaded || false]))
  );
  // Load qty per material: pre-filled to (expected − already in kettle), doubles as actual_load_qty
  const [loadQtyInputs, setLoadQtyInputs] = useState({});
  const [qtyInitialized, setQtyInitialized] = useState(false);
  const [saving, setSaving] = useState(new Set());
  const [savingQty, setSavingQty] = useState(new Set());
  const [loadingMaterials, setLoadingMaterials] = useState(new Set());
  const [loadingAll, setLoadingAll] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const rows = (order.materials || []).map(m => {
    const factoryQty = factoryStock.filter(s => s.material === m.material).reduce((s, x) => s + parseFloat(x.quantity), 0);
    const kettleQty  = kettleStockByMaterial.filter(s => s.material === m.material).reduce((s, x) => s + parseFloat(x.quantity), 0);
    const expected   = parseFloat(m.planned_qty);
    const loadQty    = parseFloat(loadQtyInputs[m.material] ?? '0') || 0;
    let statusLabel, statusColor;
    if (kettleQty >= expected && expected > 0) { statusLabel = 'In Kettle';    statusColor = 'text-green-700 bg-green-50 border-green-200'; }
    else if (kettleQty > 0)                    { statusLabel = 'Partial';      statusColor = 'text-amber-700 bg-amber-50 border-amber-200'; }
    else if (factoryQty > 0)                   { statusLabel = 'In Factory';   statusColor = 'text-blue-700 bg-blue-50 border-blue-200'; }
    else                                       { statusLabel = 'Not Received'; statusColor = 'text-red-700 bg-red-50 border-red-200'; }
    return { ...m, factoryQty, kettleQty, expected, loadQty, statusLabel, statusColor };
  });

  const checkedCount = rows.filter(r => checkedMaterials[r.material]).length;
  const allChecked   = rows.length === 0 || checkedCount === rows.length;
  const hasMissing   = !loadingStock && rows.some(r => r.statusLabel === 'Not Received');
  const hasLoadable  = rows.some(r => parseFloat(loadQtyInputs[r.material] ?? '0') > 0 && r.factoryQty > 0);

  // Kettle contents summary
  const kettleContents = kettleStockByMaterial;
  const totalLoaded    = kettleContents.reduce((sum, s) => sum + parseFloat(s.quantity), 0);
  const fillPct        = kettle.capacity > 0 ? (totalLoaded / kettle.capacity) * 100 : null;
  const fillBarColor   = fillPct === null ? 'bg-slate-300' : fillPct > 95 ? 'bg-red-400' : fillPct > 75 ? 'bg-amber-400' : 'bg-green-400';
  const fillTextColor  = fillPct === null ? '' : fillPct > 95 ? 'text-red-700' : fillPct > 75 ? 'text-amber-700' : 'text-green-700';

  // Init load qtys once after first stock fetch — deficit = expected − already in kettle
  useEffect(() => {
    if (!loadingStock && !qtyInitialized) {
      setLoadQtyInputs(
        Object.fromEntries(
          (order.materials || []).map(m => {
            const kQty = kettleStockByMaterial.filter(s => s.material === m.material)
              .reduce((sum, s) => sum + parseFloat(s.quantity), 0);
            const needed = Math.max(0, parseFloat(m.planned_qty) - kQty);
            return [m.material, String(parseFloat(needed.toFixed(2)))];
          })
        )
      );
      setQtyInitialized(true);
    }
  }, [loadingStock]);

  const fetchFactoryStock = async () => {
    setLoadingStock(true);
    try {
      const [locRes, allStockRes, kettleStockRes] = await Promise.all([
        apiFetch('/master-data/locations/'),
        apiFetch('/raw-materials-stock/stock/'),
        apiFetch(`/raw-materials-stock/stock/?location=${kettle.id}`),
      ]);
      const allLocs = locRes && locRes.ok ? await locRes.json() : [];
      const locations = Array.isArray(allLocs) ? allLocs : allLocs.results || [];
      const kettleLocIds = new Set(locations.filter(l => l.type === 'kettle' || l.linked_asset_type === 'Kettle').map(l => l.id));
      const sourceLocIds = new Set(locations.filter(l => !kettleLocIds.has(l.id)).map(l => l.id));
      const allStockRaw = allStockRes && allStockRes.ok ? await allStockRes.json() : [];
      const allStockData = Array.isArray(allStockRaw) ? allStockRaw : allStockRaw.results || [];
      const kettleRaw = kettleStockRes && kettleStockRes.ok ? await kettleStockRes.json() : [];
      const kettleStockData = Array.isArray(kettleRaw) ? kettleRaw : kettleRaw.results || [];
      setFactoryStock(allStockData.filter(s => sourceLocIds.has(s.location) && parseFloat(s.quantity) > 0));
      setKettleStockByMaterial(kettleStockData.filter(s => parseFloat(s.quantity) > 0));
    } catch {
      setError('Failed to load stock data.');
    } finally {
      setLoadingStock(false);
    }
  };

  useEffect(() => { fetchFactoryStock(); }, []);

  const toggleMaterial = async (materialId, newValue) => {
    setCheckedMaterials(prev => ({ ...prev, [materialId]: newValue }));
    setSaving(prev => new Set([...prev, materialId]));
    try {
      const res = await apiFetch(`/production/orders/${order.id}/toggle-material-loaded/`, {
        method: 'POST',
        body: JSON.stringify({ material_id: materialId, is_loaded: newValue }),
      });
      if (!res || !res.ok) {
        setCheckedMaterials(prev => ({ ...prev, [materialId]: !newValue }));
        setError('Failed to save. Please try again.');
      }
    } catch {
      setCheckedMaterials(prev => ({ ...prev, [materialId]: !newValue }));
      setError('Network error saving tick.');
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(materialId); return s; });
    }
  };

  const tickAll = async () => {
    const unloaded = rows.filter(r => !checkedMaterials[r.material]);
    if (!unloaded.length) return;
    const ids = unloaded.map(r => r.material);
    setCheckedMaterials(prev => { const n = { ...prev }; ids.forEach(id => { n[id] = true; }); return n; });
    setSaving(new Set(ids));
    try {
      await Promise.all(unloaded.map(r =>
        apiFetch(`/production/orders/${order.id}/toggle-material-loaded/`, {
          method: 'POST',
          body: JSON.stringify({ material_id: r.material, is_loaded: true }),
        })
      ));
    } catch {
      setError('Some ticks failed. Please retry.');
    } finally {
      setSaving(new Set());
    }
  };

  // Save load qty as actual_load_qty on blur (without triggering a transfer)
  const saveLoadQty = async (materialId, val) => {
    const qty = parseFloat(val);
    if (isNaN(qty) || qty < 0) return;
    setSavingQty(prev => new Set([...prev, materialId]));
    try {
      await apiFetch(`/production/orders/${order.id}/update-actual-qty/`, {
        method: 'POST',
        body: JSON.stringify({ material_id: materialId, actual_load_qty: qty }),
      });
    } catch {}
    finally {
      setSavingQty(prev => { const s = new Set(prev); s.delete(materialId); return s; });
    }
  };

  // FIFO transfer from factory stock to kettle for one material
  const loadMaterialToKettle = async (materialId, qty) => {
    const available = factoryStock
      .filter(s => s.material === materialId && parseFloat(s.quantity) > 0)
      .sort((a, b) => a.batch_code && b.batch_code
        ? a.batch_code.localeCompare(b.batch_code)
        : parseFloat(b.quantity) - parseFloat(a.quantity));
    let remaining = qty;
    const calls = [];
    for (const stock of available) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, parseFloat(stock.quantity));
      calls.push({ stock, take });
      remaining -= take;
    }
    if (!calls.length) return false;
    const results = await Promise.all(calls.map(({ stock, take }) =>
      apiFetch('/raw-materials-stock/stock-movements/record/', {
        method: 'POST',
        body: JSON.stringify({
          material: stock.material,
          location: stock.location,
          movement_type: 'transfer_out',
          quantity: take,
          batch: stock.batch || null,
          lpn: stock.lpn || null,
          counterpart_location: kettle.id,
          notes: `Loaded into ${kettle.name} for order ${order.order_number}`,
        }),
      })
    ));
    return results.every(r => r && r.ok);
  };

  const handleLoadMaterial = async (materialId) => {
    const qty = parseFloat(loadQtyInputs[materialId] ?? '0');
    if (!qty || qty <= 0) return;
    setLoadingMaterials(prev => new Set([...prev, materialId]));
    setError('');
    try {
      const ok = await loadMaterialToKettle(materialId, qty);
      if (ok) {
        await apiFetch(`/production/orders/${order.id}/update-actual-qty/`, {
          method: 'POST',
          body: JSON.stringify({ material_id: materialId, actual_load_qty: qty }),
        });
        if (!checkedMaterials[materialId]) {
          const res = await apiFetch(`/production/orders/${order.id}/toggle-material-loaded/`, {
            method: 'POST',
            body: JSON.stringify({ material_id: materialId, is_loaded: true }),
          });
          if (res && res.ok) setCheckedMaterials(prev => ({ ...prev, [materialId]: true }));
        }
        setLoadQtyInputs(prev => ({ ...prev, [materialId]: '0' }));
        await fetchFactoryStock();
      } else {
        setError('No factory stock found. Record purchases in Raw Materials Logs first.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoadingMaterials(prev => { const s = new Set(prev); s.delete(materialId); return s; });
    }
  };

  const handleLoadAll = async () => {
    const toLoad = rows.filter(r => parseFloat(loadQtyInputs[r.material] ?? '0') > 0 && r.factoryQty > 0);
    if (!toLoad.length) { setError('Enter load quantities and ensure factory stock exists.'); return; }
    setLoadingAll(true);
    setError('');
    let failCount = 0;
    for (const r of toLoad) {
      const qty = parseFloat(loadQtyInputs[r.material] ?? '0');
      if (!qty) continue;
      const ok = await loadMaterialToKettle(r.material, qty);
      if (ok) {
        await apiFetch(`/production/orders/${order.id}/update-actual-qty/`, {
          method: 'POST',
          body: JSON.stringify({ material_id: r.material, actual_load_qty: qty }),
        });
        if (!checkedMaterials[r.material]) {
          const res = await apiFetch(`/production/orders/${order.id}/toggle-material-loaded/`, {
            method: 'POST',
            body: JSON.stringify({ material_id: r.material, is_loaded: true }),
          });
          if (res && res.ok) setCheckedMaterials(prev => ({ ...prev, [r.material]: true }));
        }
        setLoadQtyInputs(prev => ({ ...prev, [r.material]: '0' }));
      } else {
        failCount++;
      }
    }
    await fetchFactoryStock();
    if (failCount > 0) setError(`${failCount} material(s) couldn't be loaded — no factory stock available.`);
    setLoadingAll(false);
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setError('');
    try {
      const res = await apiFetch(`/production/orders/${order.id}/confirm-materials/`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res && res.ok) {
        onSuccess();
      } else {
        const err = res ? await res.json() : {};
        setError(err.error || 'Failed to confirm materials.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-start flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
              <ClipboardDocumentCheckIcon className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Check & Load Materials</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                <span className="font-semibold text-orange-600">{kettle.name}</span>
                {order.order_number && <> · {order.order_number}</>}
                {order.product_name && <> · {order.product_name}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {['draft', 'planned'].includes(order.status) && onEditMaterials && (
              <button
                type="button"
                onClick={() => { onClose(); onEditMaterials(); }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 border border-blue-200 rounded-lg hover:bg-blue-50"
              >
                Edit Materials
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Materials table with inline load */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Materials
                {!loadingStock && rows.length > 0 && (
                  <span className="ml-2 font-normal normal-case text-slate-400">— {checkedCount}/{rows.length} ticked</span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchFactoryStock}
                  disabled={loadingStock}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 px-2 py-1 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  <ArrowPathIcon className={`w-3 h-3 ${loadingStock ? 'animate-spin' : ''}`} /> Refresh
                </button>
                {!allChecked && rows.length > 0 && (
                  <button
                    type="button"
                    onClick={tickAll}
                    disabled={saving.size > 0}
                    className="flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700 border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-50 disabled:opacity-50"
                  >
                    {saving.size > 0 ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : '✓'} Tick All
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLoadAll}
                  disabled={loadingAll || loadingStock || !hasLoadable}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {loadingAll ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : <PlusIcon className="w-3 h-3" />}
                  Load All into Kettle
                </button>
              </div>
            </div>

            {hasMissing && (
              <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                ⚠️ Some materials have no factory stock. Record purchases in Raw Materials first.
              </div>
            )}

            {loadingStock ? (
              <div className="flex justify-center py-4">
                <ArrowPathIcon className="w-4 h-4 text-orange-400 animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No material requirements recorded.</p>
            ) : (
              <div className="rounded-xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-2 py-2 w-8"></th>
                      <th className="text-left px-2 py-2 font-semibold text-slate-500">Material</th>
                      <th className="text-right px-2 py-2 font-semibold text-slate-400">Expected</th>
                      <th className="text-right px-2 py-2 font-semibold text-orange-600">In Kettle</th>
                      <th className="text-right px-2 py-2 font-semibold text-slate-400">Factory</th>
                      <th className="text-center px-2 py-2 font-semibold text-blue-600" colSpan={2}>Load Qty → Kettle</th>
                      <th className="text-right px-2 py-2 font-semibold text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {rows.map((r, i) => {
                      const isChecked   = !!checkedMaterials[r.material];
                      const isSaving    = saving.has(r.material);
                      const isSavingQty = savingQty.has(r.material);
                      const isLoading   = loadingMaterials.has(r.material);
                      const lqVal       = loadQtyInputs[r.material] ?? '0';
                      const lqNum       = parseFloat(lqVal) || 0;
                      const overFactory = lqNum > r.factoryQty && r.factoryQty > 0;
                      return (
                        <tr key={i} className={isChecked ? 'bg-green-50' : ''}>
                          {/* Tick */}
                          <td className="px-2 py-2 text-center">
                            {isSaving ? (
                              <ArrowPathIcon className="w-3.5 h-3.5 text-amber-400 animate-spin mx-auto" />
                            ) : (
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={e => toggleMaterial(r.material, e.target.checked)}
                                className="rounded border-gray-300 text-amber-500 focus:ring-amber-300 cursor-pointer"
                              />
                            )}
                          </td>
                          {/* Material */}
                          <td className={`px-2 py-2 font-medium truncate max-w-[110px] ${isChecked ? 'text-green-700' : 'text-slate-700'}`}>
                            {r.material_name}
                          </td>
                          {/* Expected */}
                          <td className="px-2 py-2 text-right text-slate-400 whitespace-nowrap">
                            {r.expected.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            <span className="text-slate-300 ml-0.5 text-[10px]">{r.unit_symbol}</span>
                          </td>
                          {/* In Kettle */}
                          <td className={`px-2 py-2 text-right font-semibold whitespace-nowrap ${r.kettleQty > 0 ? 'text-orange-700' : 'text-slate-200'}`}>
                            {r.kettleQty > 0 ? r.kettleQty.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                          </td>
                          {/* Factory */}
                          <td className={`px-2 py-2 text-right whitespace-nowrap ${r.factoryQty > 0 ? 'text-slate-600' : 'text-red-400 font-semibold'}`}>
                            {r.factoryQty > 0 ? r.factoryQty.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '✕ none'}
                          </td>
                          {/* Load qty input */}
                          <td className="px-2 py-2">
                            <div className="flex flex-col items-end gap-0.5">
                              <div className="flex items-center gap-1">
                                {isSavingQty && <ArrowPathIcon className="w-3 h-3 text-blue-300 animate-spin" />}
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={lqVal}
                                  onChange={e => setLoadQtyInputs(prev => ({ ...prev, [r.material]: e.target.value }))}
                                  onBlur={e => saveLoadQty(r.material, e.target.value)}
                                  disabled={order.status === 'in_progress' || isLoading || loadingAll}
                                  className={`w-20 rounded border px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:bg-slate-50 disabled:text-slate-400 ${overFactory ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`}
                                />
                                <span className="text-slate-300 text-[10px]">{r.unit_symbol}</span>
                              </div>
                              {overFactory && (
                                <p className="text-[9px] text-amber-600 whitespace-nowrap">max {r.factoryQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                              )}
                            </div>
                          </td>
                          {/* Per-row Load button */}
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => handleLoadMaterial(r.material)}
                              disabled={isLoading || loadingAll || lqNum <= 0 || r.factoryQty <= 0 || order.status === 'in_progress'}
                              className="flex items-center gap-1 text-[10px] font-semibold text-white bg-blue-500 hover:bg-blue-600 px-2 py-1 rounded-lg disabled:opacity-40 whitespace-nowrap"
                              title={r.factoryQty <= 0 ? 'No factory stock' : lqNum <= 0 ? 'Enter a quantity' : ''}
                            >
                              {isLoading ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : '↓ Load'}
                            </button>
                          </td>
                          {/* Status */}
                          <td className="px-2 py-2 text-right">
                            <span className={`inline-block px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${r.statusColor}`}>
                              {r.statusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loadingStock && rows.length > 0 && (
              <div className={`mt-2 px-3 py-1.5 rounded-lg text-xs border ${
                allChecked ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
                {allChecked
                  ? '✓ All materials ticked as loaded'
                  : `${checkedCount} / ${rows.length} ticked — check each box once material is physically in the kettle`}
              </div>
            )}
          </div>

          {/* In Kettle Now */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">In Kettle Now</p>
            {loadingStock ? (
              <div className="flex justify-center py-3"><ArrowPathIcon className="w-4 h-4 text-slate-300 animate-spin" /></div>
            ) : kettleContents.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Nothing transferred to this kettle yet.</p>
            ) : (
              <div className="space-y-3">
                {fillPct !== null && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={`font-semibold ${fillTextColor}`}>{totalLoaded.toLocaleString(undefined, { maximumFractionDigits: 2 })} {kettle.unit}</span>
                      <span className="text-slate-400">of {kettle.capacity.toLocaleString()} {kettle.unit} capacity</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${fillBarColor}`}
                        style={{ width: `${Math.min(fillPct, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className={`text-[10px] font-semibold ${fillTextColor}`}>{fillPct.toFixed(1)}% full</span>
                      {fillPct > 100 && <span className="text-[10px] font-bold text-red-600">⚠ Overfill</span>}
                    </div>
                  </div>
                )}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-semibold text-slate-500">Material</th>
                        <th className="text-right px-3 py-1.5 font-semibold text-slate-500">Qty</th>
                        <th className="text-right px-3 py-1.5 font-semibold text-slate-500">Unit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {kettleContents.map((s, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium text-slate-700">{s.material_name}</td>
                          <td className="px-3 py-2 text-right font-bold text-orange-700">
                            {parseFloat(s.quantity).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-400">{s.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex-shrink-0">
          {error && (
            <p className="text-xs text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {rows.length > 0
                ? allChecked
                  ? <span className="text-green-600 font-medium">✓ All {rows.length} materials ticked</span>
                  : <>Tick each material once physically in the kettle — <span className="font-medium text-slate-600">{checkedCount}/{rows.length}</span> done</>
                : 'Confirm all materials are physically loaded in the kettle.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming || !allChecked || saving.size > 0}
                className="px-5 py-2 text-sm font-semibold text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2"
                title={!allChecked ? 'Tick all materials above before confirming' : saving.size > 0 ? 'Saving...' : ''}
              >
                {confirming ? (
                  <><ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Confirming...</>
                ) : (
                  <><ClipboardDocumentCheckIcon className="w-3.5 h-3.5" /> Confirm Materials Loaded</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Kettle Contents Modal ──────────────────────────────────────────────────────
const KettleContentsModal = ({ kettle, onClose }) => {
  const totalLoaded = kettle.contents.reduce((sum, c) => sum + c.quantity, 0);
  const fillPct     = kettle.capacity > 0 ? (totalLoaded / kettle.capacity) * 100 : null;
  const fillBarColor  = fillPct === null ? 'bg-slate-300' : fillPct > 95 ? 'bg-red-400' : fillPct > 75 ? 'bg-amber-400' : 'bg-green-400';
  const fillTextColor = fillPct === null ? 'text-slate-700' : fillPct > 95 ? 'text-red-700' : fillPct > 75 ? 'text-amber-700' : 'text-green-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
              <BeakerIcon className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">{kettle.name}</h3>
              {kettle.short_code && <p className="text-[10px] font-mono text-slate-400 mt-0.5">{kettle.short_code}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Fill bar */}
          {kettle.capacity > 0 ? (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className={`font-bold ${fillTextColor}`}>
                  {totalLoaded.toLocaleString(undefined, { maximumFractionDigits: 2 })} {kettle.unit}
                </span>
                <span className="text-slate-400 text-xs">of {kettle.capacity.toLocaleString()} {kettle.unit} capacity</span>
              </div>
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${fillBarColor}`}
                  style={{ width: `${Math.min(fillPct, 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className={`text-xs font-semibold ${fillTextColor}`}>{fillPct.toFixed(1)}% full</span>
                {fillPct > 100 && <span className="text-xs font-bold text-red-600">⚠ Overfill</span>}
              </div>
            </div>
          ) : totalLoaded > 0 ? (
            <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
              <span className="font-bold text-slate-700 text-sm">
                {totalLoaded.toLocaleString(undefined, { maximumFractionDigits: 2 })} {kettle.unit} loaded
              </span>
              <span className="text-xs text-slate-400 ml-2">(no capacity set)</span>
            </div>
          ) : null}

          {/* Contents table */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Contents</p>
            {kettle.contents.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-slate-400">
                <BeakerIcon className="w-8 h-8 mb-2 text-slate-300" />
                <p className="text-sm font-medium">Kettle is empty</p>
                <p className="text-xs mt-1">No materials have been transferred to this kettle.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-slate-500">Material</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-500">Batch</th>
                      <th className="text-right px-3 py-2 font-semibold text-slate-500">Quantity</th>
                      <th className="text-right px-3 py-2 font-semibold text-slate-500">Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {kettle.contents.map((c, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium text-slate-700">{c.material}</td>
                        <td className="px-3 py-2 text-slate-400 font-mono text-[10px]">{c.batch_code || '—'}</td>
                        <td className="px-3 py-2 text-right font-bold text-orange-700">
                          {c.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-400">{c.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-between items-center flex-shrink-0">
          <a
            href={`/production/kettle-logs?kettle=${kettle.id}`}
            className="text-sm text-orange-600 hover:text-orange-700 font-medium hover:underline"
          >
            View Full Production Log →
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Start Mixing Modal ─────────────────────────────────────────────────────────
const StartMixingModal = ({ order, kettle, onClose, onSuccess }) => {
  const [minutes, setMinutes] = useState(60);
  const [temperature, setTemperature] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!minutes || parseInt(minutes) < 1) {
      setError('Processing time must be at least 1 minute.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = { processing_minutes: parseInt(minutes) };
      if (temperature !== '') payload.mixing_temperature = parseFloat(temperature);
      if (notes.trim()) payload.operator_notes = notes.trim();

      const res = await apiFetch(`/production/orders/${order.id}/start-mixing/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res && res.ok) {
        onSuccess();
      } else {
        const err = res ? await res.json() : {};
        setError(err.error || 'Failed to start mixing.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const endTime = minutes > 0
    ? new Date(Date.now() + parseInt(minutes) * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-start flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <PlayIcon className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="font-bold text-slate-800 text-base">Start Mixing</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1 ml-10">
              <span className="font-semibold text-blue-600">{order.order_number}</span>
              {order.product_name && <> · {order.product_name}</>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-1">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Order materials summary */}
          {order.materials?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Planned Materials — {order.materials.length} item{order.materials.length > 1 ? 's' : ''}</p>
              <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100">
                {order.materials.map((m, i) => (
                  <div key={i} className="flex justify-between items-center px-3 py-2 text-xs">
                    <span className="text-slate-600 truncate pr-2">{m.material_name}</span>
                    <span className="font-bold text-slate-800 whitespace-nowrap">
                      {parseFloat(m.planned_qty).toLocaleString()} <span className="font-normal text-slate-400">{m.unit_symbol}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Processing time */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Processing Time <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={minutes}
                onChange={e => setMinutes(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                required
              />
              <span className="text-sm text-slate-500 flex-shrink-0">minutes</span>
            </div>
            {endTime && (
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <ClockIcon className="w-3 h-3" />
                Expected to finish around <span className="font-semibold text-slate-600 ml-0.5">{endTime}</span>
              </p>
            )}
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Temperature <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <FireIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-orange-400" />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={temperature}
                  onChange={e => setTemperature(e.target.value)}
                  placeholder="e.g. 80"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <span className="text-sm text-slate-500 flex-shrink-0">°C</span>
            </div>
          </div>

          {/* Operator notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Operator Notes <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any special instructions or observations..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex-shrink-0">
          {error && (
            <p className="text-xs text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                <><ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Starting...</>
              ) : (
                <><PlayIcon className="w-3.5 h-3.5" /> Start Mixing</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Edit Materials Modal ───────────────────────────────────────────────────────
const EditMaterialsModal = ({ order, onClose, onSuccess }) => {
  const [allMaterials, setAllMaterials] = useState([]);
  const [rows, setRows] = useState(
    (order.materials || []).map(m => ({ _key: m.id, material: m.material, material_name: m.material_name, planned_qty: String(m.planned_qty) }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/master-data/raw-materials-and-consumables/?ordering=name')
      .then(r => r.json())
      .then(d => setAllMaterials(Array.isArray(d) ? d : d.results || []));
  }, []);

  const addRow = () => setRows(prev => [...prev, { _key: Date.now(), material: '', material_name: '', planned_qty: '' }]);
  const removeRow = (_key) => setRows(prev => prev.filter(r => r._key !== _key));
  const updateRow = (_key, field, value) => setRows(prev => prev.map(r => {
    if (r._key !== _key) return r;
    if (field === 'material') {
      const mat = allMaterials.find(m => m.id === parseInt(value));
      return { ...r, material: value ? parseInt(value) : '', material_name: mat?.name || '' };
    }
    return { ...r, [field]: value };
  }));

  const handleSubmit = async () => {
    const valid = rows.filter(r => r.material && parseFloat(r.planned_qty) > 0);
    if (valid.length === 0) { setError('Add at least one material with a valid quantity.'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await apiFetch(`/production/orders/${order.id}/update-materials/`, {
        method: 'POST',
        body: JSON.stringify({ materials: valid.map(r => ({ material: r.material, planned_qty: parseFloat(r.planned_qty) })) }),
      });
      if (res && res.ok) { onSuccess(); }
      else { const err = res ? await res.json() : {}; setError(err.error || 'Failed to update materials.'); }
    } catch { setError('Network error.'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex justify-between items-center flex-shrink-0">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Edit Materials</h3>
            <p className="text-xs text-slate-400 mt-0.5">{order.order_number} — changes only take effect while order is draft/planned</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {rows.map((row) => (
            <div key={row._key} className="flex items-center gap-2">
              <select
                value={row.material || ''}
                onChange={e => updateRow(row._key, 'material', e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
              >
                <option value="">— Select material —</option>
                {allMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={row.planned_qty}
                onChange={e => updateRow(row._key, 'planned_qty', e.target.value)}
                placeholder="Qty"
                className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <span className="text-xs text-slate-400 w-8 flex-shrink-0">
                {row.material ? (allMaterials.find(m => m.id === row.material)?.unit_symbol || '') : ''}
              </span>
              <button type="button" onClick={() => removeRow(row._key)} className="text-red-400 hover:text-red-600 text-lg leading-none flex-shrink-0">×</button>
            </div>
          ))}
          <button type="button" onClick={addRow} className="flex items-center gap-1.5 text-xs text-orange-600 font-semibold hover:text-orange-700 mt-2">
            <PlusIcon className="w-3.5 h-3.5" /> Add Material
          </button>
        </div>

        <div className="px-6 py-4 border-t flex-shrink-0">
          {error && <p className="text-xs text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting} className="px-5 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2">
              {submitting ? <><ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Saving...</> : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Transfer Kettle Stock Modal ────────────────────────────────────────────────
const TransferKettleStockModal = ({ kettle, onClose, onSuccess }) => {
  const [locations, setLocations] = useState([]);
  const [destLocation, setDestLocation] = useState('');
  const [transfers, setTransfers] = useState(
    kettle.contents.map(c => ({ ...c, qty: '' }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/master-data/locations/')
      .then(r => r.json())
      .then(d => {
        const all = Array.isArray(d) ? d : d.results || [];
        setLocations(all.filter(l => l.type !== 'kettle'));
      });
  }, []);

  const setQty = (idx, val) => setTransfers(prev => prev.map((t, i) => i === idx ? { ...t, qty: val } : t));

  const handleTransfer = async () => {
    if (!destLocation) { setError('Please select a destination location.'); return; }
    const valid = transfers.filter(t => t.qty && parseFloat(t.qty) > 0);
    if (valid.length === 0) { setError('Enter a quantity for at least one material.'); return; }
    for (const t of valid) {
      if (parseFloat(t.qty) > t.quantity) {
        setError(`Quantity for ${t.material} exceeds available (${t.quantity}).`); return;
      }
    }

    setSubmitting(true); setError('');
    try {
      const results = await Promise.all(valid.map(t =>
        apiFetch('/raw-materials-stock/stock-movements/record/', {
          method: 'POST',
          body: JSON.stringify({
            material: t.material_id,
            location: kettle.id,
            movement_type: 'transfer_out',
            quantity: parseFloat(t.qty),
            batch: t.batch || null,
            lpn: t.lpn || null,
            counterpart_location: parseInt(destLocation),
            notes: `Manual transfer from ${kettle.name}`,
          }),
        })
      ));
      const failed = results.filter(r => !r || !r.ok);
      if (failed.length > 0) { setError(`${failed.length} transfer(s) failed.`); return; }
      onSuccess();
    } catch { setError('Network error. Please try again.'); }
    finally { setSubmitting(false); }
  };

  const tankAssemblyLocs = locations.filter(l => ['tank', 'assembly'].includes(l.type));
  const otherLocs = locations.filter(l => !['tank', 'assembly'].includes(l.type));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex justify-between items-start flex-shrink-0">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Transfer from Kettle</h3>
            <p className="text-xs text-slate-400 mt-0.5">{kettle.name} — move stock to another location</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-1">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Destination */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Destination <span className="text-red-500">*</span></label>
            <select
              value={destLocation}
              onChange={e => setDestLocation(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
            >
              <option value="">— Select destination —</option>
              {tankAssemblyLocs.length > 0 && (
                <optgroup label="Tanks & Assembly">
                  {tankAssemblyLocs.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
                </optgroup>
              )}
              {otherLocs.length > 0 && (
                <optgroup label="Other Locations">
                  {otherLocs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>

          {/* Kettle stock rows */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Quantities to Transfer</p>
            {transfers.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Kettle is empty.</p>
            ) : (
              <div className="space-y-2">
                {transfers.map((t, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{t.material}</p>
                      <p className="text-[10px] text-slate-400">Available: {t.quantity.toLocaleString()} {t.unit}</p>
                    </div>
                    <input
                      type="number" min="0.01" step="0.01" max={t.quantity}
                      value={t.qty}
                      onChange={e => setQty(idx, e.target.value)}
                      placeholder="qty"
                      className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
                    />
                    <button type="button" onClick={() => setQty(idx, String(t.quantity))} className="text-[10px] text-blue-500 hover:underline flex-shrink-0">Max</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t flex-shrink-0">
          {error && <p className="text-xs text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleTransfer} disabled={submitting || transfers.length === 0} className="px-5 py-2 text-sm font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2">
              {submitting ? <><ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Transferring...</> : <><ArrowPathIcon className="w-3.5 h-3.5" /> Transfer</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── New Order Modal ────────────────────────────────────────────────────────────
const NewOrderModal = ({ kettles, preselectedKettleId, onClose, onSuccess }) => {
  const [recipes, setRecipes] = useState([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [showRecipeList, setShowRecipeList] = useState(false);
  const [selectedKettleId, setSelectedKettleId] = useState(preselectedKettleId ? String(preselectedKettleId) : '');
  const [targetQty, setTargetQty] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/production/recipes/?is_active=true&ordering=name')
      .then(r => r.json())
      .then(data => { setRecipes(Array.isArray(data) ? data : data.results || []); setLoadingRecipes(false); });
  }, []);

  const filteredRecipes = recipes.filter(r =>
    !recipeSearch ||
    r.name.toLowerCase().includes(recipeSearch.toLowerCase()) ||
    r.product_name?.toLowerCase().includes(recipeSearch.toLowerCase())
  );

  const handleSelectRecipe = (recipe) => { setSelectedRecipe(recipe); setRecipeSearch(recipe.name); setShowRecipeList(false); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRecipe) { setError('Please select a recipe.'); return; }
    if (!selectedKettleId) { setError('Please select a kettle.'); return; }
    if (!targetQty || parseFloat(targetQty) <= 0) { setError('Enter a valid target quantity.'); return; }

    setSubmitting(true); setError('');
    try {
      const payload = {
        recipe: selectedRecipe.id,
        kettle: parseInt(selectedKettleId),
        target_quantity: parseFloat(targetQty),
        status: 'planned',
      };
      const res = await apiFetch('/production/orders/', { method: 'POST', body: JSON.stringify(payload) });
      if (res && res.ok) { onSuccess(); }
      else { const err = res ? await res.json() : {}; setError(Object.values(err).flat().join(' ') || 'Failed to create order.'); }
    } catch { setError('Network error. Please try again.'); }
    finally { setSubmitting(false); }
  };

  const availableKettles = (kettles || []).filter(k => !k.activeOrder);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-start flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
              <DocumentPlusIcon className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">New Production Order</h3>
              <p className="text-xs text-slate-400 mt-0.5">Order number is auto-generated</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-1">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Recipe selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Recipe <span className="text-red-500">*</span></label>
            <div className="relative">
              <input type="text" value={recipeSearch}
                onChange={e => { setRecipeSearch(e.target.value); setShowRecipeList(true); setSelectedRecipe(null); }}
                onFocus={() => setShowRecipeList(true)}
                placeholder={loadingRecipes ? 'Loading recipes...' : 'Search recipe or product name...'}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 pr-8"
                disabled={loadingRecipes}
              />
              <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              {showRecipeList && filteredRecipes.length > 0 && (
                <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {filteredRecipes.map(r => (
                    <button key={r.id} type="button" onClick={() => handleSelectRecipe(r)}
                      className="w-full text-left px-4 py-2.5 hover:bg-orange-50 transition-colors">
                      <p className="text-sm font-semibold text-slate-800">{r.name}</p>
                      <p className="text-xs text-slate-400">{r.product_name}</p>
                    </button>
                  ))}
                </div>
              )}
              {showRecipeList && recipeSearch && filteredRecipes.length === 0 && !loadingRecipes && (
                <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-xl shadow-lg mt-1 px-4 py-3">
                  <p className="text-sm text-slate-400">No matching recipes found.</p>
                </div>
              )}
            </div>
          </div>
          {selectedRecipe && selectedRecipe.items?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Required Materials — {selectedRecipe.items.length} item{selectedRecipe.items.length > 1 ? 's' : ''}</p>
              <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100">
                {selectedRecipe.items.map((item, i) => (
                  <div key={i} className="flex justify-between items-center px-3 py-2 text-xs">
                    <span className="text-slate-600 truncate pr-2">{item.material_name}</span>
                    <span className="font-bold text-slate-800 whitespace-nowrap">{parseFloat(item.quantity).toLocaleString()} <span className="font-normal text-slate-400">{item.unit_symbol}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Target qty + Kettle */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Output <span className="text-red-500">*</span></label>
              <div className="flex items-center gap-2">
                <input type="number" step="0.01" min="0.01" value={targetQty}
                  onChange={e => setTargetQty(e.target.value)} placeholder="e.g. 500"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                {selectedRecipe?.product_unit_symbol && (
                  <span className="text-sm font-bold text-slate-500 flex-shrink-0">{selectedRecipe.product_unit_symbol}</span>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kettle <span className="text-red-500">*</span></label>
              {availableKettles.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-xs text-amber-700 font-semibold">All kettles in use</p>
                </div>
              ) : (
                <select value={selectedKettleId} onChange={e => setSelectedKettleId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                  <option value="">— Select kettle —</option>
                  {availableKettles.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex-shrink-0">
          {error && (
            <p className="text-xs text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || availableKettles.length === 0}
              className="px-5 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                <><ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Creating...</>
              ) : (
                <><DocumentPlusIcon className="w-3.5 h-3.5" /> Create Order</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────────
const KettlesDashboardPage = () => {
  const [kettles, setKettles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedKettle, setSelectedKettle] = useState(null);
  const [preselectedKettleId, setPreselectedKettleId] = useState(null);
  const [checkingOrder, setCheckingOrder] = useState(null);
  const [mixingOrder, setMixingOrder] = useState(null);
  const [completingOrder, setCompletingOrder] = useState(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [editingMaterials, setEditingMaterials] = useState(null);
  const [transferringKettle, setTransferringKettle] = useState(null);
  const [viewingContents, setViewingContents] = useState(null);

  const fetchKettles = async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch orders. In a real app we might filter by status. We'll fetch all active.
      const [locRes, assetRes, stockRes, ordersRes] = await Promise.all([
        apiFetch('/master-data/locations/'),
        apiFetch('/master-data/assets/'),
        apiFetch('/raw-materials-stock/stock/'),
        apiFetch('/production/orders/'), // fetch all, then filter below
      ]);

      if (!locRes || !locRes.ok) throw new Error('Failed to fetch locations');
      const allLocs = await locRes.json();
      const locations = Array.isArray(allLocs) ? allLocs : allLocs.results || [];
      const kettleLocs = locations.filter(l => l.type === 'kettle' || l.linked_asset_type === 'Kettle');

      const allAssets = assetRes && assetRes.ok ? await assetRes.json() : [];
      const assetsData = Array.isArray(allAssets) ? allAssets : allAssets.results || [];
      const assetMap = Object.fromEntries(assetsData.map(a => [a.id, a]));

      const allStock = stockRes && stockRes.ok ? await stockRes.json() : [];
      const stockData = Array.isArray(allStock) ? allStock : allStock.results || [];

      let activeOrders = [];
      if (ordersRes && ordersRes.ok) {
        const od = await ordersRes.json();
        // consider draft, planned, in_progress
        const allOrders = Array.isArray(od) ? od : od.results || [];
        activeOrders = allOrders.filter(o => ['draft', 'planned', 'in_progress'].includes(o.status));
        // Also keep recently-completed so the batch code is visible briefly
        const recentCompleted = allOrders.filter(o => o.status === 'completed').slice(0, 10);
      }

      const combined = kettleLocs.map(loc => {
        const asset = loc.linked_asset ? assetMap[loc.linked_asset] : null;
        const stockAtLoc = stockData.filter(s => s.location === loc.id && parseFloat(s.quantity) > 0.0001);
        const contents = stockAtLoc.map(s => ({
          material: s.material_name,
          material_id: s.material,
          quantity: parseFloat(s.quantity) || 0,
          unit: s.unit || '',
          batch_code: s.batch_code,
          batch: s.batch || null,
          lpn: s.lpn || null,
        }));
        const totalLoaded = contents.reduce((sum, c) => sum + c.quantity, 0);
        const capacity = asset?.capacity || 0;
        const fillPct = capacity > 0 ? Math.min(Math.round((totalLoaded / capacity) * 100), 100) : 0;
        // Prioritize in_progress over planned
        const activeOrder = activeOrders.find(o => o.kettle === loc.id && o.status === 'in_progress') || 
                            activeOrders.find(o => o.kettle === loc.id && o.status === 'planned') ||
                            activeOrders.find(o => o.kettle === loc.id && o.status === 'draft');

        return {
          id: loc.id,
          name: loc.linked_asset_name || loc.name,
          short_code: loc.short_code,
          full_path: loc.full_path,
          capacity,
          unit: asset?.capacity_unit_symbol || 'L',
          status: loc.linked_asset_status || 'active',
          contents,
          totalLoaded,
          fillPct,
          activeOrder: activeOrder ? {
            id: activeOrder.id,
            status: activeOrder.status,
            order_number: activeOrder.order_number,
            recipe: activeOrder.recipe,
            recipe_name: activeOrder.recipe_name,
            product_name: activeOrder.product_name,
            mixture_id: activeOrder.mixture_id || null,
            display_name: activeOrder.display_name || activeOrder.product_name || '',
            target_quantity: parseFloat(activeOrder.target_quantity) || 0,
            produced_quantity: parseFloat(activeOrder.produced_quantity) || 0,
            target_unit_symbol: activeOrder.target_unit_symbol || null,
            expected_end_time: activeOrder.expected_end_time,
            mixing_temperature: activeOrder.mixing_temperature || null,
            operator_notes: activeOrder.operator_notes || '',
            produced_batch_code: activeOrder.produced_batch_code || null,
            materials_confirmed: activeOrder.materials_confirmed || false,
            materials: activeOrder.materials,
          } : null,
        };
      });

      setKettles(combined);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchKettles(); }, []);

  const filtered = kettles.filter(k => {
    const matchSearch = !search || k.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && k.activeOrder) ||
      (statusFilter === 'idle' && !k.activeOrder);
    return matchSearch && matchStatus;
  });

  const inProduction = kettles.filter(k => k.activeOrder).length;
  const idle = kettles.filter(k => !k.activeOrder).length;

  // ── Kettle Card ──────────────────────────────────────────────────────────────
  const KettleCard = ({ kettle }) => {
    const { label: countdown, isOverdue } = useCountdown(kettle.activeOrder?.expected_end_time);

    return (
      <div
        className={`bg-white rounded-2xl border shadow-sm flex flex-col transition-all hover:shadow-md cursor-pointer ${
          kettle.activeOrder ? 'border-orange-200' : 'border-slate-100'
        }`}
        onClick={() => setViewingContents(kettle)}
      >
        {/* Card header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-800 truncate">{kettle.name}</h3>
            <p className="text-[10px] font-mono text-slate-400 mt-0.5">{kettle.short_code}</p>
          </div>
          {kettle.activeOrder ? (
            <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border flex-shrink-0 ${
              kettle.activeOrder.status === 'in_progress' 
                ? isOverdue ? 'bg-green-100 text-green-700 border-green-200' : 'bg-orange-100 text-orange-700 border-orange-200'
                : 'bg-blue-100 text-blue-700 border-blue-200'
            }`}>
              {kettle.activeOrder.status === 'in_progress' ? (isOverdue ? 'Complete' : 'In Process') : kettle.activeOrder.status}
            </span>
          ) : (
            <span className="ml-2 bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border border-green-200 flex-shrink-0">
              Idle
            </span>
          )}
        </div>

        <div className="p-4 flex-1 flex flex-col gap-3">
          {/* Fill bar */}
          {kettle.capacity > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Loaded</span>
                <span className="font-medium">{kettle.totalLoaded.toLocaleString()} / {kettle.capacity.toLocaleString()} {kettle.unit}</span>
              </div>
              <div className="relative w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-700 ${
                    kettle.activeOrder ? 'bg-orange-400' : 'bg-slate-300'
                  }`}
                  style={{ width: `${kettle.fillPct}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 text-right">{kettle.fillPct}% full</p>
            </div>
          )}

          {/* Active order */}
          {kettle.activeOrder ? (
            <div className="bg-orange-50 rounded-xl p-3 border border-orange-100 space-y-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Order</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">{kettle.activeOrder.order_number}</span>
                  <a
                    href={`/production/kettle-logs?kettle=${kettle.id}`}
                    onClick={e => e.stopPropagation()}
                    className="text-[10px] text-orange-500 hover:underline"
                  >
                    View logs →
                  </a>
                </div>
              </div>
              {kettle.activeOrder.product_name ? (
                <div className="flex justify-between">
                  <span className="text-slate-500">Product</span>
                  <span className="font-semibold text-slate-700 truncate ml-2">{kettle.activeOrder.product_name}</span>
                </div>
              ) : kettle.activeOrder.mixture_id ? (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Mix</span>
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded">{kettle.activeOrder.mixture_id}</span>
                </div>
              ) : null}
              {kettle.activeOrder.status === 'in_progress' && kettle.activeOrder.mixing_temperature && (
                <div className="flex justify-between">
                  <span className="text-slate-500 flex items-center gap-1"><FireIcon className="w-3 h-3 text-orange-400" />Temp</span>
                  <span className="font-semibold text-orange-700">{kettle.activeOrder.mixing_temperature}°C</span>
                </div>
              )}
              {countdown && kettle.activeOrder.status === 'in_progress' && (
                <div className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 mt-1 border ${isOverdue ? 'bg-green-100 border-green-200' : 'bg-orange-100 border-orange-200'}`}>
                  <ClockIcon className={`w-3.5 h-3.5 ${isOverdue ? 'text-green-600' : 'text-orange-600 animate-pulse'}`} />
                  <span className={`text-xs font-bold ${isOverdue ? 'text-green-700' : 'text-orange-700'}`}>{countdown}</span>
                </div>
              )}
              {kettle.activeOrder.status === 'in_progress' && kettle.activeOrder.operator_notes && (
                <p className="text-[10px] text-slate-400 italic mt-1 truncate" title={kettle.activeOrder.operator_notes}>
                  "{kettle.activeOrder.operator_notes}"
                </p>
              )}
              {kettle.activeOrder.produced_batch_code && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate-500 text-[10px]">Batch</span>
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded">
                    {kettle.activeOrder.produced_batch_code}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center bg-slate-50 rounded-xl py-3 border border-dashed border-slate-200">
              <CheckCircleIcon className="w-6 h-6 text-green-400 mb-1" />
              <p className="text-xs font-semibold text-slate-500">Ready</p>
            </div>
          )}
        </div>

        {/* Actions button */}
        <div className="px-4 pb-4">
          {kettle.activeOrder && kettle.activeOrder.status === 'in_progress' ? (
            <button
              onClick={(e) => { e.stopPropagation(); setCompletingOrder({ kettle, order: kettle.activeOrder }); }}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-green-500 text-white py-2 text-xs font-semibold hover:bg-green-600 transition-colors"
            >
              <CheckCircleIcon className="w-3.5 h-3.5" />
              Complete & Transfer
            </button>
          ) : kettle.activeOrder && ['planned', 'draft'].includes(kettle.activeOrder.status) && kettle.activeOrder.materials_confirmed ? (
            <button
              onClick={(e) => { e.stopPropagation(); setMixingOrder({ order: kettle.activeOrder, kettle }); }}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-blue-500 text-white py-2 text-xs font-semibold hover:bg-blue-600 transition-colors"
            >
              <PlayIcon className="w-3.5 h-3.5" />
              Start Mixing
            </button>
          ) : kettle.activeOrder && ['planned', 'draft'].includes(kettle.activeOrder.status) ? (
            <button
              onClick={(e) => { e.stopPropagation(); setCheckingOrder({ order: kettle.activeOrder, kettle }); }}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 text-white py-2 text-xs font-semibold hover:bg-amber-600 transition-colors"
            >
              <ClipboardDocumentCheckIcon className="w-3.5 h-3.5" />
              Check Materials
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setPreselectedKettleId(kettle.id); setShowNewOrder(true); }}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-orange-500 text-white py-2 text-xs font-semibold hover:bg-orange-600 transition-colors"
            >
              <DocumentPlusIcon className="w-3.5 h-3.5" />
              New Order
            </button>
          )}
          {kettle.contents.length > 0 && (!kettle.activeOrder || kettle.activeOrder.status !== 'in_progress') && (
            <button
              onClick={(e) => { e.stopPropagation(); setTransferringKettle(kettle); }}
              className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-white border border-blue-200 text-blue-600 py-2 text-xs font-semibold hover:bg-blue-50 transition-colors"
            >
              <ArrowPathIcon className="w-3.5 h-3.5" />
              Transfer Stock Out
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <div className="flex-1 ml-16 flex flex-col h-screen overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 pb-20">

          {/* Header */}
          <div className="mb-6 bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Kettles Dashboard</h1>
              <p className="text-slate-500 mt-0.5 text-sm">Monitor production and load raw materials into kettles.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search kettles..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-40"
                />
              </div>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                {['all', 'active', 'idle'].map((f, i) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-1.5 capitalize transition ${
                      statusFilter === f ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-50'
                    } ${i > 0 ? 'border-l border-gray-200' : ''}`}
                  >
                    {f === 'active' ? 'In Production' : f === 'idle' ? 'Idle' : 'All'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowNewOrder(true)}
                className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600"
              >
                <DocumentPlusIcon className="w-4 h-4" />
                New Order
              </button>
              <button
                onClick={fetchKettles}
                disabled={loading}
                className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Kettles', value: kettles.length, color: 'text-slate-700' },
              { label: 'In Production', value: inProduction, color: 'text-orange-600' },
              { label: 'Idle', value: idle, color: 'text-green-600' },
              { label: 'Utilization', value: kettles.length > 0 ? `${Math.round((inProduction / kettles.length) * 100)}%` : '—', color: 'text-blue-600' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                <p className="text-xs text-slate-400 font-medium">{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <ArrowPathIcon className="w-10 h-10 text-orange-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
              <BeakerIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400 font-medium">
                No kettles found. Add a location with type <strong>Kettle</strong> and link a <strong>Kettle</strong> asset.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map(k => <KettleCard key={k.id} kettle={k} />)}
            </div>
          )}
        </main>
      </div>

      {/* New Order Modal */}
      {showNewOrder && (
        <NewOrderModal
          kettles={kettles}
          preselectedKettleId={preselectedKettleId}
          onClose={() => { setShowNewOrder(false); setPreselectedKettleId(null); }}
          onSuccess={() => { setShowNewOrder(false); setPreselectedKettleId(null); fetchKettles(); }}
        />
      )}

      {/* Check Materials Modal */}
      {checkingOrder && (
        <CheckMaterialsModal
          order={checkingOrder.order}
          kettle={checkingOrder.kettle}
          onClose={() => setCheckingOrder(null)}
          onSuccess={() => { setCheckingOrder(null); fetchKettles(); }}
          onEditMaterials={() => setEditingMaterials({ order: checkingOrder.order })}
        />
      )}

      {/* Start Mixing Modal */}
      {mixingOrder && (
        <StartMixingModal
          order={mixingOrder.order}
          kettle={mixingOrder.kettle}
          onClose={() => setMixingOrder(null)}
          onSuccess={() => { setMixingOrder(null); fetchKettles(); }}
        />
      )}

      {/* Complete Order Modal */}
      {completingOrder && (
        <CompleteOrderModal
          order={completingOrder.order}
          kettle={completingOrder.kettle}
          onClose={() => setCompletingOrder(null)}
          onSuccess={() => { setCompletingOrder(null); fetchKettles(); }}
        />
      )}

      {/* Edit Materials Modal */}
      {editingMaterials && (
        <EditMaterialsModal
          order={editingMaterials.order}
          onClose={() => setEditingMaterials(null)}
          onSuccess={() => { setEditingMaterials(null); fetchKettles(); }}
        />
      )}

      {/* Transfer Kettle Stock Modal */}
      {transferringKettle && (
        <TransferKettleStockModal
          kettle={transferringKettle}
          onClose={() => setTransferringKettle(null)}
          onSuccess={() => { setTransferringKettle(null); fetchKettles(); }}
        />
      )}

      {/* Kettle Contents Modal */}
      {viewingContents && (
        <KettleContentsModal
          kettle={viewingContents}
          onClose={() => setViewingContents(null)}
        />
      )}
    </div>
  );
};

const CompleteOrderModal = ({ order, kettle, onClose, onSuccess }) => {
  const [locations, setLocations] = useState([]);
  const [loadingLocs, setLoadingLocs] = useState(true);
  const [targetQty, setTargetQty] = useState(order.target_quantity);
  const [destTab, setDestTab] = useState('tank'); // 'tank' | 'assembly'
  const [destLocation, setDestLocation] = useState('');
  const [wastageData, setWastageData] = useState(
    order.materials.map(m => ({ material_id: m.material, material_name: m.material_name, unit_symbol: m.unit_symbol || '', qty: 0 }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/master-data/locations/')
      .then(r => r.json())
      .then(data => {
        setLocations(Array.isArray(data) ? data : data.results || []);
        setLoadingLocs(false);
      });
  }, []);

  const tankLocs     = locations.filter(l => l.type === 'tank');
  const assemblyLocs = locations.filter(l => l.type === 'assembly');
  const activeLocs   = destTab === 'tank' ? tankLocs : assemblyLocs;

  // Reset selection when tab changes
  const switchTab = (tab) => { setDestTab(tab); setDestLocation(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!destLocation) { setError('Please select a destination.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        produced_quantity: parseFloat(targetQty),
        destination_location_id: parseInt(destLocation),
        wastage: wastageData.map(w => ({ material_id: w.material_id, wastage_qty: parseFloat(w.qty) || 0 })),
      };
      const res = await apiFetch(`/production/orders/${order.id}/complete-order/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res && res.ok) {
        onSuccess();
      } else {
        const err = res ? await res.json() : {};
        setError(err.error || 'Failed to complete order.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedLoc = locations.find(l => String(l.id) === String(destLocation));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-start flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircleIcon className="w-4 h-4 text-green-600" />
              </div>
              <h3 className="font-bold text-slate-800 text-base">Complete & Transfer</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1 ml-10">
              <span className="font-semibold text-orange-600">{kettle.name}</span>
              {order.order_number && <> · {order.order_number}</>}
              {order.product_name && <> · {order.product_name}</>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-1">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Production qty */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Expected</label>
              <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-sm font-bold text-slate-400">
                {parseFloat(order.target_quantity).toLocaleString()}
                {order.target_unit_symbol && <span className="text-xs ml-1 font-normal">{order.target_unit_symbol}</span>}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Actual Output{order.target_unit_symbol ? ` (${order.target_unit_symbol})` : ''} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={targetQty}
                onChange={e => setTargetQty(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                required
              />
            </div>
          </div>

          {/* Transfer destination */}
          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
              Transfer To <span className="text-red-500">*</span>
            </p>

            {/* Tabs */}
            <div className="flex rounded-xl border border-slate-200 overflow-hidden mb-3 text-xs font-semibold">
              <button
                type="button"
                onClick={() => switchTab('tank')}
                className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition ${
                  destTab === 'tank'
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <BeakerIcon className="w-3.5 h-3.5" />
                Storage Tank
                {tankLocs.length > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${destTab === 'tank' ? 'bg-blue-400 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {tankLocs.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => switchTab('assembly')}
                className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition border-l border-slate-200 ${
                  destTab === 'assembly'
                    ? 'bg-purple-500 text-white'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <ArrowPathIcon className="w-3.5 h-3.5" />
                Assembly
                {assemblyLocs.length > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${destTab === 'assembly' ? 'bg-purple-400 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {assemblyLocs.length}
                  </span>
                )}
              </button>
            </div>

            {/* Location list */}
            {loadingLocs ? (
              <div className="flex justify-center py-6">
                <ArrowPathIcon className="w-5 h-5 text-slate-400 animate-spin" />
              </div>
            ) : activeLocs.length === 0 ? (
              <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-xs text-slate-400">
                  No <span className="font-semibold">{destTab === 'tank' ? 'Tank' : 'Assembly'}</span> locations found.
                </p>
                <p className="text-[10px] text-slate-300 mt-0.5">
                  Add one in Master Data → Locations.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {activeLocs.map(loc => (
                  <label
                    key={loc.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      String(destLocation) === String(loc.id)
                        ? destTab === 'tank'
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-purple-300 bg-purple-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="destLocation"
                      value={loc.id}
                      checked={String(destLocation) === String(loc.id)}
                      onChange={() => setDestLocation(loc.id)}
                      className={`${destTab === 'tank' ? 'text-blue-500 focus:ring-blue-300' : 'text-purple-500 focus:ring-purple-300'}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{loc.name}</p>
                      {loc.short_code && (
                        <p className="text-[10px] font-mono text-slate-400">{loc.short_code}</p>
                      )}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border flex-shrink-0 ${
                      destTab === 'tank'
                        ? 'bg-blue-50 text-blue-600 border-blue-200'
                        : 'bg-purple-50 text-purple-600 border-purple-200'
                    }`}>
                      {loc.type}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {selectedLoc && (
              <p className="text-[11px] text-slate-400 mt-1.5">
                Transferring to: <span className="font-semibold text-slate-600">{selectedLoc.name}</span>
              </p>
            )}
          </div>

          {/* Wastage */}
          {wastageData.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                Record Wastage <span className="text-slate-400 font-normal normal-case">(optional)</span>
              </label>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                {wastageData.map((w, idx) => (
                  <div key={w.material_id} className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-slate-700 flex-1 truncate">{w.material_name}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={w.qty}
                        onChange={e => {
                          const newW = [...wastageData];
                          newW[idx] = { ...newW[idx], qty: e.target.value };
                          setWastageData(newW);
                        }}
                        className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                      />
                      <span className="text-xs text-slate-400 w-8 flex-shrink-0">{w.unit_symbol || 'wasted'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex-shrink-0">
          {error && (
            <p className="text-xs text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !destLocation}
              className="px-5 py-2 text-sm font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                <><ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Processing...</>
              ) : (
                <><CheckCircleIcon className="w-4 h-4" /> Complete & Transfer</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KettlesDashboardPage;
