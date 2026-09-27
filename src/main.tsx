import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Production-only: in dev, the service worker's own caching would fight
// Vite's unbundled module serving and HMR (edits could appear to "not
// take" because a stale source file is served from cache).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability is a progressive enhancement — a failed registration
      // (unsupported browser, blocked storage, etc.) shouldn't block the app.
    })
  })
}
