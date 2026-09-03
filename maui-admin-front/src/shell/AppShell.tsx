/**
 * @spec §4, §8, §10, §11, CU-1, CU-15, TASK-019
 * Shell de la aplicación con EnableSoundGate y NewOrderAlert.
 * Header (no-print) + Sidebar fija + Outlet de contenido.
 */
import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useSession } from '@/auth/useSession'
import { merchantRepo } from '@/services'
import { Sidebar } from './Sidebar'
import { EnableSoundGate } from './EnableSoundGate'
import { StoreOpenBanner } from './StoreOpenBanner'
import { NewOrderAlert } from '@/features/orders/NewOrderAlert'

export function AppShell() {
  const { session, logout } = useSession()
  const [merchantName, setMerchantName] = useState('MAUI Admin')

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

  function handleLogout() {
    logout().catch(() => {/* audit puede fallar silenciosamente en demo */})
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar — fija en desktop, oculta en impresión */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-white border-r border-gray-200 min-h-screen no-print print:hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-900 truncate">{merchantName}</p>
          <p className="text-xs text-gray-400 mt-0.5">MAUI Admin</p>
        </div>
        {session && <Sidebar role={session.user.role} />}
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header — oculto en impresión */}
        <header className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between gap-4 no-print print:hidden">
          <h1 className="text-sm font-semibold text-gray-700 truncate md:hidden">
            {merchantName}
          </h1>
          <span className="hidden md:block" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 truncate max-w-[180px]">
              {session?.user.email}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" aria-hidden />
              Salir
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
