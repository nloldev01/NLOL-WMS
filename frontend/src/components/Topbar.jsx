import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellIcon } from '@heroicons/react/24/outline'
import { apiFetch } from '../utils/api'

const Topbar = () => {
  const [profileOpen, setProfileOpen] = useState(false)
  const navigate = useNavigate()

  // Get user info from either storage
  const user = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}')
  const name = user.fullname || 'User'
  const role = user.role || 'User'

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  const handleLogout = async () => {
    const refresh = localStorage.getItem('refresh') || sessionStorage.getItem('refresh')

    try {
      if (refresh) {
        await apiFetch('/logout/', {
          method: 'POST',
          body: JSON.stringify({ refresh }),
        })
      }
    } catch (err) {
      console.error('Logout error:', err)
    }

    // Clear tokens and user data from BOTH storages
    localStorage.removeItem('access')
    localStorage.removeItem('refresh')
    localStorage.removeItem('user')
    localStorage.removeItem('isAuthenticated')

    sessionStorage.removeItem('access')
    sessionStorage.removeItem('refresh')
    sessionStorage.removeItem('user')
    sessionStorage.removeItem('isAuthenticated')

    navigate('/login')
  }

  return (
    <header className="relative flex items-center justify-between bg-white border-b border-gray-200 px-6 h-14 shadow-sm">
      <div className="text-sm text-gray-700">{today}</div>
      <div className="flex items-center gap-4">
        <button className="p-2 rounded-full hover:bg-gray-100 transition" aria-label="Notifications">
          <BellIcon className="w-5 h-5 text-gray-700" />
        </button>

        <div className="relative">
          <button
            onClick={() => setProfileOpen((open) => !open)}
            className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-700 hover:bg-gray-300 transition"
            aria-label="Open user menu"
          >
            {name.charAt(0)}
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white p-4 shadow-lg ring-1 ring-black ring-opacity-5 z-50">
              <div className="space-y-1 text-center">
                <p className="text-lg font-semibold text-gray-900">{name}</p>
                <p className="text-sm text-gray-500">{role}</p>
              </div>
              <div className="mt-3 space-y-2">
                <button 
                  onClick={() => {
                    setProfileOpen(false)
                    navigate('/change-password')
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Change Password
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full rounded-md bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
                >
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default Topbar