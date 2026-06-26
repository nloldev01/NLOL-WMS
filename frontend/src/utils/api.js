export const BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Parse a DRF error response body into a human-readable string.
 * Handles: {"detail":...}, {"error":...}, {"field":["err"]}, {"non_field_errors":[...]}, etc.
 */
export const parseError = (data) => {
  if (!data) return 'An unexpected error occurred.'
  if (typeof data === 'string') return data
  if (data.detail) {
    if (data.detail === 'Not found.') return 'This item was not found — it may have been deleted.'
    if (data.detail === 'Authentication credentials were not provided.') return 'Please log in to continue.'
    if (data.detail === 'You do not have permission to perform this action.') return 'You don\'t have permission to do this.'
    return String(data.detail)
  }
  if (data.error)  return String(data.error)
  if (data.non_field_errors) return [].concat(data.non_field_errors).join(' ')
  const lines = []
  for (const [key, val] of Object.entries(data)) {
    const msgs = [].concat(val)
    lines.push(msgs.map(m => (typeof m === 'object' ? JSON.stringify(m) : String(m))).join(', '))
  }
  return lines.length ? lines.join(' ') : 'Something went wrong.'
}

/**
 * Read an error Response and return a human-readable message.
 */
export const getApiError = async (res) => {
  if (!res) return 'No response from server.'
  try {
    const data = await res.json()
    return parseError(data)
  } catch {
    return `Server error (${res?.status ?? 'unknown'})`
  }
}

const REDIRECT_ERROR_KEY = 'api_redirect_error'

/**
 * Stash a human-readable error message in sessionStorage right before a redirect,
 * so the destination page can show it. Read-once with a short TTL so stale
 * entries never resurface on a later, unrelated navigation.
 */
const stashRedirectError = (message) => {
  try { sessionStorage.setItem(REDIRECT_ERROR_KEY, JSON.stringify({ message, ts: Date.now() })) } catch {}
}

export const consumeRedirectError = () => {
  try {
    const raw = sessionStorage.getItem(REDIRECT_ERROR_KEY)
    sessionStorage.removeItem(REDIRECT_ERROR_KEY)
    if (!raw) return null
    const { message, ts } = JSON.parse(raw)
    return Date.now() - ts < 10000 ? message : null
  } catch { return null }
}

/**
 * A wrapper around fetch that adds authorization header and handles common errors.
 * @param {string} endpoint - The API endpoint (e.g. '/users/')
 * @param {object} options - Fetch options (method, body, headers, etc.)
 */
const _ACCESS_ORDER = { none: 0, view: 1, full: 2 }

/**
 * Check if the current user has at least `minAccess` on a module.
 * Reads from localStorage or sessionStorage.
 */
export const hasAccess = (moduleKey, minAccess = 'view') => {
  // Superadmin always has full access to everything
  try {
    const user = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}')
    if (user?.role === 'superadmin') return true
  } catch {}

  const raw = localStorage.getItem('user_permissions') || sessionStorage.getItem('user_permissions') || '{}'
  try {
    const perms = JSON.parse(raw)
    return (_ACCESS_ORDER[perms[moduleKey]] ?? 0) >= (_ACCESS_ORDER[minAccess] ?? 1)
  } catch { return false }
}

export const getUserRole = () => {
  const raw = localStorage.getItem('user') || sessionStorage.getItem('user') || '{}'
  try { return JSON.parse(raw)?.role || null } catch { return null }
}

export const apiFetch = async (endpoint, options = {}) => {
  const token = localStorage.getItem('access') || sessionStorage.getItem('access');

  // Don't set Content-Type for FormData — the browser sets it automatically
  // with the correct multipart boundary. Setting it manually breaks the request.
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(!isFormData && { 'Content-Type': 'application/json' }),
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      const message = await getApiError(response.clone());
      console.warn('Unauthorized request. Redirecting to login...', message);
      stashRedirectError(message);
      ['access','refresh','user','isAuthenticated','user_permissions'].forEach(k => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });
      window.location.href = '/login';
      return null;
    }

    if (response.status >= 500) {
      const message = await getApiError(response.clone());
      console.error('Server error detected. Redirecting to 500 error page...', message);
      stashRedirectError(message);
      window.location.href = '/500';
      return response;
    }

    return response;
  } catch (error) {
    console.error('Network error or server is down:', error);
    stashRedirectError('Could not reach the server. Please check your connection and try again.');
    window.location.href = '/500';
    throw error;
  }
};