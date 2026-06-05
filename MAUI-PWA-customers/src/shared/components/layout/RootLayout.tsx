import { Outlet, useNavigate } from 'react-router-dom'
import Header from './Header'
import { PWAUpdateBanner } from '@/shared/components/ui/PWAUpdateBanner'
import { useCartStore } from '@/stores/cartStore'
import { useUIStore } from '@/stores/uiStore'

export default function RootLayout() {
  const navigate = useNavigate()
  const cartCount = useCartStore((s) => s.count)
  const cartTotal = useCartStore((s) => s.total)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)

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
      <main role="main" className="flex-1">
        <Outlet />
      </main>
      <PWAUpdateBanner />
    </div>
  )
}
