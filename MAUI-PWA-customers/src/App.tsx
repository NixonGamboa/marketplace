import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Heart, Tag } from 'lucide-react'
import RootLayout from './shared/components/layout/RootLayout'
import NotFound from './shared/components/layout/NotFound'
import ComingSoonPage from './shared/components/layout/ComingSoonPage'
import { ErrorBoundary } from './shared/components/ErrorBoundary'
import { useThemeSync } from './shared/hooks/useThemeSync'
import { isDemoMode } from './config/mode'
import { RequireSession } from './features/auth/RequireSession'
import { SessionLifecycle } from './features/auth/SessionLifecycle'

const Home = lazy(() => import('./features/catalog/pages/Home'))
const CartPage = lazy(() => import('./features/cart/pages/CartPage'))
// Demo y real son pantallas distintas: el demo conserva su ingreso simulado y el real usa la sesión del servidor.
const DemoAuthPage = lazy(() => import('./features/auth/pages/AuthPage'))
const RealAuthPage = lazy(() => import('./features/auth/pages/RealAuthPage'))
const DemoOrdersPage = lazy(() => import('./features/orders/pages/OrdersPage'))
const RealOrdersPage = lazy(() => import('./features/orders/pages/RealOrdersPage'))
const AuthPage = isDemoMode() ? DemoAuthPage : RealAuthPage
const OrdersPage = isDemoMode() ? DemoOrdersPage : RealOrdersPage
const ProfilePage = lazy(() => import('./features/auth/pages/ProfilePage'))
const CatalogPage = lazy(() => import('./features/catalog/pages/CatalogPage'))
const CheckoutPage = lazy(() => import('./features/checkout/CheckoutPage'))
const OrderDetailPage = lazy(() => import('./features/orders/OrderDetailPage'))
const SearchPage = lazy(() => import('./features/catalog/pages/SearchPage'))
const CatalogLandingPage = lazy(() => import('./features/catalog/pages/CatalogLandingPage'))

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <span className="text-brand-muted text-sm">Cargando...</span>
  </div>
)

export default function App() {
  useThemeSync()
  return (
    <ErrorBoundary>
      <SessionLifecycle />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<RootLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/pedidos" element={<RequireSession><OrdersPage /></RequireSession>} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/perfil" element={<RequireSession><ProfilePage /></RequireSession>} />
            <Route path="/catalog" element={<CatalogLandingPage />} />
            <Route path="/catalog/:categoryId" element={<CatalogPage />} />
            <Route path="/checkout" element={<RequireSession><CheckoutPage /></RequireSession>} />
            <Route path="/pedidos/:orderId" element={<RequireSession><OrderDetailPage /></RequireSession>} />
            <Route path="/search" element={<SearchPage />} />
            <Route
              path="/ofertas"
              element={
                <ComingSoonPage
                  title="Ofertas"
                  description="Estamos preparando las mejores ofertas de Leche y Miel. Vuelve pronto."
                  icon={Tag}
                />
              }
            />
            <Route
              path="/favoritos"
              element={
                <ComingSoonPage
                  title="Favoritos"
                  description="Pronto vas a poder guardar tus productos favoritos para encontrarlos más rápido."
                  icon={Heart}
                />
              }
            />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
