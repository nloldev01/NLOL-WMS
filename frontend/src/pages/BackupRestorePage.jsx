import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch, getApiError, getUserRole } from '../utils/api'

const STATUS_BADGES = {
  running: 'bg-blue-50 text-blue-600',
  success: 'bg-green-50 text-green-700',
  failed:  'bg-red-50 text-red-600',
}

const TRIGGER_BADGES = {
  manual:    'bg-slate-100 text-slate-600',
  scheduled: 'bg-purple-50 text-purple-600',
}

const formatBytes = (bytes) => {
  if (bytes === null || bytes === undefined) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

const formatDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

// Matches the "NLOL WMS DB Backup" Windows Task Scheduler job: weekly, Sundays at 02:00,
// with StartWhenAvailable so a missed run fires as soon as the machine is back on.
const SCHEDULE_DAY_OF_WEEK = 0 // Sunday
const SCHEDULE_HOUR = 2

const getNextScheduledRun = () => {
  const now = new Date()
  const next = new Date(now)
  next.setHours(SCHEDULE_HOUR, 0, 0, 0)
  let daysUntil = (SCHEDULE_DAY_OF_WEEK - next.getDay() + 7) % 7
  if (daysUntil === 0 && next <= now) daysUntil = 7
  next.setDate(next.getDate() + daysUntil)
  return next
}

const BackupRestorePage = () => {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionId, setActionId] = useState(null)
  const pollRef = useRef(null)
  const isSuperadmin = getUserRole() === 'superadmin'

  useEffect(() => {
    fetchJobs()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const fetchJobs = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/backups/')
      if (res?.ok) setJobs(await res.json())
      else setError(await getApiError(res))
    } catch {
      setError('Network error loading backup history.')
    } finally {
      setLoading(false)
    }
  }

  const pollJob = (jobId) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch(`/backups/${jobId}/`)
        if (res?.ok) {
          const job = await res.json()
          setJobs((prev) => {
            const exists = prev.some((j) => j.id === job.id)
            return exists ? prev.map((j) => (j.id === job.id ? job : j)) : [job, ...prev]
          })
          if (job.status !== 'running') {
            clearInterval(pollRef.current)
            pollRef.current = null
            setRunning(false)
          }
        }
      } catch { /* keep polling — transient network error */ }
    }, 3000)
  }

  const handleRunBackup = async () => {
    setActionError('')
    setRunning(true)
    try {
      const res = await apiFetch('/backups/run/', { method: 'POST' })
      if (res?.ok) {
        const job = await res.json()
        setJobs((prev) => [job, ...prev])
        pollJob(job.id)
      } else {
        setActionError(await getApiError(res))
        setRunning(false)
      }
    } catch {
      setActionError('Connection error — check your network')
      setRunning(false)
    }
  }

  const handleDownload = async (job) => {
    setActionError('')
    setActionId(job.id)
    try {
      const res = await apiFetch(`/backups/${job.id}/download/`)
      if (!res?.ok) { setActionError(await getApiError(res)); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = job.file_name || `backup-${job.id}.dump`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setActionError('Connection error — check your network')
    } finally {
      setActionId(null)
    }
  }

  const handleDelete = async (job) => {
    if (!window.confirm(`Delete backup "${job.file_name || job.id}"? This cannot be undone.`)) return
    setActionError('')
    setActionId(job.id)
    try {
      const res = await apiFetch(`/backups/${job.id}/delete/`, { method: 'DELETE' })
      if (res?.ok || res?.status === 204) setJobs((prev) => prev.filter((j) => j.id !== job.id))
      else setActionError(await getApiError(res))
    } catch {
      setActionError('Connection error — check your network')
    } finally {
      setActionId(null)
    }
  }

  if (!isSuperadmin) {
    return (
      <div className="min-h-screen bg-slate-100">
        <Sidebar />
        <div className="md:ml-16">
          <Topbar />
          <main className="p-6">
            <p className="text-sm text-gray-600">You don't have access to this page.</p>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">System / Backup &amp; Restore</p>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4 text-sm text-amber-800">
            <strong>Recipe data is protected by a separate encryption key that is not stored in this backup.</strong>{' '}
            Keep a secure copy of that key — without it, encrypted recipe data cannot be recovered from a restored backup.
            Contact a system administrator for the full restore procedure.
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 mb-4 text-sm text-gray-600 flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="font-semibold text-gray-800">Scheduled backups:</span>
            <span>Weekly — every Sunday at 2:00 AM</span>
            <span>Next run: <strong className="text-gray-800">{getNextScheduledRun().toLocaleString()}</strong></span>
            <span className="text-xs text-gray-400">If the system is off at the scheduled time, it runs automatically as soon as it's back on.</span>
          </div>

          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Database Backups</h2>
                <p className="text-xs text-gray-400 mt-0.5">Manual and scheduled backups, stored locally on disk.</p>
              </div>
              <button
                onClick={handleRunBackup}
                disabled={running}
                className="rounded-md bg-orange-500 px-4 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {running ? 'Backing up…' : 'Back Up Now'}
              </button>
            </div>

            {actionError && (
              <div className="mx-6 mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{actionError}</div>
            )}
            {error && (
              <div className="mx-6 mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-500 border-b border-gray-100">
                    <th className="px-6 py-3">Started</th>
                    <th className="px-6 py-3">Trigger</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">File</th>
                    <th className="px-6 py-3">Size</th>
                    <th className="px-6 py-3">By</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="px-6 py-6 text-center text-xs text-gray-400">Loading…</td></tr>
                  ) : jobs.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-6 text-center text-xs text-gray-400">No backups yet.</td></tr>
                  ) : jobs.map((job) => (
                    <tr key={job.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-6 py-3 text-xs text-gray-700">{formatDate(job.started_at)}</td>
                      <td className="px-6 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TRIGGER_BADGES[job.trigger] || 'bg-slate-100 text-slate-600'}`}>
                          {job.trigger === 'manual' ? 'Manual' : 'Scheduled'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGES[job.status] || 'bg-slate-100 text-slate-600'}`}>
                          {job.status === 'running' ? 'Running' : job.status === 'success' ? 'Success' : 'Failed'}
                        </span>
                        {job.status === 'failed' && job.error_message && (
                          <p className="mt-1 max-w-xs truncate text-[10px] text-red-500" title={job.error_message}>{job.error_message}</p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-600">{job.file_name || '—'}</td>
                      <td className="px-6 py-3 text-xs text-gray-600">{formatBytes(job.file_size)}</td>
                      <td className="px-6 py-3 text-xs text-gray-600">{job.triggered_by || '—'}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownload(job)}
                            disabled={job.status !== 'success' || actionId === job.id}
                            className="rounded-md bg-slate-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-slate-700 disabled:opacity-50"
                          >
                            {actionId === job.id ? '…' : 'Download'}
                          </button>
                          <button
                            onClick={() => handleDelete(job)}
                            disabled={actionId === job.id}
                            className="rounded-md bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default BackupRestorePage
