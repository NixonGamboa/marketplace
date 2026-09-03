/**
 * @spec §3, §7 — Árbol de rutas del panel admin.
 * Proveedor de contexto: ToastProvider > AuthProvider > Routes.
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from '@/ui/Toast'
import { AuthProvider } from '@/auth/AuthContext'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppShell } from '@/shell/AppShell'
import { LoginPage } from '@/features/login/LoginPage'
import { EmptyState } from '@/ui/EmptyState'

import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { OrdersListPage } from '@/features/orders/OrdersListPage'
import { OrderDetailPage } from '@/features/orders/OrderDetailPage'
import { HistoricoPage } from '@/features/historico/HistoricoPage'
import { CatalogoPage } from '@/features/catalogo/CatalogoPage'
import { CategoriasPage } from '@/features/categorias/CategoriasPage'
import { TiendaPage } from '@/features/tienda/TiendaPage'
import { ConfigPage } from '@/features/configuracion/ConfigPage'
import { AuditPage } from '@/features/auditoria/AuditPage'

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <EmptyState
        title="Página no encontrada"
        description="La ruta que buscas no existe."
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

// Vite inyecta BASE_URL desde `base` del vite.config. En dev standalone es '/';
// bajo el origin unificado del deploy (Paso 4/5) es '/admin/'.
const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export default function App() {
  return (
    <BrowserRouter basename={ROUTER_BASENAME}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/pedidos" element={<OrdersListPage />} />
              <Route path="/pedidos/:orderId" element={<OrderDetailPage />} />
              <Route path="/historico" element={<HistoricoPage />} />
              <Route
                path="/catalogo"
                element={
                  <RequireAuth role="owner">
                    <CatalogoPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/categorias"
                element={
                  <RequireAuth role="owner">
                    <CategoriasPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/tienda"
                element={
                  <RequireAuth role="owner">
                    <TiendaPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/configuracion"
                element={
                  <RequireAuth role="owner">
                    <ConfigPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/auditoria"
                element={
                  <RequireAuth role="owner">
                    <AuditPage />
                  </RequireAuth>
                }
              />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
