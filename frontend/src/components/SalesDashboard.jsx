import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api';

const formatCurrency = (value) =>
  typeof value === 'number'
    ? `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '₹0.00';

const formatNumber = (value) =>
  typeof value === 'number' ? value.toLocaleString('en-IN') : '0';

const lineChartPoints = (data, width = 320, height = 160) => {
  const max = Math.max(...data.map((item) => item.value), 1);
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  return data
    .map((item, index) => {
      const x = Math.round(index * stepX);
      const y = Math.round(height - (item.value / max) * height);
      return `${x},${y}`;
    })
    .join(' ');
};

const DashboardStatCard = ({ title, value, note, accent }) => (
  <div className="rounded-3xl bg-white shadow-sm border border-gray-200 p-5">
    <p className="text-sm text-gray-500">{title}</p>
    <p className="mt-3 text-3xl font-semibold text-gray-900">{value}</p>
    {note && <p className="mt-2 text-xs text-gray-500">{note}</p>}
    <div className={`absolute top-5 right-5 w-3 h-3 rounded-full ${accent}`} />
  </div>
);

const TrendLineChart = ({ data }) => {
  if (!data.length) return <p className="text-sm text-gray-500">No trend data available.</p>;

  const maxValue = Math.max(...data.map((item) => item.value), 1);
  const points = lineChartPoints(data);

  return (
    <div className="relative h-44 rounded-3xl bg-slate-50 p-4 border border-slate-200">
      <svg viewBox="0 0 320 160" className="h-full w-full">
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline fill="none" stroke="#f97316" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} />
        <polygon fill="url(#trendGradient)" points={`${points} 320,160 0,160`} />
        {data.map((point, index) => {
          const x = data.length > 1 ? (320 / (data.length - 1)) * index : 160;
          const y = 160 - (point.value / maxValue) * 160;
          return <circle key={point.label} cx={x} cy={y} r="4" fill="#f97316" />;
        })}
      </svg>
      <div className="absolute bottom-3 left-4 right-4 flex justify-between text-[11px] text-gray-500">
        {data.map((item) => (
          <span key={item.label} className="truncate" style={{ maxWidth: 56 }}>{item.label}</span>
        ))}
      </div>
    </div>
  );
};

// Skeleton shimmer for loading state
const SkeletonCard = () => (
  <div className="rounded-3xl bg-white shadow-sm border border-gray-200 p-5 animate-pulse">
    <div className="h-3 w-28 bg-slate-200 rounded mb-4" />
    <div className="h-8 w-20 bg-slate-200 rounded mb-3" />
    <div className="h-2 w-36 bg-slate-100 rounded" />
  </div>
);

const SalesDashboard = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiFetch('/sales/invoices/');
        if (cancelled) return;

        if (!res?.ok) {
          setError('Unable to load dashboard data.');
          return;
        }

        const json = await res.json();
        if (!cancelled) {
          setInvoices(Array.isArray(json) ? json : (json.results ?? []));
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError('Network error loading dashboard.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, []);

  const summary = useMemo(() => {
    const totalSales = invoices.length;
    const totalRevenue = invoices.reduce(
      (sum, inv) => sum + Number(inv.net_amount || inv.amount || 0),
      0
    );
    return {
      totalSales,
      totalRevenue,
      averageInvoice: totalSales ? totalRevenue / totalSales : 0,
    };
  }, [invoices]);

  const revenueTrend = useMemo(() => {
    const grouped = invoices.reduce((acc, inv) => {
      const date = new Date(inv.bill_date || inv.invoice_date || inv.date);
      if (Number.isNaN(date.getTime())) return acc;
      const label = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      acc[label] = (acc[label] || 0) + Number(inv.net_amount || inv.amount || 0);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => new Date(a.label) - new Date(b.label))
      .slice(-6);
  }, [invoices]);

  const topCustomers = useMemo(() => {
    const totals = invoices.reduce((acc, inv) => {
      const name = inv.customer_name || inv.customer?.customer_name || 'Unknown';
      acc[name] = (acc[name] || 0) + Number(inv.net_amount || inv.amount || 0);
      return acc;
    }, {});

    return Object.entries(totals)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [invoices]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="rounded-3xl bg-white shadow-sm border border-gray-200 p-6 animate-pulse h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl bg-red-50 border border-red-200 p-6 text-red-700">{error}</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat Cards — customers removed; only invoice-derived stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <DashboardStatCard
          title="Total Sales Invoices"
          value={formatNumber(summary.totalSales)}
          note="Invoices captured in the system"
          accent="bg-orange-400"
        />
        <DashboardStatCard
          title="Total Revenue"
          value={formatCurrency(summary.totalRevenue)}
          note="Sum of all invoice net values"
          accent="bg-emerald-400"
        />
        <DashboardStatCard
          title="Avg. Invoice Value"
          value={formatCurrency(summary.averageInvoice)}
          note="Revenue per invoice"
          accent="bg-violet-400"
        />
      </div>

      {/* Revenue Trend */}
      <div className="rounded-3xl bg-white shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Revenue Trend</h2>
            <p className="text-sm text-slate-500 mt-1">Latest 6 periods by invoice date.</p>
          </div>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
            Net Revenue
          </span>
        </div>
        <TrendLineChart data={revenueTrend} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Top Customers */}
        <div className="rounded-3xl bg-white shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Top Customers by Revenue</h2>
          {topCustomers.length ? (
            <div className="space-y-3">
              {topCustomers.map((customer, index) => (
                <div key={customer.name} className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{index + 1}. {customer.name}</p>
                    <p className="text-xs text-slate-500">{formatCurrency(customer.total)}</p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Rank</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No data available for top customers.</p>
          )}
        </div>

        {/* Recent Sales */}
        <div className="rounded-3xl bg-white shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Sales</h2>
          {invoices.slice(0, 5).length ? (
            <div className="space-y-3">
              {invoices.slice(0, 5).map((invoice) => (
                <div
                  key={invoice.id || invoice.invoice_number || JSON.stringify(invoice)}
                  className="rounded-2xl bg-slate-50 p-4"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {invoice.invoice_number || invoice.bill_no || 'Invoice'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {invoice.customer_name || invoice.customer?.customer_name || 'Unknown customer'}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                    <span>
                      {new Date(invoice.bill_date || invoice.invoice_date || invoice.date || '')
                        .toLocaleDateString('en-IN') || 'No date'}
                    </span>
                    <span>{formatCurrency(Number(invoice.net_amount || invoice.amount || 0))}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No recent sales invoices to show.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesDashboard;