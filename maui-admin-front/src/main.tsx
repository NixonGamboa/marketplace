import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { isDemoMode } from './services'
import { runAllSeeds } from './services/seed/runAllSeeds'

// Los datos del modo real los inicializa el servidor (seed T-16); el navegador nunca los siembra.
if (isDemoMode) runAllSeeds()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
