import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/api';

const fmt = (v) => {
  const n = parseFloat(v)
  return isNaN(n) ? '₹0.00' : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const fmtNum = (v) => {
  const n = parseInt(v)
  return isNaN(n) ? '0' : n.toLocaleString('en-IN')
}

const StatCard = ({ title, value, note, dot }) => (
  <div className="relative rounded-2xl bg-white shadow-sm border border-gray-100 p-5">
    <div className={`absolute top-4 right-4 w-2.5 h-2.5 rounded-full ${dot}`} />
    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{title}</p>
    <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
    {note && <p className="mt-1 text-xs text-gray-400">{note}</p>}
  </div>
)

const SkeletonCard = () => (
  <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-5 animate-pulse">
    <div className="h-3 w-24 bg-slate-200 rounded mb-3" />
    <div className="h-7 w-32 bg-slate-200 rounded mb-2" />
    <div className="h-2 w-40 bg-slate-100 rounded" />
  </div>
)

const TrendChart = ({ data }) => {
  if (!data?.length) return <p className="text-sm text-gray-400 text-center py-8">No trend data yet.</p>
  const max = Math.max(...data.map(d => d.value), 1)
  const W = 320, H = 120
  const pts = data.map((d, i) => {
    const x = data.length > 1 ? Math.round((i / (data.length - 1)) * W) : W / 2
    const y = Math.round(H - (d.value / max) * H)
    return `${x},${y}`
  }).join(' ')
  return (
    <div className="relative h-40 bg-slate-50 rounded-xl p-3 border border-slate-100">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
        <polygon fill="url(#g)" points={`${pts} ${W},${H} 0,${H}`} />
        {data.map((d, i) => {
          const x = data.length > 1 ? Math.round((i / (data.length - 1)) * W) : W / 2
          const y = Math.round(H - (d.value / max) * H)
          return <circle key={d.label} cx={x} cy={y} r="4" fill="#f97316" />
        })}
      </svg>
      <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[10px] text-gray-400">
        {data.map(d => <span key={d.label} className="truncate max-w-[52px]">{d.label}</span>)}
      </div>
    </div>
  )
}

const SalesDashboard = () => {
  const [stats, setStats]   = useState(null)
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true); setError('')
      try {
        const [sRes, rRes] = await Promise.all([
          apiFetch('/sales/dashboard-stats/'),
          apiFetch('/sales/invoices/?page_size=5&ordering=-invoice_date'),
        ])
        if (cancelled) return
        if (sRes?.ok) setStats(await sRes.json())
        else setError('Could not load stats.')
        if (rRes?.ok) {
          const d = await rRes.json()
          setRecent(d.results ?? [])
        }
      } catch { if (!cancelled) setError('Network error loading dashboard.') }
      finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-6 animate-pulse h-52" />
    </div>
  )

  if (error) return (
    <div className="rounded-2xl bg-red-50 border border-red-200 p-5 text-sm text-red-700">{error}</div>
  )

  const t = stats?.totals ?? {}

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Invoices"    value={fmtNum(t.total_invoices)}  note="All time"              dot="bg-orange-400" />
        <StatCard title="Total Revenue"     value={fmt(t.total_revenue)}      note="Net amount"            dot="bg-emerald-400" />
        <StatCard title="Total Gross"       value={fmt(t.total_gross)}        note="Before discount"       dot="bg-blue-400" />
        <StatCard title="Avg. Invoice"      value={fmt(t.avg_invoice)}        note="Net per invoice"       dot="bg-violet-400" />
      </div>

      {/* Trend + top customers */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Revenue Trend</h3>
            <span className="text-[10px] bg-orange-50 text-orange-600 font-semibold px-2 py-0.5 rounded-full">Last 6 months</span>
          </div>
          <TrendChart data={stats?.trend ?? []} />
        </div>

        <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Top Customers</h3>
          {(stats?.top_customers ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data yet.</p>
          ) : (
            <div className="space-y-2">
              {(stats?.top_customers ?? []).map((c, i) => (
                <div key={c.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{i + 1}. {c.name}</p>
                    <p className="text-[10px] text-gray-400">{c.invoices} invoice{c.invoices !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-700">{fmt(c.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent sales */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Recent Invoices</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No invoices yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {recent.map(inv => (
              <div key={inv.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-xs font-semibold text-gray-800 font-mono">{inv.invoice_number}</p>
                  <p className="text-[10px] text-gray-400">{inv.customer_name} · {inv.invoice_date}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-gray-900">{fmt(inv.net_amount)}</p>
                  {parseFloat(inv.discount) > 0 && (
                    <p className="text-[10px] text-red-400">-{fmt(inv.discount)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default SalesDashboard
