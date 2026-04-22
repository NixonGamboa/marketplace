/*
CartIcon de MAUI
─────────────────────────────────────────────
- Icono de carrito reutilizable en Header.
- Contiene:
  - Ícono de carrito (usando Icon).
  - Badge con cantidad de productos.
- Estilos:
  - Badge circular, fondo morado (#7441d8), texto blanco.
  - Posición absoluta en la esquina superior derecha del ícono.
- Props:
  - count (número de productos en carrito).
  - onClick (abre vista del carrito).
- Accesibilidad:
  - aria-label="Abrir carrito, X productos".
  - role="button".
- Buenas prácticas:
  - Mostrar badge solo si count > 0.
  - Badge con min-width y padding para números de 2+ dígitos.
*/
import Icon from '../../components/ui/Icon'
import Button from '../../components/ui/Button'

interface CartIconProps {
  count?: number
  onClick?: () => void
  size?: 'sm' | 'md' | 'lg'
}

const CartIcon = ({ count = 0, onClick, size = 'md' }: CartIconProps) => {
  const label = `Abrir carrito${count > 0 ? `, ${count} producto${count === 1 ? '' : 's'}` : ''}`
  const badgeSize = size === 'lg' ? 'min-w-[1.15rem] h-5 text-[11px]' : 'min-w-[1rem] h-4 text-[11px]'
  return (
    <Button
      variant="ghost"
      size={size}
      aria-label={label}
      onClick={onClick}
      className="relative text-brand-dark"
    >
      <Icon name="cart" size={size} decorative />
      {count > 0 && (
        <span
          className={[
            'absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-brand-primary px-1 font-semibold text-white shadow',
            badgeSize,
          ].join(' ')}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Button>
  )
}

export type { CartIconProps }
export default CartIcon
