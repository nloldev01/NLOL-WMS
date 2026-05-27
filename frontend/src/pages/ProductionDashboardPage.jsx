import React, { useState, useEffect } from 'react';
import Topbar from '../components/Topbar';
import Sidebar from '../components/Sidebar';
import { BeakerIcon, ArrowPathIcon, ClockIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { apiFetch } from '../utils/api';
import { NavLink } from 'react-router-dom';

// ── Live countdown hook ────────────────────────────────────────────────────────
const useCountdown = (endTime) => {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!endTime) return;
    const tick = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) { setLabel('Overdue'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [endTime]);
  return label;
};

// ── Single asset tile ──────────────────────────────────────────────────────────
const AssetTile = ({ asset }) => {
  const countdown = useCountdown(asset.activeOrder?.expected_end_time);
  const isActive = !!asset.activeOrder;
  const isOverdue = countdown === 'Overdue';

  const statusStyle = () => {
    if (isOverdue) return 'bg-red-50 border-red-200';
    if (isActive)  return 'bg-orange-50 border-orange-200';
    const s = asset.status;
    if (s === 'maintenance') return 'bg-amber-50 border-amber-200';
    if (s === 'mixing')      return 'bg-orange-50 border-orange-200';
    if (s === 'idle')        return 'bg-slate-50 border-slate-200';
    if (s === 'inactive')    return 'bg-gray-50 border-gray-200';
    return 'bg-white border-slate-100';
  };

  const badgeStyle = () => {
    if (isOverdue) return 'bg-red-100 text-red-700 border-red-200';
    if (isActive)  return 'bg-orange-100 text-orange-700 border-orange-200';
    const s = asset.status;
    if (s === 'maintenance') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (s === 'mixing')      return 'bg-orange-100 text-orange-700 border-orange-200';
    if (s === 'idle')        return 'bg-slate-100 text-slate-500 border-slate-200';
    if (s === 'inactive')    return 'bg-gray-100 text-gray-500 border-gray-200';
    return 'bg-green-100 text-green-700 border-green-200';
  };

  const badgeLabel = isOverdue ? 'Overdue' : isActive ? 'Active' : asset.status;

  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-1.5 transition-all ${statusStyle()}`}>
      {/* Name + type */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-slate-800 leading-tight truncate">{asset.name}</p>
        <span className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase border ${badgeStyle()}`}>
          {badgeLabel}
        </span>
      </div>

      {/* Asset type label */}
      <p className="text-[10px] text-slate-400 font-medium">{asset.asset_type}</p>

      {/* Active order info */}
      {isActive ? (
        <div className="mt-0.5 space-y-0.5">
          {asset.activeOrder.order_number && (
            <p className="text-[10px] text-slate-600 font-mono truncate">{asset.activeOrder.order_number}</p>
          )}
          {asset.activeOrder.product_name && (
            <p className="text-[10px] text-slate-500 truncate">{asset.activeOrder.product_name}</p>
          )}
          {countdown && (
            <div className={`flex items-center gap-1 mt-1 ${isOverdue ? 'text-red-600' : 'text-orange-600'}`}>
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[10px] font-bold">{countdown}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[10px] text-slate-400 mt-0.5">Idle</p>
      )}
    </div>
  );
};

