const BASE_URL = 'http://localhost:8000/api';

/**
 * A wrapper around fetch that adds authorization header and handles common errors.
 * @param {string} endpoint - The API endpoint (e.g. '/users/')
 * @param {object} options - Fetch options (method, body, headers, etc.)
 */
export const apiFetch = async (endpoint, options = {}) => {
  const token = localStorage.getItem('access') || sessionStorage.getItem('access');
  
  const headers = {
    'Content-Type': 'application/json',
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
      // Unauthorized - token might be expired or invalid
      console.warn('Unauthorized request. Redirecting to login...');
      
      // Clear both storages
      localStorage.removeItem('access');
      localStorage.removeItem('refresh');
      localStorage.removeItem('user');
      localStorage.removeItem('isAuthenticated');
      
      sessionStorage.removeItem('access');
      sessionStorage.removeItem('refresh');
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('isAuthenticated');

      window.location.href = '/login';
      return null;
    }

    if (response.status === 403) {
      // Forbidden - user doesn't have access to this resource
      console.warn('Forbidden request. Redirecting to 403 error page...');
      window.location.href = '/403';
      return null;
    }

    if (response.status >= 500) {
      // Server Error
      console.error('Server error detected. Redirecting to 500 error page...');
      window.location.href = '/500';
      return null;
    }

    return response;
  } catch (error) {
    console.error('Network error or server is down:', error);
    // If server is totally down, also show 500
    window.location.href = '/500';
    throw error;
  }
};
