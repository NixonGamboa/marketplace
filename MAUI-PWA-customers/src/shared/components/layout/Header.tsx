import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import logoMaui from '@/assets/logo/logo-maui.svg'

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
    <header className="sticky top-0 z-40 w-full bg-brand-primary shadow-brand-md">
      {/* Fila principal desktop */}
      <div className="max-w-screen-xl mx-auto px-4 h-16 flex items-center gap-3 md:gap-4">
        {/* Hamburguesa móvil */}
        <button
          className="md:hidden text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} decorative colorClass="text-white" />
        </button>

        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2.5 shrink-0 no-underline hover:no-underline"
          aria-label="Ir al inicio — MAUI"
        >
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <img
              src={logoMaui}
              alt="MAUI"
              className="h-5 w-auto brightness-0 invert select-none"
              draggable={false}
            />
          </div>
          <div className="hidden sm:flex flex-col leading-none gap-0.5">
            <span className="text-white font-bold text-[15px] leading-none tracking-wide">MAUI</span>
            <span className="text-white/60 text-[11px] leading-none font-medium">Tu mercado local</span>
          </div>
        </Link>

        {/* Buscador central — solo desktop */}
        <form
          onSubmit={handleSearch}
          className="flex-1 max-w-xl hidden md:flex"
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
              placeholder="Buscar productos frescos..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white text-brand-dark text-sm placeholder:text-gray-400 outline-none border-0 focus:ring-2 focus:ring-white/40 transition-shadow"
            />
          </div>
        </form>

        {/* Nav links desktop */}
        <nav className="hidden md:flex items-center gap-0.5" aria-label="Navegación principal">
          <NavLink to="/" label="Ofertas" />
          <NavLink to="/orders" label="Mis pedidos" />
          <NavLink to="/" label="Favoritos" />
        </nav>

        {/* Carrito */}
        <button
          onClick={onCartClick}
          aria-label={`Canasta — ${cartCount} productos — ${formatCOP(cartTotal)}`}
          className="ml-auto md:ml-0 relative flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white rounded-xl px-3 py-2 transition-colors"
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
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white text-brand-dark text-sm placeholder:text-gray-400 outline-none border-0"
            />
          </div>
        </form>
      </div>

      {/* Menú móvil expandible */}
      {menuOpen && (
        <nav
          className="md:hidden border-t border-white/20 bg-brand-primary animate-slide-in-top"
          aria-label="Menú principal"
        >
          <ul className="max-w-screen-xl mx-auto px-4 py-3 space-y-1">
            {[
              { to: '/', label: 'Ofertas' },
              { to: '/orders', label: 'Mis pedidos' },
              { to: '/', label: 'Favoritos' },
            ].map(({ to, label }) => (
              <li key={label}>
                <Link
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className="block text-white/80 hover:text-white hover:bg-white/10 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors no-underline"
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
                className="w-full text-left text-white/80 hover:text-white hover:bg-white/10 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
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

const NavLink = ({ to, label }: { to: string; label: string }) => (
  <Link
    to={to}
    className="text-white/80 hover:text-white hover:bg-white/10 px-3 py-2 rounded-lg text-sm font-medium transition-colors no-underline"
  >
    {label}
  </Link>
)

export type { HeaderProps }
export default Header
