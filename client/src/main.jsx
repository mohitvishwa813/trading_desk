import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Override fetch to inject Auth Headers and support calling a separate backend URL
const originalFetch = window.fetch;
window.fetch = function (input, init) {
  const API_URL = import.meta.env.VITE_API_URL || '';
  const token = localStorage.getItem('token');

  let updatedInit = init || {};
  if (token) {
    let headers = new Headers(updatedInit.headers || {});
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    updatedInit.headers = headers;
  }

  if (typeof input === 'string' && input.startsWith('/api/')) {
    if (API_URL) {
      input = `${API_URL}${input}`;
    }
  } else if (input && typeof input === 'object' && typeof input.url === 'string' && input.url.startsWith('/api/')) {
    if (API_URL) {
      const newUrl = `${API_URL}${input.url}`;
      input = new Request(newUrl, input);
    }
  }
  return originalFetch(input, updatedInit);
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
