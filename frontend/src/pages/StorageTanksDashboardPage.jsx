import React, { useState, useEffect } from 'react';
import Topbar from '../components/Topbar';
import Sidebar from '../components/Sidebar';
import { ArrowPathIcon, ArchiveBoxIcon, MagnifyingGlassIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import { apiFetch } from '../utils/api';

const StorageTanksDashboardPage = () => {
  const [tanks, setTanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTank, setSelectedTank] = useState(null);
  const [transferTank, setTransferTank] = useState(null);

  const fetchTanks = async () => {
    setLoading(true);
    setError('');
    try {
      const [locRes, assetRes, rawStockRes, prodStockRes] = await Promise.all([
        apiFetch('/master-data/locations/'),
        apiFetch('/master-data/assets/'),
        apiFetch('/raw-materials-stock/stock/'),
        apiFetch('/products-stock/stock/'),
      ]);

      if (!locRes || !locRes.ok) throw new Error('Failed to fetch locations');
      const allLocs = await locRes.json();
      const locations = Array.isArray(allLocs) ? allLocs : allLocs.results || [];
      const tankLocs = locations.filter(l => l.linked_asset_type === 'Storage Tank');
      const allAssets = assetRes && assetRes.ok ? await assetRes.json() : [];
      const assetsData = Array.isArray(allAssets) ? allAssets : allAssets.results || [];
      const assetMap = Object.fromEntries(assetsData.map(a => [a.id, a]));

      const allRawStock = rawStockRes && rawStockRes.ok ? await rawStockRes.json() : [];
      const rawStockData = Array.isArray(allRawStock) ? allRawStock : allRawStock.results || [];

      const allProdStock = prodStockRes && prodStockRes.ok ? await prodStockRes.json() : [];
      const prodStockData = Array.isArray(allProdStock) ? allProdStock : allProdStock.results || [];

      const combined = tankLocs.map(loc => {
        const asset = loc.linked_asset ? assetMap[loc.linked_asset] : null;
        
        const rawStockAtLoc = rawStockData.filter(s => s.location === loc.id);
        const rawContents = [];
        rawStockAtLoc.forEach(s => {
          let existing = rawContents.find(c => c.item_id === s.material);
          if (existing) {
            existing.quantity += parseFloat(s.quantity) || 0;
            if (s.batch_code && (!existing.batch_code || !existing.batch_code.includes(s.batch_code))) {
               existing.batch_code = existing.batch_code ? `${existing.batch_code}, ${s.batch_code}` : s.batch_code;
            }
            if (s.lpn_code && (!existing.lpn_code || !existing.lpn_code.includes(s.lpn_code))) {
               existing.lpn_code = existing.lpn_code ? `${existing.lpn_code}, ${s.lpn_code}` : s.lpn_code;
            }
            if (s.updated_at && new Date(s.updated_at) > new Date(existing.updated_at)) {
               existing.updated_at = s.updated_at;
            }
            existing.sub_stocks.push(s);
          } else {
            rawContents.push({
              id: s.id,
              type: 'raw_material',
              item_id: s.material,
              name: s.material_name,
              category: s.material_type,
              quantity: parseFloat(s.quantity) || 0,
              unit: s.unit || '',
              batch_code: s.batch_code,
              lpn_code: s.lpn_code,
              updated_at: s.updated_at,
              sub_stocks: [s],
            });
          }
        });

        const prodStockAtLoc = prodStockData.filter(s => s.location === loc.id);
        const prodContents = [];
        prodStockAtLoc.forEach(s => {
          let existing = prodContents.find(c => c.item_id === s.product);
          const s_batch = s.batch?.batch_code || s.batch_code;
          const s_lpn = s.lpn?.lpn_code || s.lpn_code;
          if (existing) {
            existing.quantity += parseFloat(s.quantity) || 0;
            if (s_batch && (!existing.batch_code || !existing.batch_code.includes(s_batch))) {
               existing.batch_code = existing.batch_code ? `${existing.batch_code}, ${s_batch}` : s_batch;
            }
            if (s_lpn && (!existing.lpn_code || !existing.lpn_code.includes(s_lpn))) {
               existing.lpn_code = existing.lpn_code ? `${existing.lpn_code}, ${s_lpn}` : s_lpn;
            }
            if (s.updated_at && new Date(s.updated_at) > new Date(existing.updated_at)) {
               existing.updated_at = s.updated_at;
            }
            existing.sub_stocks.push(s);
          } else {
            prodContents.push({
              id: s.id,
              type: 'product',
              item_id: s.product,
              name: s.product_name,
              category: 'Product',
              quantity: parseFloat(s.quantity) || 0,
              unit: s.unit_symbol || '',
              batch_code: s_batch,
              lpn_code: s_lpn,
              updated_at: s.updated_at,
              sub_stocks: [s],
            });
          }
        });

        const contents = [...rawContents, ...prodContents].filter(c => c.quantity > 0.0001);
        const totalStored = contents.reduce((sum, c) => sum + c.quantity, 0);
        const capacity = asset?.capacity || 0;
        const fillPct = capacity > 0 ? Math.min(Math.round((totalStored / capacity) * 100), 100) : 0;

        return {
          id: loc.id,
          name: loc.linked_asset_name || loc.name,
          short_code: loc.short_code,
          full_path: loc.full_path,
          asset_type: loc.linked_asset_type || 'Storage Tank',
          capacity,
          unit: asset?.capacity_unit_symbol || 'L',
          status: loc.linked_asset_status || 'active',
          is_active: loc.is_active,
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
    !search ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.short_code?.toLowerCase().includes(search.toLowerCase())
  );

  const getFillColor = (pct) => {
    if (pct >= 90) return 'from-red-500 to-red-400';
    if (pct >= 70) return 'from-orange-500 to-orange-400';
    if (pct >= 40) return 'from-blue-500 to-blue-400';
    return 'from-green-500 to-green-400';
  };

  const getStatusColor = (status) => {
    if (status === 'active') return 'bg-green-100 text-green-700 border-green-200';
    if (status === 'maintenance') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-gray-100 text-gray-500 border-gray-200';
  };

  // Summary stats
  const totalCapacity = tanks.reduce((s, t) => s + t.capacity, 0);
  const totalStored = tanks.reduce((s, t) => s + t.totalStored, 0);
  const overallFill = totalCapacity > 0 ? Math.round((totalStored / totalCapacity) * 100) : 0;
  const activeTanks = tanks.filter(t => t.status === 'active').length;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <div className="flex-1 ml-16 flex flex-col h-screen overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 pb-20">

          {/* Header */}
          <div className="mb-6 bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Storage Tanks</h1>
              <p className="text-slate-500 mt-0.5 text-sm">Monitor raw material stock levels across all storage tanks.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search tanks..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 w-40"
                />
              </div>
              <button
                onClick={fetchTanks}
                disabled={loading}
                className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
              >
                <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Tanks', value: tanks.length, color: 'text-blue-600' },
              { label: 'Active', value: activeTanks, color: 'text-green-600' },
              { label: 'Total Capacity', value: totalCapacity ? `${totalCapacity.toLocaleString()} L` : '—', color: 'text-slate-700' },
              { label: 'Overall Fill', value: `${overallFill}%`, color: overallFill >= 80 ? 'text-red-600' : 'text-blue-600' },
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
              <ArrowPathIcon className="w-10 h-10 text-blue-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
              <ArchiveBoxIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400 font-medium">
                No storage tanks found. Add locations with type <strong>Tank</strong> and link a <strong>Storage Tank</strong> asset.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filtered.map(tank => (
                <div
                  key={tank.id}
                  onClick={() => setSelectedTank(tank)}
                  className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
                >
                  {/* Card header */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-800 truncate">{tank.name}</h3>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{tank.short_code}</p>
                    </div>
                    <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border flex-shrink-0 ${getStatusColor(tank.status)}`}>
                      {tank.status}
                    </span>
                  </div>

                  {/* Fill level visual */}
                  <div className="relative w-full h-28 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 mb-3 shadow-inner">
                    <div
                      className={`absolute bottom-0 w-full bg-gradient-to-t ${getFillColor(tank.fillPct)} transition-all duration-700`}
                      style={{ height: `${tank.fillPct}%` }}
                    >
                      <div className="absolute top-0 left-0 w-full h-1 bg-white/30" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-xl font-black drop-shadow-sm ${tank.fillPct > 40 ? 'text-white' : 'text-slate-600'}`}>
                        {tank.fillPct}%
                      </span>
                    </div>
                  </div>

                  {/* Utilization */}
                  <div className="flex justify-between text-xs font-medium text-slate-500 mb-2">
                    <span>Stored</span>
                    <span>{tank.totalStored.toLocaleString()} {tank.capacity > 0 ? `/ ${tank.capacity.toLocaleString()} ${tank.unit}` : tank.unit}</span>
                  </div>

                  {/* Contents */}
                  <div className="space-y-1 mt-auto">
                    {tank.contents.length === 0 ? (
                      <div className="bg-slate-50 px-3 py-2 rounded-lg border border-dashed border-slate-200 text-center">
                        <p className="text-xs text-slate-400">Empty</p>
                      </div>
                      ) : tank.contents.slice(0, 3).map((c, i) => (
                      <div key={i} className="flex justify-between items-center bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                        <span className="text-xs font-medium text-slate-600 truncate pr-2">{c.name}</span>
                        <span className="text-xs font-bold text-slate-800 whitespace-nowrap">{c.quantity.toLocaleString()} {c.unit}</span>
                      </div>
                    ))}
                    {tank.contents.length > 3 && (
                      <p className="text-[10px] text-slate-400 text-center">+{tank.contents.length - 3} more</p>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); setTransferTank(tank); }}
                      className="w-full flex items-center justify-center gap-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                    >
                      <ArrowRightOnRectangleIcon className="w-4 h-4" />
                      Transfer Out
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Detail Modal */}
      {selectedTank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelectedTank(null)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">{selectedTank.name}</h3>
                <p className="text-xs text-slate-400 font-mono">{selectedTank.full_path}</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => { setSelectedTank(null); setTransferTank(selectedTank); }} 
                  className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  <ArrowRightOnRectangleIcon className="w-4 h-4" /> Transfer
                </button>
                <button onClick={() => setSelectedTank(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Capacity</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{selectedTank.capacity ? `${selectedTank.capacity.toLocaleString()} ${selectedTank.unit}` : '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Stored</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{selectedTank.totalStored.toLocaleString()} {selectedTank.unit}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Fill</p>
                  <p className={`text-sm font-bold mt-1 ${selectedTank.fillPct >= 90 ? 'text-red-600' : selectedTank.fillPct >= 70 ? 'text-orange-600' : 'text-blue-600'}`}>
                    {selectedTank.fillPct}%
                  </p>
                </div>
              </div>

              {/* Fill bar */}
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-3 rounded-full bg-gradient-to-r ${getFillColor(selectedTank.fillPct)} transition-all duration-700`}
                  style={{ width: `${selectedTank.fillPct}%` }}
                />
              </div>

              {/* Stock entries */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Stock Contents</p>
                {selectedTank.contents.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl p-6 text-center border border-dashed border-slate-200">
                    <p className="text-sm text-slate-400">No stock in this tank</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedTank.contents.map((c, i) => (
                      <div key={i} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                              <span className="text-[9px] uppercase font-bold text-slate-400 border border-slate-200 rounded px-1">{c.type === 'product' ? 'PRD' : 'RAW'}</span>
                            </div>
                            <div className="flex gap-1.5 mt-1">
                              {c.batch_code && (
                                <span className="px-1.5 py-0.5 rounded font-mono text-[9px] text-orange-600 bg-orange-50 font-bold border border-orange-100">
                                  {c.batch_code}
                                </span>
                              )}
                              {c.lpn_code && (
                                <span className="px-1.5 py-0.5 rounded font-mono text-[9px] text-indigo-600 bg-indigo-50 font-bold border border-indigo-100">
                                  {c.lpn_code}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-800">{c.quantity.toLocaleString()} {c.unit}</p>
                            {c.updated_at && (
                              <p className="text-[10px] text-slate-400 mt-0.5">{new Date(c.updated_at).toLocaleDateString()}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Transfer Out Modal */}
      {transferTank && (
        <TransferOutModal
          tank={transferTank}
          onClose={() => setTransferTank(null)}
          onSuccess={() => { setTransferTank(null); fetchTanks(); }}
        />
      )}
    </div>
  );
};

const TransferOutModal = ({ tank, onClose, onSuccess }) => {
  const [locations, setLocations] = useState([]);
  const [destLocation, setDestLocation] = useState('');
  const [selectedItemIdx, setSelectedItemIdx] = useState(0);
  const [transferQty, setTransferQty] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch('/master-data/locations/').then(r => r.json()).then(data => {
      const locs = Array.isArray(data) ? data : data.results || [];
      // filter out current tank
      setLocations(locs.filter(l => l.id !== tank.id));
    });
  }, [tank.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const item = tank.contents[selectedItemIdx];
    if (!item) return;

    if (parseFloat(transferQty) > item.quantity) {
      alert(`Cannot transfer more than available (${item.quantity}).`);
      return;
    }

    setSubmitting(true);
    try {
      let remainingToTransfer = parseFloat(transferQty);
      const subStocks = item.sub_stocks || [];
      
      // If there are no sub_stocks (shouldn't happen with updated code), fallback to single transfer
      if (subStocks.length === 0) {
        subStocks.push({ quantity: remainingToTransfer, batch: item.batch, lpn: item.lpn });
      }

      for (const stock of subStocks) {
        if (remainingToTransfer <= 0) break;
        const stockQty = parseFloat(stock.quantity) || 0;
        if (stockQty <= 0) continue;

        const qtyToTransferForThisStock = Math.min(stockQty, remainingToTransfer);

        const payload = {
          location: tank.id, // source
          movement_type: 'transfer_out',
          quantity: qtyToTransferForThisStock,
          counterpart_location: parseInt(destLocation),
        };

        let endpoint = '';
        if (item.type === 'raw_material') {
          payload.material = item.item_id;
          if (stock.batch) payload.batch = stock.batch;
          if (stock.lpn) payload.lpn = stock.lpn;
          endpoint = '/raw-materials-stock/stock-movements/record/';
        } else {
          payload.product = item.item_id;
          if (stock.batch) payload.batch = stock.batch;
          if (stock.lpn) payload.lpn = stock.lpn;
          endpoint = '/products-stock/stock-movements/record/';
        }

        const res = await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Transfer failed for one of the batches');
        }

        remainingToTransfer -= qtyToTransferForThisStock;
      }

      onSuccess();
    } catch (err) {
      alert(err.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800 text-lg mb-2">Transfer Out</h3>
        <p className="text-sm text-slate-500 mb-6">Transfer contents from <span className="font-semibold text-blue-600">{tank.name}</span> to another location.</p>
        
        {tank.contents.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-slate-400">Tank is empty. Nothing to transfer.</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Item to Transfer</label>
              <select 
                value={selectedItemIdx} 
                onChange={e => {
                  setSelectedItemIdx(e.target.value);
                  setTransferQty('');
                }} 
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {tank.contents.map((c, i) => (
                  <option key={i} value={i}>
                    {c.name} ({c.quantity} {c.unit} available) {c.type === 'product' ? '[PRD]' : '[RAW]'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Transfer Quantity</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="0.01" 
                  min="0.01"
                  max={tank.contents[selectedItemIdx]?.quantity}
                  value={transferQty} 
                  onChange={e => setTransferQty(e.target.value)} 
                  className="w-full rounded-lg border border-gray-300 pl-3 pr-16 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  required 
                />
                <button 
                  type="button"
                  onClick={() => setTransferQty(tank.contents[selectedItemIdx]?.quantity || '')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  MAX
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Destination Location</label>
              <select 
                value={destLocation} 
                onChange={e => setDestLocation(e.target.value)} 
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                required
              >
                <option value="">Select destination...</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2">
                {submitting ? 'Transferring...' : <><ArrowRightOnRectangleIcon className="w-4 h-4" /> Confirm Transfer</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default StorageTanksDashboardPage;
