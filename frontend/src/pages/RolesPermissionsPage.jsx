import { useState, useEffect } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch, getApiError } from '../utils/api'

const ACCESS_LEVELS = [
  { value: 'none', label: 'No Access', color: 'bg-slate-100 text-slate-500' },
  { value: 'view', label: 'View',      color: 'bg-blue-50 text-blue-600' },
  { value: 'full', label: 'Full',      color: 'bg-green-50 text-green-700' },
]

const RolesPermissionsPage = () => {
  const [modules, setModules]       = useState([])
  const [roles, setRoles]           = useState([])
  const [matrix, setMatrix]         = useState({})   // { roleId: { moduleKey: access } }
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const currentUser = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}')
  const canEdit = currentUser?.role === 'superadmin'

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      const [rolesRes, modulesRes, permsRes] = await Promise.all([
        apiFetch('/roles/'),
        apiFetch('/system-modules/'),
        apiFetch('/role-permissions/'),
      ])

      if (!rolesRes?.ok || !modulesRes?.ok || !permsRes?.ok) {
        setError('Failed to load roles or modules.')
        return
      }

      const rolesData   = await rolesRes.json()
      const modulesData = await modulesRes.json()
      const permsData   = await permsRes.json()

      const rolesList   = Array.isArray(rolesData)   ? rolesData   : (rolesData.results   ?? [])
      const modulesList = Array.isArray(modulesData) ? modulesData : (modulesData.results ?? [])
      const permsList   = Array.isArray(permsData)   ? permsData   : (permsData.results   ?? [])

      setRoles(rolesList)
      setModules(modulesList)

      // Build matrix: { roleId: { moduleKey: access } }
      const mat = {}
      for (const role of rolesList) {
        mat[role.id] = {}
        for (const mod of modulesList) mat[role.id][mod.key] = 'none'
      }
      for (const perm of permsList) {
        if (mat[perm.role] && perm.module_key) mat[perm.role][perm.module_key] = perm.access
      }
      setMatrix(mat)
    } catch (e) {
      setError('Network error loading data.')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (roleId, moduleKey, value) => {
    setMatrix(prev => ({
      ...prev,
      [roleId]: { ...prev[roleId], [moduleKey]: value },
    }))
    setSuccess('')
  }

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('')
    try {
      const res = await apiFetch('/role-permissions/bulk-update/', {
        method: 'POST',
        body: JSON.stringify({ matrix }),
      })
      if (res?.ok) {
        setSuccess('Permissions saved successfully.')
      } else {
        setError(await getApiError(res))
      }
    } catch {
      setError('Network error while saving.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!window.confirm('Reset all permissions to system defaults?')) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const res = await apiFetch('/role-permissions/reset-defaults/', { method: 'POST' })
      if (res?.ok) { await fetchData(); setSuccess('Reset to defaults.') }
      else setError(await getApiError(res))
    } catch {
      setError('Network error while resetting.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Users / Roles & Permissions</p>

          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Permission Matrix</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {canEdit ? 'Click any cell to change access. Changes apply after saving.' : 'View-only — only superadmin can edit permissions.'}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  {success && <span className="text-xs text-green-600 font-medium">{success}</span>}
                  {error   && <span className="text-xs text-red-500 font-medium">{error}</span>}
                  <button
                    onClick={handleReset}
                    disabled={saving}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Reset Defaults
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-lg bg-primary text-white px-4 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>


            {loading ? (
              <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
            ) : (
              <div className="overflow-x-auto p-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3 pr-6 w-48">Module</th>
                      {roles.map(role => (
                        <th key={role.id} className="text-center text-xs font-semibold text-gray-700 uppercase tracking-wide pb-3 px-3 min-w-[110px]">
                          {role.role}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {modules.map(mod => (
                      <tr key={mod.key} className="hover:bg-slate-50/50">
                        <td className="py-3 pr-6">
                          <p className="font-medium text-gray-800 text-xs">{mod.label}</p>
                          {mod.description && <p className="text-[10px] text-gray-400 mt-0.5">{mod.description}</p>}
                        </td>
                        {roles.map(role => {
                          const current = matrix[role.id]?.[mod.key] ?? 'none'
                          const cfg = ACCESS_LEVELS.find(a => a.value === current) || ACCESS_LEVELS[0]
                          return (
                            <td key={role.id} className="py-3 px-3 text-center">
                              <select
                                value={current}
                                disabled={!canEdit || role.role === 'superadmin'}
                                onChange={e => handleChange(role.id, mod.key, e.target.value)}
                                className={`rounded-md border-0 px-2 py-1 text-[11px] font-semibold outline-none ${
                                  canEdit && role.role !== 'superadmin' ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                                } ${cfg.color}`}
                              >
                                {ACCESS_LEVELS.map(a => (
                                  <option key={a.value} value={a.value}>{a.label}</option>
                                ))}
                              </select>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default RolesPermissionsPage
