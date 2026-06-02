import { useNavigate } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { useCart } from '@/hooks'
import { CartItemRow } from '../components/CartItemRow'

const formatPrice = (value: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)

export default function CartPage() {
  const navigate = useNavigate()
  const { items, removeItem, updateQuantity, total, count } = useCart()

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center">
        <ShoppingCart size={48} className="text-brand-border" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-brand-dark">Tu canasta está vacía</h1>
        <p className="text-brand-muted text-sm max-w-xs">
          Agrega productos desde el inicio para comenzar tu pedido.
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-2 px-6 py-2.5 bg-brand-primary text-white rounded-xl font-semibold text-sm hover:bg-brand-primary-dark transition-colors"
        >
          Ver productos
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-5">
      <h1 className="text-xl font-semibold text-brand-dark mb-1">Tu canasta</h1>
      <p className="text-brand-muted text-sm mb-4">
        {count} producto{count === 1 ? '' : 's'}
      </p>

      <div className="bg-brand-surface rounded-xl border border-brand-border shadow-card">
        {items.map((item) => (
          <CartItemRow
            key={item.productId}
            item={item}
            onRemove={removeItem}
            onQuantityChange={updateQuantity}
          />
        ))}
      </div>

      {/* Resumen */}
      <div className="mt-4 bg-brand-surface rounded-xl border border-brand-border shadow-card p-4 space-y-2">
        <div className="flex justify-between text-sm text-brand-muted">
          <span>Subtotal estimado</span>
          <span className="tabular-nums">{formatPrice(total)}</span>
        </div>
        <p className="text-xs text-brand-muted">
          * Productos de peso variable pueden ajustarse al momento de pesar.
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate('/checkout')}
        className="mt-4 w-full h-14 bg-brand-primary text-white rounded-xl font-semibold text-base hover:bg-brand-primary-dark transition-colors shadow-brand-sm"
      >
        Pedir mi Mercado · {formatPrice(total)}
      </button>
    </div>
  )
}
