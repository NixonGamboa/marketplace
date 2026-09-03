/**
 * @spec §4, §8, §10, §11, CU-1, CU-15, TASK-019
 * Shell de la aplicación con EnableSoundGate y NewOrderAlert.
 * Header (no-print) + Sidebar fija + Outlet de contenido.
 */
import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import { useSession } from '@/auth/useSession'
import { merchantRepo } from '@/services'
import { Sidebar } from './Sidebar'
import { EnableSoundGate } from './EnableSoundGate'
import { StoreOpenBanner } from './StoreOpenBanner'
import { NewOrderAlert } from '@/features/orders/NewOrderAlert'

export function AppShell() {
  const { session, logout } = useSession()
  const [merchantName, setMerchantName] = useState('MAUI Admin')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    if (!session) return
    let cancelled = false
    merchantRepo
      .get(session.user.merchantId)
      .then((m) => {
        if (!cancelled) setMerchantName(m.name)
      })
      .catch(() => {
        // Fallback 'MAUI Admin' si el repo lanza error
      })
    return () => { cancelled = true }
  }, [session])

  // Auto-cierra el drawer al navegar
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // Cierra con tecla Escape + bloquea scroll del body mientras está abierto
  useEffect(() => {
    if (!drawerOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [drawerOpen])

  function handleLogout() {
    logout().catch(() => {/* audit puede fallar silenciosamente en demo */})
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Backdrop — solo móvil cuando el drawer está abierto */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden no-print print:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — fija en desktop, drawer overlay en móvil */}
      <aside
        id="admin-sidebar"
        className={[
          'flex w-60 shrink-0 flex-col bg-white border-r border-gray-200 min-h-screen no-print print:hidden',
          'fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:translate-x-0 md:transition-none',
        ].join(' ')}
        aria-label="Menú de navegación"
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{merchantName}</p>
            <p className="text-xs text-gray-400 mt-0.5">MAUI Admin</p>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="md:hidden -mr-1 p-1 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
        {session && <Sidebar role={session.user.role} />}
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header — oculto en impresión */}
        <header className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between gap-4 no-print print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="md:hidden -ml-1 p-1 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
              aria-label="Abrir menú"
              aria-expanded={drawerOpen}
              aria-controls="admin-sidebar"
            >
              <Menu className="w-5 h-5" aria-hidden />
            </button>
            <h1 className="text-sm font-semibold text-gray-700 truncate md:hidden">
              {merchantName}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 truncate max-w-[180px] hidden sm:inline">
              {session?.user.email}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" aria-hidden />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>

        {/* Banners de alerta — ocultos en impresión */}
        <div className="no-print print:hidden">
          <StoreOpenBanner />
          <EnableSoundGate />
          <NewOrderAlert />
        </div>

        {/* Page content */}
        <main className="flex-1 p-5 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
