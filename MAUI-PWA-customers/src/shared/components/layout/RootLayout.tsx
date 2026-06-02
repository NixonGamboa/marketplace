import { Outlet, useNavigate } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import { PWAUpdateBanner } from '@/shared/components/ui/PWAUpdateBanner'
import { FloatingCartBar } from '@/shared/components/ui/FloatingCartBar'
import { useCartStore } from '@/stores/cartStore'
import { useUIStore } from '@/stores/uiStore'

export default function RootLayout() {
  const navigate = useNavigate()
  const cartCount = useCartStore((s) => s.count)
  const cartTotal = useCartStore((s) => s.total)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)

  return (
    <div className="flex flex-col min-h-screen text-brand-dark">
      <Header
        cartCount={cartCount}
        onCartClick={() => navigate('/cart')}
        onSearch={(q) => {
          setSearchQuery(q)
          navigate(`/search?q=${encodeURIComponent(q)}`)
        }}
      />
      <main role="main" className={['flex-1', cartCount > 0 ? 'pb-20' : ''].join(' ')}>
        <Outlet />
      </main>
      <Footer />
      <PWAUpdateBanner />
      <FloatingCartBar
        itemCount={cartCount}
        total={cartTotal}
        onCheckout={() => navigate('/cart')}
      />
    </div>
  )
}
