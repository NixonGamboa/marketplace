import { useState } from 'react'
import SearchBar from '../../components/navigation/SearchBar'
import CartIcon from '../../components/navigation/CartIcon'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'

interface HeaderProps {
  cartCount?: number
  onCartClick?: () => void
  onSearch?: (value: string) => void
  onOpenCategories?: () => void
}

const Header = ({
  cartCount = 0,
  onCartClick,
  onSearch,
  onOpenCategories,
}: HeaderProps) => {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/90 border-b border-brand-border shadow-[0_1px_0_0_rgba(226,232,240,0.8)]">
      {/* Fila principal */}
      <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center gap-3 md:gap-4">
        {/* Hamburguesa en móvil */}
        <div className="flex md:hidden">
          <Button
            variant="ghost"
            size="md"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="text-brand-dark"
          >
            <Icon name={menuOpen ? 'close' : 'menu'} decorative />
          </Button>
        </div>

        {/* Logo */}
        <a
          href="/"
          className="flex items-center gap-2 shrink-0"
          aria-label="Ir al inicio"
        >
          <img
            src="/logo/maui-logo.svg"
            alt="Logo MAUI"
            className="h-8 w-auto md:h-9 select-none"
            draggable={false}
          />
        </a>

        {/* Buscador — ocupa todo el espacio central en desktop */}
        <div className="hidden flex-1 md:flex justify-center">
          <SearchBar onSubmit={onSearch} className="max-w-lg w-full" />
        </div>

        {/* Botón Pasillos solo en desktop */}
        <div className="hidden md:block shrink-0">
          <Button
            variant="ghost"
            size="md"
            className="text-brand-muted hover:text-brand-dark font-medium"
            onClick={onOpenCategories}
            aria-label="Ver todos los pasillos"
          >
            <Icon name="category" decorative />
            Pasillos
          </Button>
        </div>

        {/* Carrito */}
        <div className="ml-auto md:ml-0 shrink-0">
          <CartIcon count={cartCount} onClick={onCartClick} />
        </div>
      </div>

      {/* Fila buscador en móvil */}
      <div className="px-4 pb-3 md:hidden">
        <SearchBar onSubmit={onSearch} />
      </div>

      {/* Menú expandible móvil */}
      {menuOpen && (
        <nav
          className="md:hidden border-t border-brand-border bg-white animate-slide-in-top"
          aria-label="Menú principal"
        >
          <ul className="max-w-screen-xl mx-auto px-4 py-2">
            <li>
              <Button
                variant="ghost"
                size="md"
                className="w-full justify-start font-medium text-brand-dark"
                onClick={() => {
                  setMenuOpen(false)
                  onOpenCategories?.()
                }}
              >
                <Icon name="category" decorative />
                Todos los pasillos
              </Button>
            </li>
          </ul>
        </nav>
      )}
    </header>
  )
}

export type { HeaderProps }
export default Header
