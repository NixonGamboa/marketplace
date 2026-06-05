import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Tag, ShoppingBag, Heart, type LucideIcon } from 'lucide-react'
import Icon from '../../components/ui/Icon'
import logoIsotipo from '@/assets/logo/isotipo.png'
import logoLogotipo from '@/assets/logo/logotipo.png'

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
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (q) onSearch?.(q)
  }

  return (
    <header className="sticky top-0 z-40 w-full bg-white border-b border-brand-border shadow-sm">
      {/* Fila principal desktop */}
      <div className="max-w-[1440px] mx-auto px-4 h-16 flex items-center gap-3 md:gap-4">
        {/* Hamburguesa móvil */}
        <button
          className="md:hidden text-brand-dark p-1 rounded-lg hover:bg-brand-bg transition-colors"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} decorative colorClass="text-brand-dark" />
        </button>

        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2.5 shrink-0 no-underline hover:no-underline"
          aria-label="Ir al inicio — MAUI"
        >
          <div className="flex items-center justify-center p-1.5 rounded-xl border border-brand-border bg-white shadow-sm">
            <img
              src={logoIsotipo}
              alt="MAUI"
              className="h-11 w-auto select-none"
              draggable={false}
            />
          </div>
          <div className="hidden sm:flex flex-col gap-1">
            <img
              src={logoLogotipo}
              alt="MAUI"
              className="h-4 w-auto self-start select-none"
              draggable={false}
            />
            <span className="text-brand-muted text-[10px] leading-none font-medium">En alianza con Leche y Miel</span>
          </div>
        </Link>

        {/* Buscador central — solo desktop */}
        <form
          onSubmit={handleSearch}
          className="flex-1 hidden md:flex"
          role="search"
          aria-label="Buscar productos"
        >
          <div className="relative w-full">
            <Icon
              name="search"
              size="sm"
              decorative
              colorClass="text-gray-400"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Buscar productos frescos, marcas y más..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-100 text-brand-dark text-sm placeholder:text-gray-400 outline-none border-0 focus:ring-2 focus:ring-brand-primary/30 transition-shadow"
            />
          </div>
        </form>

        {/* Nav links desktop */}
        <nav className="hidden md:flex items-center gap-0.5 shrink-0" aria-label="Navegación principal">
          <NavLink to="/" label="Ofertas" icon={Tag} active />
          <NavLink to="/orders" label="Mis pedidos" icon={ShoppingBag} />
          <NavLink to="/" label="Favoritos" icon={Heart} />
        </nav>

        {/* Carrito */}
        <button
          onClick={onCartClick}
          aria-label={`Canasta — ${cartCount} productos — ${formatCOP(cartTotal)}`}
          className="ml-auto md:ml-0 relative flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-dark text-white rounded-xl px-3 py-2 transition-colors shrink-0"
        >
          <Icon name="cart" size="sm" decorative colorClass="text-white" />
          <span className="hidden sm:block text-sm font-semibold tabular-nums">
            {formatCOP(cartTotal)}
          </span>
          {cartCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-2 -right-2 min-w-[1.25rem] h-5 flex items-center justify-center rounded-full bg-white text-brand-primary text-[10px] font-bold px-1 shadow-brand-sm"
            >
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          )}
        </button>

        {/* Avatar usuario */}
        <button
          aria-label="Perfil de usuario"
          className="hidden md:flex shrink-0 w-9 h-9 rounded-full bg-gray-200 items-center justify-center hover:bg-gray-300 transition-colors overflow-hidden"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="currentColor" aria-hidden="true">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
          </svg>
        </button>
      </div>

      {/* Buscador móvil */}
      <div className="md:hidden px-4 pb-3">
        <form onSubmit={handleSearch} role="search" aria-label="Buscar productos">
          <div className="relative">
            <Icon
              name="search"
              size="sm"
              decorative
              colorClass="text-gray-400"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Buscar productos frescos..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-100 text-brand-dark text-sm placeholder:text-gray-400 outline-none border-0"
            />
          </div>
        </form>
      </div>

      {/* Menú móvil expandible */}
      {menuOpen && (
        <nav
          className="md:hidden border-t border-brand-border bg-white animate-slide-in-top"
          aria-label="Menú principal"
        >
          <ul className="max-w-[1440px] mx-auto px-4 py-3 space-y-1">
            {[
              { to: '/', label: 'Ofertas' },
              { to: '/orders', label: 'Mis pedidos' },
              { to: '/', label: 'Favoritos' },
            ].map(({ to, label }) => (
              <li key={label}>
                <Link
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className="block text-brand-dark/70 hover:text-brand-primary hover:bg-brand-primary/5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors no-underline"
                >
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  navigate('/catalog/frutas-verduras')
                }}
                className="w-full text-left text-brand-dark/70 hover:text-brand-primary hover:bg-brand-primary/5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Todos los pasillos
              </button>
            </li>
          </ul>
        </nav>
      )}
    </header>
  )
}

const NavLink = ({ to, label, icon: IconComponent, active }: { to: string; label: string; icon?: LucideIcon; active?: boolean }) => (
  <Link
    to={to}
    className={[
      'px-3 py-2 rounded-lg text-sm font-medium transition-colors no-underline flex items-center gap-1.5',
      active
        ? 'text-brand-primary hover:bg-brand-primary/5'
        : 'text-brand-dark/70 hover:text-brand-primary hover:bg-brand-primary/5',
    ].join(' ')}
  >
    {IconComponent && <IconComponent size={15} strokeWidth={2} />}
    {label}
  </Link>
)

export type { HeaderProps }
export default Header
