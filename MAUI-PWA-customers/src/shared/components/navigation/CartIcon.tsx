import Icon from '../../components/ui/Icon'
import Button from '../../components/ui/Button'

interface CartIconProps {
  count?: number
  onClick?: () => void
  size?: 'sm' | 'md' | 'lg'
}

const CartIcon = ({ count = 0, onClick, size = 'md' }: CartIconProps) => {
  const label = `Abrir canasta${count > 0 ? `, ${count} producto${count === 1 ? '' : 's'}` : ''}`
  const badgeSize = size === 'lg' ? 'min-w-[1.2rem] h-5 text-[11px]' : 'min-w-[1rem] h-4 text-[10px]'

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
            'absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-brand-primary px-1 font-bold text-white shadow-brand-sm',
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
