import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import RootLayout from './shared/components/layout/RootLayout'
import NotFound from './shared/components/layout/NotFound'
import { ErrorBoundary } from './shared/components/ErrorBoundary'
import { useThemeSync } from './shared/hooks/useThemeSync'

const Home = lazy(() => import('./features/catalog/pages/Home'))
const CartPage = lazy(() => import('./features/cart/pages/CartPage'))
const OrdersPage = lazy(() => import('./features/orders/pages/OrdersPage'))
const AuthPage = lazy(() => import('./features/auth/pages/AuthPage'))
const CatalogPage = lazy(() => import('./features/catalog/pages/CatalogPage'))
const CheckoutPage = lazy(() => import('./features/checkout/CheckoutPage'))
const OrderDetailPage = lazy(() => import('./features/orders/OrderDetailPage'))

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
            <Route path="/catalog/:categoryId" element={<CatalogPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/orden/:orderId" element={<OrderDetailPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
