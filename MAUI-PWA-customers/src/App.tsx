import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Heart, Tag } from 'lucide-react'
import RootLayout from './shared/components/layout/RootLayout'
import NotFound from './shared/components/layout/NotFound'
import ComingSoonPage from './shared/components/layout/ComingSoonPage'
import { ErrorBoundary } from './shared/components/ErrorBoundary'
import { useThemeSync } from './shared/hooks/useThemeSync'

const Home = lazy(() => import('./features/catalog/pages/Home'))
const CartPage = lazy(() => import('./features/cart/pages/CartPage'))
const OrdersPage = lazy(() => import('./features/orders/pages/OrdersPage'))
const AuthPage = lazy(() => import('./features/auth/pages/AuthPage'))
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
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<RootLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/catalog" element={<CatalogLandingPage />} />
            <Route path="/catalog/:categoryId" element={<CatalogPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/orden/:orderId" element={<OrderDetailPage />} />
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
