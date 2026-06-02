import { ShoppingCart } from 'lucide-react'

interface FloatingCartBarProps {
  itemCount: number
  total: number
  currency?: string
  onCheckout: () => void
}

const formatPrice = (value: number, currency = 'COP') =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)

export function FloatingCartBar({ itemCount, total, currency = 'COP', onCheckout }: FloatingCartBarProps) {
  if (itemCount === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-in-bottom">
      <button
        onClick={onCheckout}
        aria-label={`Ver carrito, ${itemCount} producto${itemCount === 1 ? '' : 's'}, total ${formatPrice(total, currency)}`}
        className="w-full h-16 bg-brand-primary text-white flex items-center justify-between px-5 shadow-brand-md hover:bg-brand-primary-dark transition-colors active:scale-[0.99]"
      >
        <div className="flex items-center gap-2">
          <span className="relative">
            <ShoppingCart size={22} aria-hidden="true" />
            <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 bg-white text-brand-primary rounded-full text-[10px] font-bold tabular-nums">
              {itemCount > 9 ? '9+' : itemCount}
            </span>
          </span>
          <span className="text-sm font-semibold">Ver canasta</span>
        </div>
        <span className="text-base font-bold tabular-nums">{formatPrice(total, currency)}</span>
      </button>
    </div>
  )
}
