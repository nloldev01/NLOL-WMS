import { Navigate } from 'react-router-dom'
import { hasAccess } from '../utils/api'

/**
 * Wraps a route so only users with the required module access can see it.
 * Redirects to /403 if access is denied.
 *
 * Usage:
 *   <Route path="/packaging/assembly" element={
 *     <ProtectedRoute module="assembly"><AssemblyOrdersPage /></ProtectedRoute>
 *   } />
 */
const ProtectedRoute = ({ children, module: moduleKey, minAccess = 'view' }) => {
  const token = localStorage.getItem('access') || sessionStorage.getItem('access')
  if (!token) return <Navigate to="/login" replace />

  // If permissions haven't been loaded yet (e.g. stale pre-RBAC session), force re-login
  const hasPerms = localStorage.getItem('user_permissions') || sessionStorage.getItem('user_permissions')
  if (!hasPerms) {
    // Clear stale token so LoginPage doesn't redirect back here
    localStorage.removeItem('access'); sessionStorage.removeItem('access')
    return <Navigate to="/login" replace />
  }

  if (moduleKey && !hasAccess(moduleKey, minAccess)) {
    return <Navigate to="/403" replace />
  }

  return children
}

export default ProtectedRoute
