import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

const API_URL = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getUploadUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('data:')) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  
  return `${BACKEND_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

// Add a request interceptor to add the auth token and active hotel ID to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    const activeHotelId = localStorage.getItem('activeHotelId');
    if (activeHotelId) {
      config.headers['x-hotel-id'] = activeHotelId;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to clear local storage and redirect on auth/stale resource errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 401 || (error.response.status === 404 && error.config.url && error.config.url.includes('/hotels/')))) {
      localStorage.clear();
      if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
