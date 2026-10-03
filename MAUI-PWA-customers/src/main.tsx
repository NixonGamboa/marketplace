import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { useUIStore } from './stores/uiStore'
import { queryClient } from './shared/queryClient'
import { setUpdateHandler } from './pwa/updateChannel'

/** Un PWA instalado puede pasar días abierto: se consulta si hay versión nueva cada hora (solo con red). */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

const updateServiceWorker = registerSW({
  onNeedRefresh() {
    useUIStore.getState().setUpdateAvailable(true)
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return
    setInterval(() => {
      if (navigator.onLine !== false) void registration.update().catch(() => undefined)
    }, UPDATE_CHECK_INTERVAL_MS)
  },
})
setUpdateHandler(() => updateServiceWorker(true))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
