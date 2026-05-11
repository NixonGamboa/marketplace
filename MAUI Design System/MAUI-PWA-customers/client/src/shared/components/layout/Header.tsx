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
    <header className="sticky top-0 z-40 w-full bg-brand-surface/95 backdrop-blur-md supports-[backdrop-filter]:bg-brand-surface/90 shadow-card border-b border-brand-border">
      {/* Fila principal */}
      <div className="max-w-screen-xl mx-auto px-4 py-3 md:py-2 flex items-center gap-3 md:gap-6">
        {/* Menú hamburguesa en móvil */}
        <div className="flex md:hidden">
          <Button
            variant="ghost"
            size="md"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} decorative />
          </Button>
        </div>

        {/* Logo */}
        <a
          href="/"
          className="flex items-center gap-2 font-semibold text-brand-dark text-lg md:text-xl"
          aria-label="Ir al inicio"
        >
          <img
            src="/logo/maui-logo.svg"
            alt="Logo MAUI"
            className="h-8 w-auto md:h-9 select-none"
            draggable={false}
          />
        </a>

        {/* Search (visible en md+) */}
        <div className="hidden flex-1 md:block">
          <SearchBar onSubmit={onSearch} className="mx-auto" />
        </div>

        {/* Botón Categorías (solo desktop) */}
        <div className="hidden md:block">
          <Button
            variant="secondary"
            size="md"
            className="font-medium"
            onClick={onOpenCategories}
            aria-label="Abrir categorías"
          >
            <Icon name="category" decorative />
            Categorías
          </Button>
        </div>

        {/* Acciones derecha */}
        <div className="flex items-center gap-1 md:gap-2 ml-auto">
          <CartIcon count={cartCount} onClick={onCartClick} />
        </div>
      </div>

      {/* Segunda fila móvil: buscador */}
      <div className="px-4 pb-3 md:hidden">
        <SearchBar onSubmit={onSearch} />
      </div>

      {/* Menú expandible móvil */}
      {menuOpen && (
        <nav
          className="md:hidden border-t border-brand-border bg-brand-surface/[0.98] backdrop-blur-md shadow-card animate-fade-in animate-slide-in-top"
          aria-label="Menú principal"
        >
          <ul className="max-w-screen-xl mx-auto px-4 py-3 grid gap-2 text-sm">
            <li>
              <Button
                variant="ghost"
                size="md"
                className="w-full justify-start font-medium"
                onClick={onOpenCategories}
              >
                Todas las categorías
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
