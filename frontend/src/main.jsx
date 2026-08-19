import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'

// --- GLOBAL TIMEZONE LOCK: Force Asia/Kolkata (IST) ---
const originalToLocaleDateString = Date.prototype.toLocaleDateString;
Date.prototype.toLocaleDateString = function (locales, options) {
  const opts = { ...options, timeZone: 'Asia/Kolkata' };
  return originalToLocaleDateString.call(this, locales || 'en-IN', opts);
};

const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
Date.prototype.toLocaleTimeString = function (locales, options) {
  const opts = { ...options, timeZone: 'Asia/Kolkata' };
  return originalToLocaleTimeString.call(this, locales || 'en-IN', opts);
};

const originalToLocaleString = Date.prototype.toLocaleString;
Date.prototype.toLocaleString = function (locales, options) {
  if (this instanceof Date) {
    const opts = { ...options, timeZone: 'Asia/Kolkata' };
    return originalToLocaleString.call(this, locales || 'en-IN', opts);
  }
  return originalToLocaleString.call(this, locales, options);
};

// Force toISOString to return values matching Asia/Kolkata time (+5:30 offset)
Date.prototype.toISOString = function () {
  const offsetMs = 5.5 * 60 * 60 * 1000;
  const localTime = new Date(this.getTime() + offsetMs);
  
  const pad = (num) => String(num).padStart(2, '0');
  const padMs = (num) => String(num).padStart(3, '0');
  
  return `${localTime.getUTCFullYear()}-${pad(localTime.getUTCMonth() + 1)}-${pad(localTime.getUTCDate())}T${pad(localTime.getUTCHours())}:${pad(localTime.getUTCMinutes())}:${pad(localTime.getUTCSeconds())}.${padMs(localTime.getUTCMilliseconds())}Z`;
};
// ----------------------------------------------------

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
