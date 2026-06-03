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
      <div className="flex flex-col items-center justify-center min-h-[65vh] gap-5 px-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-brand-primary-light flex items-center justify-center">
          <ShoppingCart size={36} className="text-brand-primary" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-brand-dark">Tu canasta está vacía</h1>
          <p className="text-brand-muted text-sm max-w-xs leading-relaxed">
            Agrega productos desde el inicio para comenzar tu pedido.
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="mt-1 px-7 py-3 bg-brand-primary text-white rounded-xl font-semibold text-sm hover:bg-brand-primary-dark transition-colors shadow-brand-sm"
        >
          Ver productos
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Encabezado */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-brand-dark">Tu canasta</h1>
        <p className="text-brand-muted text-sm mt-0.5">
          {count} producto{count === 1 ? '' : 's'}
        </p>
      </div>

      {/* Lista de items */}
      <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
        {items.map((item) => (
          <CartItemRow
            key={item.productId}
            item={item}
            onRemove={removeItem}
            onQuantityChange={updateQuantity}
          />
        ))}
      </div>

      {/* Resumen de precio */}
      <div className="mt-4 bg-white rounded-2xl border border-brand-border shadow-card p-5 space-y-3">
        <div className="flex justify-between items-center text-sm">
          <span className="text-brand-muted font-medium">Subtotal estimado</span>
          <span className="font-bold text-brand-primary text-base tabular-nums">{formatPrice(total)}</span>
        </div>
        <div className="border-t border-brand-border pt-3">
          <p className="text-xs text-brand-muted leading-relaxed">
            * El valor de productos de peso variable se ajusta según el peso exacto en tienda.
          </p>
        </div>
      </div>

      {/* CTA principal */}
      <button
        onClick={() => navigate('/checkout')}
        className={[
          'mt-5 w-full h-14 rounded-2xl font-bold text-base text-white',
          'bg-brand-primary hover:bg-brand-primary-dark active:scale-[0.99]',
          'transition-all shadow-brand-md',
          'flex items-center justify-center gap-3',
        ].join(' ')}
      >
        <ShoppingCart size={20} aria-hidden="true" />
        Pedir mi Mercado · {formatPrice(total)}
      </button>
    </div>
  )
}
