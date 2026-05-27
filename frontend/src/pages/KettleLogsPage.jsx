import React, { useState, useEffect, useCallback } from 'react';
import Topbar from '../components/Topbar';
import Sidebar from '../components/Sidebar';
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  BeakerIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FireIcon,
  ClockIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { apiFetch } from '../utils/api';

const STATUS_FILTERS = [
  { value: '', label: 'All Orders' },
  { value: 'completed', label: 'Completed' },
  { value: 'in_progress', label: 'Active' },
  { value: 'planned', label: 'Planned' },
  { value: 'draft', label: 'Draft' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_BADGE = {
  draft:       'bg-slate-100 text-slate-600 border-slate-200',
  planned:     'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-orange-100 text-orange-700 border-orange-200',
  completed:   'bg-green-100 text-green-700 border-green-200',
  cancelled:   'bg-red-100 text-red-400 border-red-200',
};

const fmt = (n, dp = 4) =>
  n != null && n !== '' ? parseFloat(n).toLocaleString(undefined, { maximumFractionDigits: dp }) : null;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : null;

const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

// ── Order Row ──────────────────────────────────────────────────────────────────
const OrderRow = ({ order }) => {
  const [expanded, setExpanded] = useState(false);

  const isActive    = order.status === 'in_progress';
  const isCompleted = order.status === 'completed';

  return (
    <div className={`bg-white rounded-xl border shadow-sm mb-3 overflow-hidden transition-all ${
      isActive ? 'border-orange-200' : isCompleted ? 'border-green-100' : 'border-slate-100'
    }`}>
      {/* Collapsed row */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors"
      >
        {/* Expand icon */}
        <span className="text-slate-400 flex-shrink-0">
          {expanded
            ? <ChevronDownIcon className="w-4 h-4" />
            : <ChevronRightIcon className="w-4 h-4" />}
        </span>

        {/* Order number */}
        <div className="flex-shrink-0 min-w-[130px]">
          <p className="text-sm font-bold text-slate-800 font-mono">{order.order_number}</p>
          {order.mixture_id && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded font-mono">
              {order.mixture_id}
            </span>
          )}
        </div>

        {/* Product / mix name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-700 truncate">
            {order.product_name || order.display_name || '—'}
          </p>
          {order.recipe_name && order.recipe_name !== order.product_name && (
            <p className="text-xs text-slate-400 truncate">{order.recipe_name}</p>
          )}
        </div>

        {/* Status */}
        <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${STATUS_BADGE[order.status] || STATUS_BADGE.draft}`}>
          {isActive ? <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse inline-block" /> Active</span> : order.status_display || order.status}
        </span>

        {/* Dates */}
        <div className="flex-shrink-0 text-xs text-slate-400 hidden md:block min-w-[160px]">
          {order.start_time ? (
            <div className="flex items-center gap-1">
              <ClockIcon className="w-3 h-3" />
              <span>{fmtDate(order.start_time)} {fmtTime(order.start_time)}</span>
            </div>
          ) : <span className="italic">Not started</span>}
          {order.actual_end_time && (
            <div className="text-green-600 flex items-center gap-1 mt-0.5">
              <CheckCircleIcon className="w-3 h-3" />
              <span>{fmtDate(order.actual_end_time)} {fmtTime(order.actual_end_time)}</span>
            </div>
          )}
        </div>

        {/* Target → Produced */}
        <div className="flex-shrink-0 text-right hidden sm:block min-w-[110px]">
          <p className="text-xs text-slate-400">Target</p>
          <p className="text-sm font-bold text-slate-700">
            {fmt(order.target_quantity, 2)}
            {order.target_unit_symbol && <span className="text-xs text-slate-400 font-normal ml-0.5">{order.target_unit_symbol}</span>}
          </p>
          {isCompleted && (
            <p className="text-xs text-green-600 font-semibold">
              → {fmt(order.produced_quantity, 2)}
              {order.target_unit_symbol && <span className="font-normal text-green-500 ml-0.5">{order.target_unit_symbol}</span>}
            </p>
          )}
        </div>

        {/* Batch code */}
        <div className="flex-shrink-0 min-w-[90px] text-right hidden lg:block">
          {order.produced_batch_code ? (
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded">
              {order.produced_batch_code}
            </span>
          ) : (
            <span className="text-slate-200 text-xs">—</span>
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50 space-y-4">
          {/* Meta row */}
          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            {order.start_time && (
              <div><span className="font-semibold text-slate-600">Started:</span> {fmtDate(order.start_time)} {fmtTime(order.start_time)}</div>
            )}
            {order.actual_end_time && (
              <div><span className="font-semibold text-slate-600">Completed:</span> {fmtDate(order.actual_end_time)} {fmtTime(order.actual_end_time)}</div>
            )}
            {order.mixing_temperature != null && (
              <div className="flex items-center gap-1">
                <FireIcon className="w-3 h-3 text-orange-400" />
                <span className="font-semibold text-slate-600">Temp:</span> {order.mixing_temperature}°C
              </div>
            )}
            {isCompleted && order.produced_quantity != null && (
              <div>
                <span className="font-semibold text-slate-600">Produced:</span>{' '}
                {fmt(order.produced_quantity, 2)}{order.target_unit_symbol ? ` ${order.target_unit_symbol}` : ''}
                {' '}(target: {fmt(order.target_quantity, 2)}{order.target_unit_symbol ? ` ${order.target_unit_symbol}` : ''})
              </div>
            )}
            {order.produced_batch_code && (
              <div>
                <span className="font-semibold text-slate-600">Batch:</span>{' '}
                <span className="font-mono font-bold text-green-700">{order.produced_batch_code}</span>
              </div>
            )}
          </div>

          {order.operator_notes && (
            <p className="text-xs text-slate-500 italic border-l-2 border-slate-200 pl-3">
              "{order.operator_notes}"
            </p>
          )}

          {/* Materials table */}
          {(!order.materials || order.materials.length === 0) ? (
            <p className="text-xs text-slate-400 italic">No materials recorded for this order.</p>
          ) : (
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Material</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-400">Planned</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-600">Loaded</th>
                    <th className="text-right px-3 py-2 font-semibold text-purple-600">Consumed</th>
                    <th className="text-right px-3 py-2 font-semibold text-red-500">Wastage</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-400">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.materials.map((m, i) => {
                    const loaded   = m.actual_load_qty != null ? fmt(m.actual_load_qty) : null;
                    const consumed = parseFloat(m.actual_consumed_qty) > 0 ? fmt(m.actual_consumed_qty) : null;
                    const wasted   = parseFloat(m.wastage_qty) > 0 ? fmt(m.wastage_qty) : null;
                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-medium text-slate-700">
                          {m.material_name}
                          {m.is_loaded && (
                            <span className="ml-1.5 text-[9px] px-1 py-0.5 bg-green-50 text-green-600 border border-green-200 rounded font-bold">✓</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-400">
                          {fmt(m.planned_qty)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-700">
                          {loaded
                            ? loaded
                            : <span className="text-slate-300 font-normal italic text-[10px]">= planned</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-purple-700">
                          {consumed || <span className="text-slate-200">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-red-500">
                          {wasted || <span className="text-slate-200">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-400">{m.unit_symbol}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────────
const KettleLogsPage = () => {
  const [kettles, setKettles] = useState([]);
  const [selectedKettle, setSelectedKettle] = useState('');
  const [allOrders, setAllOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch kettle locations once; pre-select from ?kettle= URL param if present
  useEffect(() => {
    apiFetch('/master-data/locations/')
      .then(r => r.json())
      .then(data => {
        const all = Array.isArray(data) ? data : data.results || [];
        const ks = all.filter(l => l.type === 'kettle' || l.linked_asset_type === 'Kettle');
        setKettles(ks);
        const urlParam = new URLSearchParams(window.location.search).get('kettle');
        if (urlParam && ks.some(k => String(k.id) === urlParam)) {
          setSelectedKettle(urlParam);
        } else if (ks.length > 0) {
          setSelectedKettle(String(ks[0].id));
        }
      })
      .catch(() => setError('Failed to load kettle locations.'));
  }, []);

  const fetchOrders = useCallback(async () => {
    if (!selectedKettle) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('kettle', selectedKettle);
      params.set('ordering', '-created_at');
      if (statusFilter) params.set('status', statusFilter);

      const res = await apiFetch(`/production/orders/?${params.toString()}`);
      if (!res || !res.ok) throw new Error('Failed to fetch orders');
      const data = await res.json();
      setAllOrders(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError(err.message || 'Failed to load production orders.');
    } finally {
      setLoading(false);
    }
  }, [selectedKettle, statusFilter]);

  useEffect(() => {
    if (selectedKettle) fetchOrders();
  }, [selectedKettle, statusFilter]);

  // Client-side filter for date range and search
  const filtered = allOrders.filter(o => {
    if (search) {
      const q = search.toLowerCase();
      const match =
        o.order_number?.toLowerCase().includes(q) ||
        o.product_name?.toLowerCase().includes(q) ||
        o.recipe_name?.toLowerCase().includes(q) ||
        o.mixture_id?.toLowerCase().includes(q) ||
        o.display_name?.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (dateFrom) {
      const d = o.start_time || o.created_at;
      if (!d || d < dateFrom) return false;
    }
    if (dateTo) {
      const d = o.start_time || o.created_at;
      if (!d || d > dateTo + 'T23:59:59') return false;
    }
    return true;
  });

  const kettleName = kettles.find(k => String(k.id) === String(selectedKettle))?.name || '';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <div className="flex-1 ml-16 flex flex-col h-screen overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 pb-20">

          {/* Header */}
          <div className="mb-6 bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Kettle Production Log</h1>
              <p className="text-slate-500 mt-0.5 text-sm">
                Production order history — materials planned, loaded, consumed and wasted per order.
                {kettleName && <> Showing: <span className="font-semibold text-orange-600">{kettleName}</span></>}
              </p>
            </div>
            <button
              onClick={fetchOrders}
              disabled={loading}
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Filters */}
          <div className="mb-5 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Kettle */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <BeakerIcon className="w-3.5 h-3.5" /> Kettle
                </label>
                <select
                  value={selectedKettle}
                  onChange={e => setSelectedKettle(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 min-w-[160px]"
                >
                  <option value="">— Select Kettle —</option>
                  {kettles.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </div>

              {/* Status */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500">Status</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 min-w-[140px]"
                >
                  {STATUS_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>

              {/* Date range */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500">From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500">To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>

              {/* Search */}
              <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <label className="text-xs font-semibold text-slate-500">Search</label>
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Order #, product, mix ID..."
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
              </div>

              {(dateFrom || dateTo || search) && (
                <button
                  type="button"
                  onClick={() => { setDateFrom(''); setDateTo(''); setSearch(''); }}
                  className="self-end px-3 py-2 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
          )}

          {/* Summary bar */}
          {!loading && allOrders.length > 0 && (
            <div className="mb-4 flex gap-3 flex-wrap">
              {[
                { label: 'Total', value: filtered.length, color: 'text-slate-700' },
                { label: 'Completed', value: filtered.filter(o => o.status === 'completed').length, color: 'text-green-600' },
                { label: 'Active', value: filtered.filter(o => o.status === 'in_progress').length, color: 'text-orange-600' },
                { label: 'Planned', value: filtered.filter(o => ['planned', 'draft'].includes(o.status)).length, color: 'text-blue-600' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl px-4 py-2.5 border border-slate-100 shadow-sm flex items-center gap-2">
                  <span className="text-xs text-slate-400">{s.label}</span>
                  <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Orders list */}
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <ArrowPathIcon className="w-8 h-8 text-orange-400 animate-spin" />
            </div>
          ) : !selectedKettle ? (
            <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-xl border border-dashed border-slate-200">
              <BeakerIcon className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-sm text-slate-400 font-medium">Select a kettle to view its production history</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-xl border border-dashed border-slate-200">
              <BeakerIcon className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-sm text-slate-400 font-medium">No production orders found</p>
              <p className="text-xs text-slate-300 mt-0.5">Try adjusting your filters</p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-slate-400 mb-3 font-medium">
                {filtered.length} order{filtered.length !== 1 ? 's' : ''} — click a row to expand materials detail
              </p>
              {filtered.map(order => (
                <OrderRow key={order.id} order={order} />
              ))}
            </div>
          )}

        </main>
      </div>
    </div>
  );
};

export default KettleLogsPage;
