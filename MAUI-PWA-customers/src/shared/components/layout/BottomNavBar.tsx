import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Tag, ShoppingCart, Package, Heart } from 'lucide-react'
import { useCartStore } from '@/stores/cartStore'
import { useUIStore } from '@/stores/uiStore'

interface NavSlot {
  to: string
  label: string
  icon: React.ReactNode
}

export default function BottomNavBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const cartCount = useCartStore((s) => s.items.length)
  const bottomSheetOpen = useUIStore((s) => s.bottomSheetOpen)

  const slots: NavSlot[] = [
    { to: '/',          label: 'Inicio',      icon: <Home      size={22} strokeWidth={1.8} /> },
    { to: '/ofertas',   label: 'Ofertas',     icon: <Tag       size={22} strokeWidth={1.8} /> },
    { to: '/orders',    label: 'Mis pedidos', icon: <Package   size={22} strokeWidth={1.8} /> },
    { to: '/favoritos', label: 'Favoritos',   icon: <Heart     size={22} strokeWidth={1.8} /> },
  ]

  return (
    <nav
      role="navigation"
      aria-label="Navegación principal"
      className={[
        'lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-brand-surface border-t border-brand-border overflow-visible shadow-[0_-2px_12px_rgba(15,23,42,0.08)]',
        'transition-transform duration-300 ease-in-out',
        bottomSheetOpen ? 'translate-y-full' : 'translate-y-0',
      ].join(' ')}
      style={{
        height: 'calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex justify-around items-center h-[56px]">
        {/* Slot 1 — Inicio */}
        <NavButton
          label={slots[0].label}
          icon={slots[0].icon}
          active={pathname === slots[0].to}
          onClick={() => navigate(slots[0].to)}
        />

        {/* Slot 2 — Ofertas */}
        <NavButton
          label={slots[1].label}
          icon={slots[1].icon}
          active={pathname === slots[1].to || pathname.startsWith(slots[1].to + '/')}
          onClick={() => navigate(slots[1].to)}
        />

        {/* Slot 3 — Carrito: FAB elevado solo con productos; plano en vacío */}
        {cartCount > 0 ? (
          <div className="flex flex-col items-center">
            <button
              onClick={() => navigate('/cart')}
              aria-label={`Carrito, ${cartCount} productos`}
              className="relative w-14 h-14 rounded-full bg-brand-primary shadow-brand-md flex items-center justify-center border-4 border-brand-bg -translate-y-[14px] transition-transform active:scale-95"
            >
              <ShoppingCart size={22} strokeWidth={1.8} className="text-white" aria-hidden="true" />
              <span
                aria-hidden="true"
                className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 flex items-center justify-center rounded-full bg-brand-surface text-brand-primary text-[10px] font-bold px-1 shadow-brand-sm"
              >
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            </button>
          </div>
        ) : (
          <NavButton
            label="Carrito"
            icon={<ShoppingCart size={22} strokeWidth={1.8} />}
            active={pathname === '/cart'}
            onClick={() => navigate('/cart')}
          />
        )}

        {/* Slot 4 — Mis pedidos */}
        <NavButton
          label={slots[2].label}
          icon={slots[2].icon}
          active={pathname === slots[2].to || pathname.startsWith(slots[2].to + '/')}
          onClick={() => navigate(slots[2].to)}
        />

        {/* Slot 5 — Favoritos */}
        <NavButton
          label={slots[3].label}
          icon={slots[3].icon}
          active={pathname === slots[3].to || pathname.startsWith(slots[3].to + '/')}
          onClick={() => navigate(slots[3].to)}
        />
      </div>
    </nav>
  )
}

interface NavButtonProps {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}

function NavButton({ label, icon, active, onClick }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={[
        'flex flex-col items-center justify-center gap-0.5 min-w-[48px] px-2 py-1 transition-colors',
        active ? 'text-brand-primary' : 'text-brand-muted',
      ].join(' ')}
    >
      {icon}
      <span
        className={[
          'text-[10px] leading-tight',
          active ? 'font-semibold' : 'font-medium',
        ].join(' ')}
      >
        {label}
      </span>
    </button>
  )
}
