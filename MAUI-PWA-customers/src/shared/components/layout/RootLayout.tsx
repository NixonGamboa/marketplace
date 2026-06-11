import { Outlet, useNavigate } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import BottomNavBar from './BottomNavBar'
import { PWAUpdateBanner } from '@/shared/components/ui/PWAUpdateBanner'
import { useCartStore } from '@/stores/cartStore'
import { useUIStore } from '@/stores/uiStore'
import { useBottomNavVisible } from '@/shared/hooks/useBottomNavVisible'


export default function RootLayout() {
  const navigate = useNavigate()
  const cartCount = useCartStore((s) => s.items.length)
  const cartTotal = useCartStore((s) => s.total)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)
  const bottomNavVisible = useBottomNavVisible()

  return (
    <div className="flex flex-col min-h-screen bg-brand-bg text-brand-dark">
      <Header
        cartCount={cartCount}
        cartTotal={cartTotal}
        onCartClick={() => navigate('/cart')}
        onSearch={(q) => {
          setSearchQuery(q)
          navigate(`/search?q=${encodeURIComponent(q)}`)
        }}
      />
      <main
        role="main"
        className="flex-1 main-bottom-padding lg:pb-0"
        style={{ paddingBottom: 'calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))' }}
      >
        <Outlet />
      </main>
      <div className="hidden md:block">
        <Footer />
      </div>
      <PWAUpdateBanner />
      {bottomNavVisible && <BottomNavBar />}
    </div>
  )
}
