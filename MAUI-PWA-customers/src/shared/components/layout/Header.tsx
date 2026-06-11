import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Tag, ShoppingBag, Heart, UserRound, type LucideIcon } from 'lucide-react'
import Icon from '../../components/ui/Icon'
import ThemeToggle from '../ui/ThemeToggle'
import logoIsotipo from '@/assets/logo/isotipo.png'
import logoLogotipo from '@/assets/logo/logotipo.png'
import logoImagotipo from '@/assets/logo/imagotipo.png'

interface HeaderProps {
  cartCount?: number
  cartTotal?: number
  onCartClick?: () => void
  onSearch?: (value: string) => void
}

const formatCOP = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)

const Header = ({ cartCount = 0, cartTotal = 0, onCartClick, onSearch }: HeaderProps) => {
  const [query, setQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (q) onSearch?.(q)
  }

  return (
    <header
      className="md:sticky md:top-0 md:z-40 w-full bg-brand-surface border-b border-brand-border shadow-sm"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Fila única (mobile y desktop comparten la misma fila) */}
      <div className="max-w-[1440px] mx-auto px-3 md:px-4 h-14 md:h-16 flex items-center gap-2 md:gap-4">

        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2 md:gap-2.5 shrink-0 no-underline hover:no-underline"
          aria-label="Ir al inicio — MAUI"
        >
          {/* Móvil: imagotipo completo, sin caja ni subtitle */}
          <img
            src={logoImagotipo}
            alt="MAUI"
            className="md:hidden h-8 w-auto select-none"
            draggable={false}
          />

          {/* Desktop: isotipo en caja + logotipo + subtitle */}
          <div className="hidden md:flex items-center justify-center p-1.5 rounded-xl border border-brand-border bg-brand-surface shadow-sm">
            <img
              src={logoIsotipo}
              alt="MAUI"
              className="h-11 w-auto select-none"
              draggable={false}
            />
          </div>
          <div className="hidden md:flex flex-col gap-1">
            <img
              src={logoLogotipo}
              alt="MAUI"
              className="h-4 w-auto self-start select-none"
              draggable={false}
            />
            <span className="text-brand-muted text-[10px] leading-none font-medium whitespace-nowrap">
              En alianza con Leche y Miel
            </span>
          </div>
        </Link>

        {/* Buscador — visible siempre, flex-1 empuja carrito/avatar al extremo */}
        <form
          onSubmit={handleSearch}
          className="flex-1"
          role="search"
          aria-label="Buscar productos"
        >
          <div className="relative w-full">
            <Icon
              name="search"
              size="sm"
              decorative
              colorClass="text-gray-400"
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Buscar productos..."
              className="w-full pl-9 pr-3 py-2 md:py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800/60 text-brand-dark text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none border-0 focus:ring-2 focus:ring-brand-primary/30 transition-shadow"
            />
          </div>
        </form>

        {/* Nav links — solo desktop */}
        <DesktopNav />

        {/* Carrito — redondo compacto en móvil, pill en desktop */}
        <button
          onClick={onCartClick}
          aria-label={`Canasta — ${cartCount} productos — ${formatCOP(cartTotal)}`}
          className="relative flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-dark text-white transition-colors shrink-0 w-10 h-10 rounded-full md:w-auto md:h-auto md:justify-start md:rounded-xl md:px-3 md:py-2"
        >
          <Icon name="cart" size="sm" decorative colorClass="text-white" />
          <span className="hidden md:block text-sm font-semibold tabular-nums">
            {formatCOP(cartTotal)}
          </span>
          {cartCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-2 -right-2 min-w-[1.25rem] h-5 flex items-center justify-center rounded-full bg-brand-surface text-brand-primary text-[10px] font-bold px-1 shadow-brand-sm"
            >
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          )}
        </button>

        {/* Theme toggle — oculto hasta completar estilos dark mode */}
        <span className="hidden"><ThemeToggle /></span>

        {/* Avatar usuario — visible siempre, compacto en móvil */}
        <button
          aria-label="Perfil de usuario"
          className="flex shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-2xl bg-brand-primary/10 items-center justify-center hover:bg-brand-primary/20 transition-colors"
        >
          <UserRound size={18} strokeWidth={1.8} className="text-brand-primary" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

function DesktopNav() {
  const { pathname } = useLocation()
  const links: { to: string; label: string; icon: LucideIcon }[] = [
    { to: '/ofertas',  label: 'Ofertas',     icon: Tag },
    { to: '/orders',   label: 'Mis pedidos', icon: ShoppingBag },
    { to: '/favoritos', label: 'Favoritos',  icon: Heart },
  ]
  return (
    <nav className="hidden md:flex items-center gap-0.5 shrink-0" aria-label="Navegación principal">
      {links.map(({ to, label, icon: IconComponent }) => {
        const active = pathname === to || pathname.startsWith(to + '/')
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={[
              'px-3 py-2 rounded-lg text-sm font-medium transition-colors no-underline flex items-center gap-1.5',
              active
                ? 'text-brand-primary hover:bg-brand-primary/5'
                : 'text-brand-dark/70 hover:text-brand-primary hover:bg-brand-primary/5',
            ].join(' ')}
          >
            <IconComponent size={15} strokeWidth={2} aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export type { HeaderProps }
export default Header
