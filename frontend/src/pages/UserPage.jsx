import { useState, useEffect, useRef } from 'react';
import Topbar from '../components/Topbar';
import Sidebar from '../components/Sidebar';
import { apiFetch } from '../utils/api';

const PAGE_SIZE = 10

const ROLE_DESCRIPTIONS = {
  superadmin: 'Full access to everything including user management',
  admin:      'Full operations access — no user management',
  production: 'Raw materials, base product stock & production module',
  assembly:   'Assembly orders, packaging & finished product stock',
  sales:      'Sales dashboard, customers & bills — view finished stock',
  warehouse:  'All three stock modules + inventory tools',
  manager:    'View-only access across all operational modules',
}

const emptyForm = {
  firstname: '', lastname: '', username: '', email: '',
  phone: '', password: '', user_role_id: '', status: 'active'
}

const UserPage = () => {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [roleFilter, setRoleFilter]   = useState('')

  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => { 
    const user = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}')
    setCurrentUser(user)
    fetchUsers()
    fetchRoles() 
  }, [])

  const filtered = users.filter(u => {
    const matchesSearch =
      u.fullname?.toLowerCase().includes(search.toLowerCase()) ||
      u.username?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
    const matchesRole = !roleFilter || u.user_role?.role === roleFilter
    return matchesSearch && matchesRole
  })
  
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/users/');
      if (res && res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch { 
      setError('Failed to load users'); 
    } finally { 
      setLoading(false); 
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await apiFetch('/roles/');
      if (res && res.ok) {
        const data = await res.json();
        setRoles(data);
      }
    } catch { 
      console.error('Failed to load roles'); 
    }
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openAddUser = () => {
    setEditUser(null)
    setForm(emptyForm)
    setError('')
    setModalOpen(true)
  }

  const openEdit = (user) => {
    setEditUser(user)
    const nameParts = user.fullname?.split(' ') || ['', '']
    setForm({
      firstname: nameParts[0] || '',
      lastname: nameParts.slice(1).join(' ') || '',
      email: user.email || '',
      username: user.username || '',
      phone: user.phone || '',
      password: '',
      user_role_id: user.user_role?.id || '',
      status: user.status || 'active',
    })
    setError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditUser(null)
    setForm(emptyForm)
    setError('')
  }

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    
    // Validation
    if (!form.firstname.trim() || !form.lastname.trim()) {
      setError('First name and last name are required')
      setSubmitting(false)
      return
    }
    if (!form.username.trim()) {
      setError('Username is required')
      setSubmitting(false)
      return
    }
    if (!form.email.trim()) {
      setError('Email is required')
      setSubmitting(false)
      return
    }
    if (!form.user_role_id) {
      setError('User role is required')
      setSubmitting(false)
      return
    }
    if (!editUser && !form.password.trim()) {
      setError('Password is required for new users')
      setSubmitting(false)
      return
    }

    const payload = {
      fullname: `${form.firstname.trim()} ${form.lastname.trim()}`,
      username: form.username.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      user_role_id: parseInt(form.user_role_id),
      status: form.status,
    }
    
    if (form.password.trim()) {
      payload.password = form.password.trim()
    }

    const endpoint = editUser ? `/users/${editUser.id}/` : '/users/';
    const method = editUser ? 'PUT' : 'POST';
    
    try {
      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      if (!res) return; // Redirect handled by apiFetch

      const data = await res.json();
      if (res.ok) { 
        fetchUsers();
        closeModal(); 
      }
      else {
        setError(data.error || data.username?.[0] || data.email?.[0] || JSON.stringify(data));
      }
    } catch { 
      setError('Network error'); 
    } finally { 
      setSubmitting(false); 
    }
  }

  const isSuperAdmin = currentUser?.role === 'superadmin'

  const handleToggle2fa = async (user) => {
    const action = user.is_2fa_enabled ? 'Disable' : 'Enable'
    if (!window.confirm(`${action} 2FA for ${user.username}?`)) return
    const res = await apiFetch(`/users/${user.id}/toggle-2fa/`, { method: 'POST' })
    if (res?.ok) fetchUsers()
  }

  const exportCSV = () => {
    const headers = ['No', 'Username', 'Full Name', 'Email', 'User Role', 'Status', 'Last Login']
    const rows = filtered.map((u, i) => [
      i + 1,
      u.username,
      u.fullname,
      u.email,
      u.user_role?.role || '',
      u.status,
      u.last_login_date ? new Date(u.last_login_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'users.csv'; a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }

  const exportExcel = () => {
    const headers = ['No', 'Username', 'Full Name', 'Email', 'User Role', 'Status', 'Last Login']
    const rows = filtered.map((u, i) => [
      i + 1, u.username, u.fullname, u.email,
      u.user_role?.role || '', u.status,
      u.last_login_date ? new Date(u.last_login_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''
    ])
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Users"><Table>
      ${[headers, ...rows].map(r => `<Row>${r.map(c => `<Cell><Data ss:Type="String">${c}</Data></Cell>`).join('')}</Row>`).join('')}
      </Table></Worksheet></Workbook>`
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'users.xls'; a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }

  const exportPDF = () => {
    const win = window.open('', '_blank')
    const rows = filtered.map((u, i) => `<tr>
      <td>${i + 1}</td><td>${u.username}</td><td>${u.fullname}</td>
      <td>${u.email}</td><td>${u.user_role?.role || '—'}</td>
      <td>${u.status}</td>
      <td>${u.last_login_date ? new Date(u.last_login_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</td>
    </tr>`).join('')
    win.document.write(`<html><head><title>Users</title><style>
      body { font-family: sans-serif; padding: 24px; }
      h2 { font-size: 16px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th { background: #1e293b; color: white; padding: 8px 10px; text-align: left; }
      td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
      tr:nth-child(even) td { background: #f8fafc; }
    </style></head><body>
      <h2>Users — ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</h2>
      <table><thead><tr>
        <th>No</th><th>Username</th><th>Full Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </body></html>`)
    win.document.close()
    win.print()
    setExportOpen(false)
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="ml-16">
        <Topbar />
        <main className="p-6">

          {/* Breadcrumb */}
          <p className="text-xs text-gray-400 mb-3">Users</p>

          {/* Card */}
          <div className="rounded-xl bg-white shadow-sm">

            {/* Table Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Users</h2>
              <div className="flex items-center gap-3">
                {isSuperAdmin && (
                  <button 
                    onClick={openAddUser}
                    className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add User
                  </button>
                )}
                <div className="relative" ref={exportRef}>
                  <button
                    onClick={() => setExportOpen(o => !o)}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export
                    <svg className={`w-3 h-3 transition-transform ${exportOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {exportOpen && (
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-xl bg-white border border-gray-200 shadow-lg overflow-hidden">
                      <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Download as</p>

                      <button onClick={exportCSV}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-green-50">
                          <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </span>
                        <div className="text-left">
                          <p className="font-medium text-gray-800">CSV</p>
                          <p className="text-[10px] text-gray-400">Spreadsheet compatible</p>
                        </div>
                      </button>

                      <button onClick={exportExcel}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50">
                          <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M14 3v18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
                          </svg>
                        </span>
                        <div className="text-left">
                          <p className="font-medium text-gray-800">Excel</p>
                          <p className="text-[10px] text-gray-400">XLS workbook</p>
                        </div>
                      </button>

                      <button onClick={exportPDF}
                        className="flex w-full items-center gap-2.5 px-3 py-2 pb-2.5 text-xs text-gray-700 hover:bg-gray-50">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-red-50">
                          <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </span>
                        <div className="text-left">
                          <p className="font-medium text-gray-800">PDF</p>
                          <p className="text-[10px] text-gray-400">Print-ready document</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                    placeholder="Search user..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-44"
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={e => { setRoleFilter(e.target.value); setPage(1) }}
                  className={`rounded-lg border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 ${
                    roleFilter ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-300 text-gray-600'
                  }`}
                >
                  <option value="">All Roles</option>
                  {roles.map(r => <option key={r.id} value={r.role}>{r.role}</option>)}
                </select>
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-primary text-white text-xs uppercase">
                  <tr>
                    <th className="px-6 py-3 w-10">No</th>
                    <th className="px-6 py-3">Username</th>
                    <th className="px-6 py-3">Full Name</th>
                    <th className="px-6 py-3">Email</th>
                    <th className="px-6 py-3">User Role</th>
                    <th className="px-6 py-3">Phone</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Last Login</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-gray-400">No users found</td>
                    </tr>
                  ) : paginated.map((user, idx) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="px-6 py-3 text-gray-700">{user.username}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">{user.fullname}</td>
                      <td className="px-6 py-3 text-gray-500">{user.email}</td>
                      <td className="px-6 py-3">
                        {user.user_role?.role ? (
                          <div>
                            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                              user.user_role.role === 'superadmin' ? 'bg-purple-100 text-purple-700' :
                              user.user_role.role === 'admin'      ? 'bg-blue-100 text-blue-700' :
                              user.user_role.role === 'sales'      ? 'bg-orange-100 text-orange-700' :
                              user.user_role.role === 'warehouse'  ? 'bg-cyan-100 text-cyan-700' :
                              user.user_role.role === 'manager'    ? 'bg-indigo-100 text-indigo-700' :
                              user.user_role.role === 'production' ? 'bg-yellow-100 text-yellow-700' :
                              user.user_role.role === 'assembly'   ? 'bg-green-100 text-green-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>{user.user_role.role}</span>
                            {ROLE_DESCRIPTIONS[user.user_role.role] && (
                              <p className="text-[10px] text-gray-400 mt-0.5 max-w-[180px] truncate" title={ROLE_DESCRIPTIONS[user.user_role.role]}>
                                {ROLE_DESCRIPTIONS[user.user_role.role]}
                              </p>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-6 py-3 text-gray-500">{user.phone || '—'}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-600'
                        }`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-400 text-xs">
                        {user.last_login_date
                          ? new Date(user.last_login_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => openEdit(user)}
                            className="rounded-md bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-600"
                          >
                            Edit
                          </button>
                          {isSuperAdmin && (
                            <button
                              onClick={() => handleToggle2fa(user)}
                              className={`rounded-md px-3 py-1 text-xs font-medium text-white ${
                                user.is_2fa_enabled
                                  ? 'bg-amber-500 hover:bg-amber-600'
                                  : 'bg-blue-500 hover:bg-blue-600'
                              }`}
                            >
                              {user.is_2fa_enabled ? 'Disable 2FA' : 'Enable 2FA'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
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
                    className={`w-7 h-7 rounded text-xs font-medium ${
                      page === p
                        ? 'bg-orange-500 text-white'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
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
        </main>
      </div>

      {/* Add/Edit User Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                {editUser ? 'Edit User' : 'Add New User'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
              )}

              {/* First Name / Last Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
                  <input 
                    name="firstname" 
                    value={form.firstname} 
                    onChange={handleChange}
                    placeholder="Firts Name"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
                  <input 
                    name="lastname" 
                    value={form.lastname} 
                    onChange={handleChange}
                    placeholder="Last Name"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" 
                  />
                </div>
              </div>

              {/* Email / Username */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                  <input 
                    name="email" 
                    type="email"
                    value={form.email} 
                    onChange={handleChange}
                    placeholder="email@example.com"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Username *</label>
                  <input 
                    name="username" 
                    value={form.username} 
                    onChange={handleChange}
                    placeholder="myusername"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" 
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone No.</label>
                <input 
                  name="phone" 
                  value={form.phone} 
                  onChange={handleChange}
                  placeholder="9812345678"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" 
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Password {!editUser && <span className="text-red-500">*</span>} {editUser && <span className="text-gray-400">(leave blank to keep current)</span>}
                </label>
                <input 
                  name="password" 
                  type="password" 
                  value={form.password} 
                  onChange={handleChange}
                  placeholder={editUser ? "Leave blank to keep current" : "Enter password"}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" 
                />
              </div>

              {/* Role / Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">User Role *</label>
                  <select
                    name="user_role_id"
                    value={form.user_role_id}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                    <option value="">Select role</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.role}</option>)}
                  </select>
                  {form.user_role_id && (() => {
                    const selectedRole = roles.find(r => String(r.id) === String(form.user_role_id))
                    const desc = selectedRole ? ROLE_DESCRIPTIONS[selectedRole.role] : null
                    return desc ? (
                      <p className="mt-1.5 text-[11px] text-gray-500 bg-gray-50 rounded-md px-2 py-1.5 border border-gray-100">
                        {desc}
                      </p>
                    ) : null
                  })()}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">User Status</label>
                  <select 
                    name="status" 
                    value={form.status} 
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                    <option value="active">Active</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button 
                onClick={closeModal}
                className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button 
                onClick={handleSubmit} 
                disabled={submitting}
                className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {submitting ? 'Saving...' : editUser ? 'Update User' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


export default UserPage
