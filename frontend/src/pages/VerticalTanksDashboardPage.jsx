import React, { useState, useEffect } from 'react';
import Topbar from '../components/Topbar';
import Sidebar from '../components/Sidebar';
import { ArrowPathIcon, MagnifyingGlassIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { apiFetch } from '../utils/api';

// ── Load Stock Modal ───────────────────────────────────────────────────────────
const LoadStockModal = ({ tank, onClose, onSuccess }) => {
  const [materials, setMaterials]       = useState([]);
  const [suppliers, setSuppliers]       = useState([]);
  const [locations, setLocations]       = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [mode, setMode]                 = useState('purchase'); // 'purchase' | 'transfer'

  // Purchase fields
  const [purchaseQty, setPurchaseQty]   = useState('');
  const [supplier, setSupplier]         = useState('');
  const [reference, setReference]       = useState('');
  const [notes, setNotes]               = useState('');

  // Transfer fields
  const [sourceLocation, setSource]     = useState('');
  const [transfers, setTransfers]       = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);

  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch('/master-data/raw-materials-and-consumables/?ordering=name').then(r => r.json()),
      apiFetch('/master-data/suppliers/').then(r => r.json()),
      apiFetch('/master-data/locations/').then(r => r.json()),
    ]).then(([matData, supData, locData]) => {
      setMaterials(Array.isArray(matData) ? matData : matData.results || []);
      setSuppliers(Array.isArray(supData) ? supData : supData.results || []);
      setLocations((Array.isArray(locData) ? locData : locData.results || [])
        .filter(l => l.id !== tank.id && l.is_active !== false));
    }).catch(() => setError('Failed to load form data.'));
  }, []);

  useEffect(() => {
    if (!sourceLocation || !selectedMaterial) { setTransfers([]); return; }
    setLoadingStock(true);
    apiFetch(`/raw-materials-stock/stock/?location=${sourceLocation}`)
      .then(r => r.json())
      .then(data => {
        const all = (Array.isArray(data) ? data : data.results || [])
          .filter(s => parseFloat(s.quantity) > 0 && String(s.material) === String(selectedMaterial));
        setTransfers(all.map(s => ({ ...s, qty: '' })));
      })
      .catch(() => setError('Failed to load stock.'))
      .finally(() => setLoadingStock(false));
  }, [sourceLocation, selectedMaterial]);

  const setQty = (idx, val) =>
    setTransfers(prev => prev.map((t, i) => i === idx ? { ...t, qty: val } : t));

  const selectedMat = materials.find(m => String(m.id) === String(selectedMaterial));

  const handleSubmit = async () => {
    setError('');
    if (!selectedMaterial) { setError('Please select a material.'); return; }

    if (mode === 'purchase') {
      if (!purchaseQty || parseFloat(purchaseQty) <= 0) { setError('Enter a valid quantity.'); return; }
      if (!supplier) { setError('Supplier is required for purchase.'); return; }
      setSubmitting(true);
      try {
        const res = await apiFetch('/raw-materials-stock/stock-movements/record/', {
          method: 'POST',
          body: JSON.stringify({
            material: parseInt(selectedMaterial),
            location: tank.id,
            movement_type: 'purchase',
            quantity: parseFloat(purchaseQty),
            supplier: parseInt(supplier),
            reference: reference.trim() || undefined,
            notes: notes.trim() || `Received into ${tank.name}`,
            auto_generate_batch: true,
            auto_generate_lpn: true,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setError(Object.values(err).flat().join('; ') || 'Purchase failed.'); return;
        }
        onSuccess();
      } catch { setError('Network error. Please try again.'); }
      finally { setSubmitting(false); }
      return;
    }

    // Transfer mode
    if (!sourceLocation) { setError('Please select a source location.'); return; }
    const valid = transfers.filter(t => t.qty && parseFloat(t.qty) > 0);
    if (!valid.length) { setError('Enter a quantity for at least one row.'); return; }
    for (const t of valid) {
      if (parseFloat(t.qty) > parseFloat(t.quantity)) {
        setError(`Quantity for "${t.material_name}" exceeds available (${parseFloat(t.quantity).toLocaleString()}).`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const results = await Promise.all(valid.map(t =>
        apiFetch('/raw-materials-stock/stock-movements/record/', {
          method: 'POST',
          body: JSON.stringify({
            material: parseInt(selectedMaterial),
            location: parseInt(sourceLocation),
            movement_type: 'transfer_out',
            quantity: parseFloat(t.qty),
            batch: t.batch || null,
            lpn: t.lpn || null,
            counterpart_location: tank.id,
            notes: `Loaded into ${tank.name}`,
          }),
        })
      ));
      const failed = results.filter(r => !r || !r.ok);
      if (failed.length > 0) {
        const errs = await Promise.all(results.filter(r => r && !r.ok).map(r => r.json().catch(() => ({}))));
        const msg = errs.flatMap(e => Object.values(e).flat()).join('; ') || `${failed.length} transfer(s) failed.`;
        setError(msg); return;
      }
      onSuccess();
    } catch { setError('Network error. Please try again.'); }
    finally { setSubmitting(false); }
  };

  const storageLocs = locations.filter(l => ['warehouse', 'zone', 'block', 'aisle', 'rack', 'shelf'].includes(l.type));
  const factoryLocs = locations.filter(l => ['factory', 'building', 'assembly'].includes(l.type));
  const otherLocs   = locations.filter(l => !storageLocs.find(x => x.id === l.id) && !factoryLocs.find(x => x.id === l.id));

  const canSubmit = mode === 'purchase'
    ? selectedMaterial && purchaseQty && parseFloat(purchaseQty) > 0 && supplier
    : selectedMaterial && sourceLocation && transfers.some(t => t.qty && parseFloat(t.qty) > 0) &&
      !transfers.some(t => parseFloat(t.qty) > parseFloat(t.quantity));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-start flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
              <ArrowDownTrayIcon className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Load Stock into Tank</h3>
              <p className="text-xs text-slate-400 mt-0.5">{tank.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-1">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Tank fill bar */}
          {tank.capacity > 0 && (
            <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Current Fill</p>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      tank.fillPct >= 90 ? 'bg-red-400' : tank.fillPct >= 70 ? 'bg-orange-400' : 'bg-purple-400'
                    }`}
                    style={{ width: `${tank.fillPct}%` }}
                  />
                </div>
              </div>
              <span className="text-sm font-bold text-slate-700 flex-shrink-0 whitespace-nowrap">
                {tank.totalStored.toLocaleString()} / {tank.capacity.toLocaleString()} {tank.unit}
                <span className={`ml-2 text-xs font-semibold ${tank.fillPct >= 90 ? 'text-red-600' : 'text-slate-400'}`}>
                  ({tank.fillPct}%)
                </span>
              </span>
            </div>
          )}

          {/* Material selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Material <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedMaterial}
              onChange={e => { setSelectedMaterial(e.target.value); setTransfers([]); setSource(''); setPurchaseQty(''); }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
            >
              <option value="">— Select material —</option>
              {materials.map(m => (
                <option key={m.id} value={m.id}>{m.name}{m.unit_symbol ? ` (${m.unit_symbol})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200">
            <button
              type="button"
              onClick={() => { setMode('purchase'); setTransfers([]); setSource(''); }}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                mode === 'purchase'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              Purchase
            </button>
            <button
              type="button"
              onClick={() => { setMode('transfer'); setPurchaseQty(''); setSupplier(''); setReference(''); setNotes(''); }}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                mode === 'transfer'
                  ? 'bg-purple-500 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              Transfer In
            </button>
          </div>

          {/* Mode-specific section */}
          {selectedMaterial && mode === 'purchase' && (
            <div className="space-y-3">
              {/* Quantity */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantity <span className="text-red-500">*</span>
                  {selectedMat?.unit_symbol && (
                    <span className="ml-1 font-bold text-emerald-600">({selectedMat.unit_symbol})</span>
                  )}
                </label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={purchaseQty}
                  onChange={e => setPurchaseQty(e.target.value)}
                  placeholder="0.000"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
              {/* Supplier */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Supplier <span className="text-red-500">*</span>
                </label>
                <select
                  value={supplier}
                  onChange={e => setSupplier(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
                >
                  <option value="">— Select supplier —</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              {/* Reference */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">PO / Invoice (optional)</label>
                <input
                  type="text"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="Reference number"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder={`Received into ${tank.name}`}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
                />
              </div>
            </div>
          )}

          {selectedMaterial && mode === 'transfer' && (
            <div className="space-y-3">
              {/* Source location */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Source Location <span className="text-red-500">*</span>
                </label>
                <select
                  value={sourceLocation}
                  onChange={e => setSource(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
                >
                  <option value="">— Select source location —</option>
                  {storageLocs.length > 0 && (
                    <optgroup label="Storage / Warehouse">
                      {storageLocs.map(l => <option key={l.id} value={l.id}>{l.name} [{l.type}]</option>)}
                    </optgroup>
                  )}
                  {factoryLocs.length > 0 && (
                    <optgroup label="Factory / Production">
                      {factoryLocs.map(l => <option key={l.id} value={l.id}>{l.name} [{l.type}]</option>)}
                    </optgroup>
                  )}
                  {otherLocs.length > 0 && (
                    <optgroup label="Other">
                      {otherLocs.map(l => <option key={l.id} value={l.id}>{l.name} [{l.type}]</option>)}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Stock rows filtered to selected material */}
              {sourceLocation && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Available Stock
                  </p>
                  {loadingStock ? (
                    <div className="flex justify-center py-6">
                      <ArrowPathIcon className="w-5 h-5 text-purple-400 animate-spin" />
                    </div>
                  ) : transfers.length === 0 ? (
                    <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <p className="text-xs text-slate-400">No stock for this material at the selected location.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {transfers.map((t, idx) => {
                        const avail = parseFloat(t.quantity);
                        const entered = parseFloat(t.qty) || 0;
                        const overLimit = entered > avail;
                        return (
                          <div key={idx} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${overLimit ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-700 truncate">{t.material_name}</p>
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                <span className="text-[10px] text-slate-400">
                                  Avail: {avail.toLocaleString(undefined, { maximumFractionDigits: 4 })} {t.unit}
                                </span>
                                {t.batch_code && (
                                  <span className="px-1 py-0.5 rounded font-mono text-[9px] text-orange-600 bg-orange-50 border border-orange-100">{t.batch_code}</span>
                                )}
                                {t.lpn_code && (
                                  <span className="px-1 py-0.5 rounded font-mono text-[9px] text-indigo-600 bg-indigo-50 border border-indigo-100">{t.lpn_code}</span>
                                )}
                              </div>
                              {overLimit && (
                                <p className="text-[10px] text-red-600 font-semibold">
                                  Max: {avail.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                </p>
                              )}
                            </div>
                            <input
                              type="number"
                              min="0.001"
                              step="0.001"
                              max={t.quantity}
                              value={t.qty}
                              onChange={e => setQty(idx, e.target.value)}
                              placeholder="qty"
                              className={`w-24 rounded-lg border px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-purple-300 ${overLimit ? 'border-red-400 bg-white' : 'border-gray-300'}`}
                            />
                            <button
                              type="button"
                              onClick={() => setQty(idx, String(avail))}
                              className="text-[10px] text-purple-500 hover:underline flex-shrink-0"
                            >
                              Max
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
              disabled={submitting || !canSubmit}
              className={`px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 flex items-center gap-2 ${
                mode === 'purchase' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-purple-500 hover:bg-purple-600'
              }`}
            >
              {submitting
                ? <><ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Processing...</>
                : mode === 'purchase'
                  ? <><ArrowDownTrayIcon className="w-3.5 h-3.5" /> Record Purchase</>
                  : <><ArrowDownTrayIcon className="w-3.5 h-3.5" /> Transfer In</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const VerticalTanksDashboardPage = () => {
  const [tanks, setTanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTank, setSelectedTank] = useState(null);
  const [loadingTank, setLoadingTank] = useState(null);

  const fetchTanks = async () => {
    setLoading(true);
    setError('');
    try {
      const [locRes, assetRes, stockRes] = await Promise.all([
        apiFetch('/master-data/locations/'),
        apiFetch('/master-data/assets/'),
        apiFetch('/raw-materials-stock/stock/'),
      ]);

      if (!locRes || !locRes.ok) throw new Error('Failed to fetch locations');
      const allLocs = await locRes.json();
      const locations = Array.isArray(allLocs) ? allLocs : allLocs.results || [];
      const verticalLocs = locations.filter(l => l.linked_asset_type === 'Vertical Tank');
      const allAssets = assetRes && assetRes.ok ? await assetRes.json() : [];
      const assetsData = Array.isArray(allAssets) ? allAssets : allAssets.results || [];
      const assetMap = Object.fromEntries(assetsData.map(a => [a.id, a]));

      const allStock = stockRes && stockRes.ok ? await stockRes.json() : [];
      const stockData = Array.isArray(allStock) ? allStock : allStock.results || [];

      const combined = verticalLocs.map(loc => {
        const asset = loc.linked_asset ? assetMap[loc.linked_asset] : null;
        const stockAtLoc = stockData.filter(s => s.location === loc.id);
        const contents = stockAtLoc.map(s => ({
          id: s.id,
          material: s.material_name,
          quantity: parseFloat(s.quantity) || 0,
          unit: s.unit || '',
          batch_code: s.batch_code,
          lpn_code: s.lpn_code,
          updated_at: s.updated_at,
        }));
        const totalStored = contents.reduce((sum, c) => sum + c.quantity, 0);
        const capacity = asset?.capacity || 0;
        const fillPct = capacity > 0 ? Math.min(Math.round((totalStored / capacity) * 100), 100) : 0;

        return {
          id: loc.id,
          name: loc.linked_asset_name || loc.name,
          short_code: loc.short_code,
          full_path: loc.full_path,
          capacity,
          unit: asset?.capacity_unit_symbol || 'L',
          status: loc.linked_asset_status || 'active',
          contents,
          totalStored,
          fillPct,
        };
      });

      setTanks(combined);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTanks(); }, []);

  const filtered = tanks.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  const getFillColor = (pct) => {
    if (pct >= 90) return { bar: 'from-red-500 to-red-400', text: 'text-red-600' };
    if (pct >= 70) return { bar: 'from-orange-500 to-orange-400', text: 'text-orange-600' };
    if (pct >= 30) return { bar: 'from-purple-500 to-purple-400', text: 'text-purple-600' };
    return { bar: 'from-slate-400 to-slate-300', text: 'text-slate-500' };
  };

  const totalCapacity = tanks.reduce((s, t) => s + t.capacity, 0);
  const totalStored = tanks.reduce((s, t) => s + t.totalStored, 0);
  const overallFill = totalCapacity > 0 ? Math.round((totalStored / totalCapacity) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <div className="flex-1 ml-16 flex flex-col h-screen overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 pb-20">

          {/* Header */}
          <div className="mb-6 bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Vertical Tanks</h1>
              <p className="text-slate-500 mt-0.5 text-sm">Monitor additive and feed stock levels in vertical tanks.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search tanks..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300 w-40"
                />
              </div>
              <button
                onClick={fetchTanks}
                disabled={loading}
                className="flex items-center gap-2 bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50"
              >
                <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Tanks', value: tanks.length, color: 'text-slate-700' },
              { label: 'Active', value: tanks.filter(t => t.status === 'active').length, color: 'text-green-600' },
              { label: 'Total Capacity', value: totalCapacity ? `${totalCapacity.toLocaleString()} L` : '—', color: 'text-slate-700' },
              { label: 'Overall Fill', value: `${overallFill}%`, color: overallFill >= 80 ? 'text-red-600' : 'text-purple-600' },
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
            <div className="flex justify-center items-center h-64">
              <ArrowPathIcon className="w-10 h-10 text-purple-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
              <p className="text-sm text-slate-400 font-medium">
                No vertical tanks found. Create an asset with type <strong>Vertical Tank</strong> and link it to a location.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-5">
              {filtered.map(tank => {
                const colors = getFillColor(tank.fillPct);
                return (
                  <div
                    key={tank.id}
                    onClick={() => setSelectedTank(tank)}
                    className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col items-center cursor-pointer hover:shadow-md hover:border-purple-200 transition-all"
                  >
                    <h3 className="font-bold text-slate-800 text-sm text-center truncate w-full mb-0.5">{tank.name}</h3>
                    <p className="text-[10px] font-mono text-slate-400 mb-3">{tank.short_code}</p>

                    {/* Vertical tank shape */}
                    <div className="relative w-16 h-40 mb-3">
                      {/* Tank body */}
                      <div className="absolute inset-x-0 bottom-0 top-4 bg-slate-100 rounded-b-2xl border-2 border-slate-200 overflow-hidden shadow-inner">
                        <div
                          className={`absolute bottom-0 w-full bg-gradient-to-t ${colors.bar} transition-all duration-700`}
                          style={{ height: `${tank.fillPct}%` }}
                        >
                          <div className="absolute top-0 w-full h-0.5 bg-white/40" />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`text-xs font-black drop-shadow-sm ${tank.fillPct > 45 ? 'text-white' : 'text-slate-600'}`}>
                            {tank.fillPct}%
                          </span>
                        </div>
                      </div>
                      {/* Tank cap */}
                      <div className="absolute top-0 inset-x-2 h-5 bg-slate-200 rounded-t-xl border-2 border-slate-200" />
                    </div>

                    {/* Stored / capacity */}
                    <p className="text-[10px] text-slate-500 text-center">
                      {tank.totalStored.toLocaleString()}
                      {tank.capacity > 0 ? ` / ${tank.capacity.toLocaleString()} ${tank.unit}` : ` ${tank.unit}`}
                    </p>

                    {/* Status */}
                    <span className={`mt-2 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                      tank.status === 'active' ? 'bg-green-100 text-green-700 border-green-200' :
                      tank.status === 'maintenance' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                      'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>
                      {tank.status}
                    </span>

                    {/* Load stock button */}
                    <button
                      onClick={e => { e.stopPropagation(); setLoadingTank(tank); }}
                      className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-200 hover:bg-purple-100 px-2.5 py-1 rounded-full transition-colors"
                    >
                      <ArrowDownTrayIcon className="w-3 h-3" />
                      Load Stock
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Load Stock Modal */}
      {loadingTank && (
        <LoadStockModal
          tank={loadingTank}
          onClose={() => setLoadingTank(null)}
          onSuccess={() => { setLoadingTank(null); fetchTanks(); }}
        />
      )}

      {/* Detail Modal */}
      {selectedTank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelectedTank(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">{selectedTank.name}</h3>
                <p className="text-xs text-slate-400 font-mono">{selectedTank.full_path}</p>
              </div>
              <button onClick={() => setSelectedTank(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  ['Capacity', selectedTank.capacity ? `${selectedTank.capacity.toLocaleString()} ${selectedTank.unit}` : '—'],
                  ['Stored', `${selectedTank.totalStored.toLocaleString()} ${selectedTank.unit}`],
                  ['Fill', `${selectedTank.fillPct}%`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                    <p className="text-[10px] text-slate-400 uppercase font-bold">{label}</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Stock Contents</p>
                {selectedTank.contents.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl p-6 text-center border border-dashed border-slate-200">
                    <p className="text-sm text-slate-400">Empty</p>
                  </div>
                ) : selectedTank.contents.map((c, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100 mb-2 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{c.material}</p>
                      <div className="flex gap-1 mt-0.5">
                        {c.batch_code && <span className="px-1.5 py-0.5 rounded font-mono text-[9px] text-orange-600 bg-orange-50 border border-orange-100">{c.batch_code}</span>}
                        {c.lpn_code && <span className="px-1.5 py-0.5 rounded font-mono text-[9px] text-indigo-600 bg-indigo-50 border border-indigo-100">{c.lpn_code}</span>}
                      </div>
                    </div>
                    <p className="text-sm font-bold text-slate-800">{c.quantity.toLocaleString()} {c.unit}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VerticalTanksDashboardPage;
