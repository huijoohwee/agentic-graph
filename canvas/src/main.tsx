import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { installPwaRuntime } from '@/lib/pwa/runtime'
import { installKnowgrphWebMcpRuntime } from '@/features/agent-ready/webMcpRuntime'
import { installHtmlVideoBrowserRuntimeAdapters } from '@/features/html-video-renderer/htmlVideoBrowserRuntime'

installKnowgrphWebMcpRuntime()
installHtmlVideoBrowserRuntimeAdapters()

if (
  import.meta.env.VITE_KNOWGRPH_FLIGHT_SIM_BROWSER_PROOF === '1'
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search)
    .get('kgFlightSimBrowserProof') === '1'
) {
  void import('@/features/testing/flightSimBrowserProofBridge')
    .then(module => module.installFlightSimBrowserProofBridge())
    .catch(error => {
      console.error('[knowgrph] Flight browser proof bridge unavailable', error)
    })
}

if (import.meta.env.PROD) {
  installPwaRuntime()
} else if (typeof window !== 'undefined') {
  // Dev safeguard: clear stale SW/cache state that can serve outdated Vite dep chunks.
  const host = String(window.location.hostname || '').toLowerCase()
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
  if (isLocalhost) {
    void (async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map(reg => reg.unregister()))
        }
      } catch {
        void 0
      }
      try {
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map(k => caches.delete(k)))
        }
      } catch {
        void 0
      }
    })()
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
