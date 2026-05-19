import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const LoginPage = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  })
  const [otpCode, setOtpCode] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('LOGIN') // LOGIN, 2FA_VERIFY, 2FA_SETUP
  const [tempToken, setTempToken] = useState('')
  const [setupData, setSetupData] = useState(null)
  
  const navigate = useNavigate()

  // Check if already logged in on mount
  useEffect(() => {
    const token = localStorage.getItem('access') || sessionStorage.getItem('access')
    if (token) {
      navigate('/dashboard')
    }
  }, [navigate])

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    if (type === 'checkbox') {
      setRememberMe(checked)
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }))
    }
    if (error) setError('')
  }

  const handleOtpChange = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, '')
    if (val.length <= 6) {
      setOtpCode(val)
    }
    if (error) setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('http://localhost:8000/api/login/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (response.ok) {
        setTempToken(data.temp_token)
        if (data.is_2fa_enabled) {
          setStep('2FA_VERIFY')
        } else {
          handleStartSetup(data.temp_token)
        }
      } else {
        setError(data.error || 'Login failed')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleStartSetup = async (token) => {
    try {
      const response = await fetch('http://localhost:8000/api/setup-2fa/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ temp_token: token }),
      })

      const data = await response.json()
      if (response.ok) {
        setSetupData(data)
        setStep('2FA_SETUP')
      } else {
        setError(data.error || 'Failed to start 2FA setup')
        setStep('LOGIN')
      }
    } catch (err) {
      setError('Network error during 2FA setup.')
      setStep('LOGIN')
    }
  }

  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const endpoint = step === '2FA_SETUP' 
      ? 'http://localhost:8000/api/verify-2fa-setup/' 
      : 'http://localhost:8000/api/verify-2fa-login/'

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          temp_token: tempToken,
          code: otpCode
        }),
      })

      const data = await response.json()

      if (response.ok) {
        loginSuccess(data)
      } else {
        setError(data.error || 'Verification failed')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const loginSuccess = (data) => {
    const storage = rememberMe ? localStorage : sessionStorage
    
    storage.setItem('access', data.access)
    storage.setItem('refresh', data.refresh)
    storage.setItem('user', JSON.stringify(data.user))
    storage.setItem('isAuthenticated', 'true')
    
    navigate('/dashboard')
  }

  const renderLoginForm = () => (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="username" className="block text-sm font-medium text-secondary-600">
          Username or Email
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          placeholder="Enter your username or email"
          value={formData.username}
          onChange={handleInputChange}
          required
          className="mt-1 w-full text-sm px-4 py-2 rounded-lg border border-gray-300 shadow-sm focus:border-primary-600 focus:ring-2 focus:ring-primary-300 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-secondary-600">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={formData.password}
          onChange={handleInputChange}
          required
          className="mt-1 w-full text-sm px-4 py-2 rounded-lg border border-gray-300 shadow-sm focus:border-primary-600 focus:ring-2 focus:ring-primary-300 focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="inline-flex items-center">
          <input 
            type="checkbox" 
            name="rememberMe"
            checked={rememberMe}
            onChange={handleInputChange}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" 
          />
          <span className="ml-2 text-sm text-gray-600">Remember me</span>
        </label>
        <a href="#" className="text-sm font-medium text-primary-600 hover:text-primary-700">
          Forgot password?
        </a>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-primary px-4 py-3 text-white font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )

  const renderOtpForm = () => (
    <form className="space-y-5" onSubmit={handleVerifyOtp}>
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-gray-900">Two-Factor Authentication</h2>
        <p className="text-sm text-gray-500 mt-2">
          {step === '2FA_SETUP' 
            ? 'Scan the QR code with your authenticator app and enter the code below.' 
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>
      </div>

      {step === '2FA_SETUP' && setupData && (
        <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300 mb-4">
          <img 
            src={`data:image/png;base64,${setupData.qr_code}`} 
            alt="2FA QR Code" 
            className="w-48 h-48 mb-4 shadow-md"
          />
          <div className="text-xs text-gray-400 font-mono break-all text-center">
            Secret Key: {setupData.secret}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="otpCode" className="block text-sm font-medium text-secondary-600">
          Authentication Code
        </label>
        <input
          id="otpCode"
          name="otpCode"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength="6"
          placeholder="Enter 6-digit code"
          value={otpCode}
          onChange={handleOtpChange}
          required
          autoFocus
          className="mt-1 w-full text-center text-2xl tracking-widest px-4 py-3 rounded-lg border border-gray-300 shadow-sm focus:border-primary-600 focus:ring-2 focus:ring-primary-300 focus:outline-none font-mono"
        />
      </div>

      <button
        type="submit"
        disabled={loading || otpCode.length !== 6}
        className="w-full rounded-lg bg-primary px-4 py-3 text-white font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Verifying...' : 'Verify Code'}
      </button>

      <button
        type="button"
        onClick={() => setStep('LOGIN')}
        className="w-full text-sm text-gray-500 hover:text-gray-700 font-medium"
      >
        Back to Login
      </button>
    </form>
  )

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
        {/* Left side - Background only */}
        <div className="hidden md:flex items-center justify-center bg-cover bg-center" style={{ backgroundImage: "url('/images/login-background.jpg')"}}>
          
        </div>

        {/* Right side - Form */}
        <div className="flex items-center justify-center p-10 bg-white">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center">
              <img
                className="mx-auto h-20 w-auto"
                src="/images/nepal-logo.svg"
                alt="Logo"
              />
              <h1 className="mt-4 text-4xl font-bold text-gray-900">
                {step === 'LOGIN' ? 'Great to see you again' : 'Secure Your Account'}
              </h1>
              <p className="mt-1 text-base text-gray-500">
                {step === 'LOGIN' ? 'Sign in to continue to NLOL WMS' : 'Enter your 2FA security code'}
              </p>
            </div>

            {step === 'LOGIN' ? renderLoginForm() : renderOtpForm()}

            <p className="mt-6 text-center text-sm text-gray-500">
              © {new Date().getFullYear()} Nepal Lube Oil Limited
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
