import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Override fetch to support calling a separate backend URL in production
const API_URL = import.meta.env.VITE_API_URL || '';
if (API_URL) {
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      input = `${API_URL}${input}`;
    } else if (input && typeof input === 'object' && typeof input.url === 'string' && input.url.startsWith('/api/')) {
      const newUrl = `${API_URL}${input.url}`;
      input = new Request(newUrl, input);
    }
    return originalFetch(input, init);
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
