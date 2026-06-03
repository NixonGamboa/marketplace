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
    <div className="flex items-start gap-3 px-4 py-4 border-b border-brand-border last:border-0">
      {/* Thumbnail */}
      <div className="w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden bg-gray-50 border border-brand-border">
        <img
          src={item.imageUrl}
          alt={item.name}
          loading="lazy"
          className="w-full h-full object-contain p-1.5 mix-blend-multiply"
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-brand-dark leading-snug line-clamp-2">
          {item.name}
        </p>
        {item.is_variable_weight && <VariableWeightBadge compact className="mt-1" />}
        {item.unit && (
          <p className="text-xs text-brand-muted mt-0.5">{item.unit}</p>
        )}

        {/* Stepper + subtotal */}
        <div className="flex items-center justify-between mt-3">
          {/* Stepper */}
          <div className="flex items-center rounded-xl border border-brand-border overflow-hidden">
            <button
              onClick={() => onQuantityChange(item.productId, item.quantity - 1)}
              aria-label="Reducir cantidad"
              className="w-9 h-9 flex items-center justify-center text-brand-primary hover:bg-brand-primary-light transition-colors text-lg font-bold"
            >
              −
            </button>
            <span className="w-9 text-center text-sm font-bold text-brand-dark tabular-nums select-none">
              {item.quantity}
            </span>
            <button
              onClick={() => onQuantityChange(item.productId, item.quantity + 1)}
              aria-label="Aumentar cantidad"
              className="w-9 h-9 flex items-center justify-center text-brand-primary hover:bg-brand-primary-light transition-colors text-lg font-bold"
            >
              +
            </button>
          </div>

          {/* Subtotal */}
          <span className="text-sm font-bold text-brand-primary tabular-nums">
            {formatPrice(subtotal)}
          </span>
        </div>
      </div>

      {/* Eliminar */}
      <button
        onClick={() => onRemove(item.productId)}
        aria-label={`Eliminar ${item.name}`}
        className="flex-shrink-0 p-2 text-brand-muted/70 hover:text-brand-error transition-colors rounded-xl hover:bg-red-50"
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </div>
  )
}
