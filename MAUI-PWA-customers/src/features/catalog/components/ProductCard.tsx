import { memo, useState } from 'react'
import { Plus } from 'lucide-react'
import { VariableWeightBadge } from './VariableWeightBadge'
import { QuantityStepper } from './QuantityStepper'
import { VariableWeightSheet } from './VariableWeightSheet'
import { ProductDetailSheet } from './ProductDetailSheet'
import { useProductQuantity } from '@/shared/hooks/useProductQuantity'
import { useCartStore } from '@/stores/cartStore'
import { formatPrice } from '@/shared/utils/formatPrice'
import type { Product } from '@/types/catalog'
import type { CartItem } from '@/types/cart'

export interface ProductCardProps {
  id?: string
  name: string
  image: string
  imageAlt?: string
  price: number
  originalPrice?: number
  unit?: string
  currency?: string
  onAdd?: () => void
  added?: boolean
  disabled?: boolean
  loading?: boolean
  inStock?: boolean
  is_variable_weight?: boolean
  badge?: string
  className?: string
  description?: string
  nutritionalInfo?: Product['nutritionalInfo']
  availability?: string
}

const ProductCard = ({
  id,
  name,
  image,
  imageAlt = name,
  price,
  originalPrice,
  unit,
  currency = 'COP',
  onAdd,
  added: _added = false,
  disabled = false,
  loading = false,
  inStock = true,
  is_variable_weight = false,
  badge,
  className = '',
  description,
  nutritionalInfo,
  availability,
}: ProductCardProps) => {
  const [favorited, setFavorited] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const { quantity, kilos: kilosInCart, increment, decrement } = useProductQuantity(id)
  const addItem = useCartStore((s) => s.addItem)
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)

  const priceLabel = formatPrice(price, currency)
  const originalLabel = originalPrice ? formatPrice(originalPrice, currency) : null
  const discountPct =
    originalPrice && originalPrice > price
      ? Math.round((1 - price / originalPrice) * 100)
      : null

  return (
    <article
      id={id}
      className={[
        'group relative flex flex-col rounded-2xl border border-brand-border bg-white',
        'shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 overflow-hidden',
        !inStock && 'opacity-60',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={name}
    >
      {/* Badge descuento */}
      {discountPct && inStock && (
        <span className="absolute left-2.5 top-2.5 z-10 rounded-full bg-brand-primary px-2 py-0.5 text-[10px] font-bold text-white shadow-brand-sm">
          -{discountPct}%
        </span>
      )}

      {/* Badge personalizado (sin descuento) */}
      {badge && !discountPct && (
        <span
          className={[
            'absolute left-2.5 top-2.5 z-10 rounded-lg px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white shadow-brand-sm',
            badge === 'Local' ? 'bg-emerald-600' : 'bg-brand-primary',
          ].join(' ')}
        >
          {badge}
        </span>
      )}

      {/* Badge agotado */}
      {!inStock && (
        <span className="absolute right-2.5 top-2.5 z-10 rounded-lg bg-gray-800/80 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          Agotado
        </span>
      )}

      {/* Favorito */}
      {inStock && (
        <button
          onClick={() => setFavorited((f) => !f)}
          aria-label={
            favorited ? `Quitar ${name} de favoritos` : `Agregar ${name} a favoritos`
          }
          className="absolute right-2.5 top-2.5 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white shadow-card hover:shadow-card-hover transition-all"
        >
          <svg
            viewBox="0 0 24 24"
            className={[
              'w-4 h-4 transition-colors',
              favorited ? 'fill-red-500 stroke-red-500' : 'fill-none stroke-gray-400',
            ].join(' ')}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      )}

      {/* Imagen — tap abre detalle */}
      <button
        type="button"
        aria-label={`Ver detalle de ${name}`}
        onClick={() => setDetailOpen(true)}
        className="relative aspect-square w-full bg-gray-50 flex items-center justify-center overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-inset"
      >
        <img
          src={image}
          alt={imageAlt}
          loading="lazy"
          className="h-[80%] w-[80%] object-contain object-center mix-blend-multiply select-none transition-transform duration-300 group-hover:scale-[1.06]"
          draggable={false}
        />
      </button>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 px-3 pb-3 pt-2.5">
        <button
          type="button"
          aria-label={`Ver detalle de ${name}`}
          onClick={() => setDetailOpen(true)}
          className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:rounded-sm"
        >
          <h3 className="text-sm font-medium leading-snug text-brand-dark line-clamp-2">
            {name}
          </h3>
        </button>

        {unit && <p className="text-[11px] text-brand-muted leading-tight">{unit}</p>}

        {is_variable_weight && (
          <VariableWeightBadge compact className="self-start" />
        )}

        {/* Fila inferior: precio + FAB/Stepper (igual en móvil y desktop) */}
        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
          {/* Precio */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-brand-primary font-bold text-base tabular-nums">
                {priceLabel}
              </span>
            </div>
            {originalLabel && (
              <span className="text-[11px] text-brand-muted line-through tabular-nums">
                {originalLabel}
              </span>
            )}
          </div>

          {/* FAB / Stepper — móvil y desktop */}
          {inStock ? (
            <div className="shrink-0">
              {is_variable_weight ? (
                kilosInCart > 0 ? (
                  <div className="flex items-center gap-1 rounded-full bg-brand-primary shadow-brand-md pl-2.5 pr-1 py-1">
                    <span className="text-white font-bold text-xs tabular-nums leading-none">
                      {kilosInCart} kg
                    </span>
                    <button
                      onClick={() => setSheetOpen(true)}
                      aria-label={`Agregar más ${name}`}
                      disabled={disabled || loading}
                      className="w-6 h-6 rounded-full bg-white/25 hover:bg-white/40 text-white flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-brand-primary"
                    >
                      <Plus size={13} strokeWidth={2.8} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSheetOpen(true)}
                    aria-label={`Agregar ${name}`}
                    disabled={disabled || loading}
                    className="shrink-0 w-9 h-9 rounded-full bg-brand-primary hover:bg-brand-primary-dark text-white shadow-brand-md flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1"
                  >
                    <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                )
              ) : quantity === 0 ? (
                <button
                  onClick={() => onAdd?.()}
                  aria-label={`Agregar ${name}`}
                  disabled={disabled || loading}
                  className="shrink-0 w-9 h-9 rounded-full bg-brand-primary hover:bg-brand-primary-dark text-white shadow-brand-md flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1"
                >
                  {loading ? (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
                  )}
                </button>
              ) : (
                <QuantityStepper
                  quantity={quantity}
                  onIncrement={increment}
                  onDecrement={decrement}
                  disabled={disabled || loading}
                />
              )}
            </div>
          ) : (
            <span className="shrink-0 text-xs text-brand-muted font-medium">
              Sin stock
            </span>
          )}
        </div>
      </div>

      {/* Bottom sheet para peso variable */}
      {is_variable_weight && (
        <VariableWeightSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          productName={name}
          pricePerUnit={price}
          currency={currency}
          initialKilos={kilosInCart > 0 ? kilosInCart : undefined}
          onConfirm={(kilos) => {
            addItem({
              productId: id ?? name,
              name,
              imageUrl: image,
              price,
              price_at_moment: price,
              unit: 'kg',
              quantity: 1,
              is_variable_weight: true,
              kilos,
            })
          }}
        />
      )}

      {/* Bottom sheet de detalle del producto */}
      <ProductDetailSheet
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        id={id}
        name={name}
        image={image}
        price={price}
        originalPrice={originalPrice}
        unit={unit}
        currency={currency}
        description={description}
        nutritionalInfo={nutritionalInfo}
        availability={availability}
        inStock={inStock}
        is_variable_weight={is_variable_weight}
        badge={badge}
        cartQuantity={quantity}
        onAdd={(qty) => {
          if (qty === 0) {
            removeItem(id ?? '')
          } else if (quantity > 0) {
            updateQuantity(id ?? '', qty)
          } else {
            addItem({ productId: id ?? name, name, imageUrl: image, price, price_at_moment: price, unit: unit ?? '', quantity: 1, is_variable_weight: false } satisfies CartItem)
            if (qty > 1) updateQuantity(id ?? '', qty)
          }
        }}
        onOpenWeightSheet={
          is_variable_weight
            ? () => {
                setDetailOpen(false)
                setSheetOpen(true)
              }
            : undefined
        }
      />
    </article>
  )
}

export default memo(ProductCard)