// ── Section with link to dedicated page ───────────────────────────────────────
const AssetSection = ({ title, items, linkTo, linkLabel, accentColor }) => (
  <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
    <div className={`flex items-center justify-between px-4 py-3 border-b border-slate-100`}>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${accentColor}`} />
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">{items.length}</span>
      </div>
      {linkTo && (
        <NavLink
          to={linkTo}
          className="text-[10px] font-semibold text-blue-500 hover:text-blue-700 hover:underline"
        >
          {linkLabel} →
        </NavLink>
      )}
    </div>

    <div className="p-3">
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">No assets linked. Set up in Master Data.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
          {items.map(a => <AssetTile key={a.id} asset={a} />)}
        </div>
      )}
    </div>
  </div>
);

const ORDER_STATUS_STYLES = {
  draft:       'bg-slate-100 text-slate-600 border-slate-200',
  planned:     'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-orange-100 text-orange-700 border-orange-200',
  completed:   'bg-green-100 text-green-700 border-green-200',
  cancelled:   'bg-red-100 text-red-600 border-red-200',
};

// ── Main page ──────────────────────────────────────────────────────────────────
const ProductionDashboardPage = () => {
  const [assets, setAssets] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [locRes, assetRes, ordersRes, allOrdersRes] = await Promise.all([
        apiFetch('/master-data/locations/'),
        apiFetch('/master-data/assets/'),
        apiFetch('/production/orders/?status=in_progress'),
        apiFetch('/production/orders/?ordering=-created_at'),
      ]);

      if (!locRes || !locRes.ok) throw new Error('Failed to fetch locations');
      const allLocs = await locRes.json();
      const locations = Array.isArray(allLocs) ? allLocs : allLocs.results || [];
      const linkedLocs = locations.filter(l => l.linked_asset);

      const allAssets = assetRes && assetRes.ok ? await assetRes.json() : [];
      const assetsData = Array.isArray(allAssets) ? allAssets : allAssets.results || [];
      const assetMap = Object.fromEntries(assetsData.map(a => [a.id, a]));

      let activeOrders = [];
      if (ordersRes && ordersRes.ok) {
        const od = await ordersRes.json();
        activeOrders = Array.isArray(od) ? od : od.results || [];
      }

      const combined = linkedLocs.map(loc => {
        const asset = loc.linked_asset ? assetMap[loc.linked_asset] : null;
        const activeOrder = activeOrders.find(o => o.kettle === loc.id);
        return {
          id: loc.id,
          name: loc.linked_asset_name || loc.name,
          asset_type: loc.linked_asset_type || asset?.asset_type || 'Unknown',
          status: loc.linked_asset_status || 'active',
          loc_type: loc.type,
          activeOrder: activeOrder ? {
            order_number: activeOrder.order_number,
            product_name: activeOrder.product_name,
            recipe_name: activeOrder.recipe_name,
            expected_end_time: activeOrder.expected_end_time,
          } : null,
        };
      });

      setAssets(combined);

      if (allOrdersRes && allOrdersRes.ok) {
        const od = await allOrdersRes.json();
        const all = Array.isArray(od) ? od : od.results || [];
        setRecentOrders(all.slice(0, 20));
      }

      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 60s
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, []);

  const storageTanks = assets.filter(a => a.asset_type === 'Storage Tank');
  const verticalTanks = assets.filter(a => a.asset_type === 'Vertical Tank');
  const kettles = assets.filter(a => a.asset_type === 'Kettle' || a.loc_type === 'kettle');
  const others = assets.filter(a =>
    !storageTanks.find(x => x.id === a.id) &&
    !verticalTanks.find(x => x.id === a.id) &&
    !kettles.find(x => x.id === a.id)
  );

  // Summary counts
  const totalActive = assets.filter(a => a.activeOrder).length;
  const totalMaintenance = assets.filter(a => a.status === 'maintenance').length;
  const totalIdle = assets.filter(a => !a.activeOrder && a.status === 'active').length;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <div className="flex-1 ml-16 flex flex-col h-screen overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 pb-20">

          {/* Header */}
          <div className="mb-5 bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
            <div>
              <h1 className="text-lg font-bold text-slate-800">Production Overview</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : 'Loading...'}
                {' · '}Auto-refreshes every 60s
              </p>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 bg-orange-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-orange-600 disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Summary strip */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Total Assets', value: assets.length, color: 'text-slate-700', bg: 'bg-white' },
              { label: 'In Production', value: totalActive, color: 'text-orange-600', bg: 'bg-orange-50' },
              { label: 'Idle', value: totalIdle, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Maintenance', value: totalMaintenance, color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl p-3 border border-slate-100 shadow-sm`}>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{s.label}</p>
                <p className={`text-2xl font-black mt-0.5 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>
          )}

          {loading && assets.length === 0 ? (
            <div className="flex justify-center items-center h-48">
              <ArrowPathIcon className="w-8 h-8 text-orange-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <AssetSection
                title="Storage Tanks"
                items={storageTanks}
                linkTo="/production/storage-tanks"
                linkLabel="View Details"
                accentColor="bg-blue-500"
              />
              <AssetSection
                title="Vertical Tanks"
                items={verticalTanks}
                linkTo="/production/vertical-tanks"
                linkLabel="View Details"
                accentColor="bg-purple-500"
              />
              <AssetSection
                title="Mixing Kettles"
                items={kettles}
                linkTo="/production/kettles"
                linkLabel="View Details"
                accentColor="bg-orange-500"
              />
              {others.length > 0 && (
                <AssetSection
                  title="Other Assets"
                  items={others}
                  accentColor="bg-slate-400"
                />
              )}

              {/* Recent Orders */}
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    <h2 className="text-sm font-bold text-slate-800">Recent Orders</h2>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">{recentOrders.length}</span>
                  </div>
                  <NavLink to="/production/kettles" className="text-[10px] font-semibold text-blue-500 hover:text-blue-700 hover:underline">
                    Manage →
                  </NavLink>
                </div>

                {recentOrders.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No production orders yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Order #</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Product</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Kettle</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Qty</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Produced Batch</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Status</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {recentOrders.map(order => (
                          <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2.5 font-mono font-bold text-slate-700">{order.order_number}</td>
                            <td className="px-4 py-2.5 text-slate-600 max-w-[160px] truncate">{order.product_name || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-500">{order.kettle_name || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-700 font-semibold whitespace-nowrap">
                              {parseFloat(order.target_quantity).toLocaleString()}
                              {order.target_unit_symbol && <span className="text-slate-400 font-normal text-[10px] ml-0.5">{order.target_unit_symbol}</span>}
                              {order.status === 'completed' && order.produced_quantity > 0 && (
                                <span className="text-slate-400 font-normal"> → {parseFloat(order.produced_quantity).toLocaleString()}{order.target_unit_symbol && <span className="text-[10px] ml-0.5">{order.target_unit_symbol}</span>}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {order.produced_batch_code ? (
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded whitespace-nowrap">
                                  {order.produced_batch_code}
                                </span>
                              ) : (
                                <span className="text-slate-300 text-[10px]">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border ${ORDER_STATUS_STYLES[order.status] || ORDER_STATUS_STYLES.draft}`}>
                                {order.status_display || order.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-400">
                              {new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ProductionDashboardPage;
