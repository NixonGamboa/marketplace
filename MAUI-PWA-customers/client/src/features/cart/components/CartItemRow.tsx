import { Trash2 } from 'lucide-react'
import type { CartItem } from '@/types'
import { VariableWeightBadge } from '@/features/catalog/components/VariableWeightBadge'

interface CartItemRowProps {
  item: CartItem
  onRemove: (productId: string) => void
  onQuantityChange: (productId: string, qty: number) => void
}

const formatPrice = (value: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)

export function CartItemRow({ item, onRemove, onQuantityChange }: CartItemRowProps) {
  const subtotal = item.price_at_moment * item.quantity

  return (
    <div className="flex items-start gap-3 py-3 border-b border-brand-border last:border-0">
      {/* Thumbnail */}
      <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50 border border-brand-border">
        <img
          src={item.imageUrl}
          alt={item.name}
          loading="lazy"
          className="w-full h-full object-contain p-1 mix-blend-multiply"
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-brand-dark leading-snug line-clamp-2">{item.name}</p>
        {item.is_variable_weight && <VariableWeightBadge compact className="mt-1" />}
        <p className="text-xs text-brand-muted mt-0.5">{item.unit}</p>

        {/* Stepper + subtotal */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1 border border-brand-border rounded-lg overflow-hidden">
            <button
              onClick={() => onQuantityChange(item.productId, item.quantity - 1)}
              aria-label="Reducir cantidad"
              className="w-8 h-8 flex items-center justify-center text-brand-primary hover:bg-brand-primary/5 transition-colors text-lg font-semibold"
            >
              −
            </button>
            <span className="w-8 text-center text-sm font-semibold text-brand-dark tabular-nums">
              {item.quantity}
            </span>
            <button
              onClick={() => onQuantityChange(item.productId, item.quantity + 1)}
              aria-label="Aumentar cantidad"
              className="w-8 h-8 flex items-center justify-center text-brand-primary hover:bg-brand-primary/5 transition-colors text-lg font-semibold"
            >
              +
            </button>
          </div>
          <span className="text-sm font-semibold text-brand-dark tabular-nums">
            {formatPrice(subtotal)}
          </span>
        </div>
      </div>

      {/* Eliminar */}
      <button
        onClick={() => onRemove(item.productId)}
        aria-label={`Eliminar ${item.name}`}
        className="flex-shrink-0 p-1.5 text-brand-muted hover:text-brand-error transition-colors rounded-md hover:bg-red-50"
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
