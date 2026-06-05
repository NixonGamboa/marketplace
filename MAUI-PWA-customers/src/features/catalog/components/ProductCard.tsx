import { memo, useState } from 'react'
import { ShoppingCart, Check } from 'lucide-react'
import { VariableWeightBadge } from './VariableWeightBadge'

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
}

const formatPrice = (value: number, currency = 'COP') => {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `$${value}`
  }
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
  added = false,
  disabled = false,
  loading = false,
  inStock = true,
  is_variable_weight = false,
  badge,
  className = '',
}: ProductCardProps) => {
  const [favorited, setFavorited] = useState(false)
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
        'focus-within:ring-2 focus-within:ring-brand-primary focus-within:ring-offset-2',
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
        <span className="absolute left-2.5 top-2.5 z-10 rounded-lg bg-brand-primary px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white shadow-brand-sm">
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
          aria-label={favorited ? `Quitar ${name} de favoritos` : `Agregar ${name} a favoritos`}
          className="absolute right-2.5 top-2.5 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white shadow-card hover:shadow-card-hover transition-all"
        >
          <svg
            viewBox="0 0 24 24"
            className={['w-4 h-4 transition-colors', favorited ? 'fill-red-500 stroke-red-500' : 'fill-none stroke-gray-400'].join(' ')}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      )}

      {/* Imagen */}
      <div className="relative aspect-square w-full bg-gray-50 flex items-center justify-center overflow-hidden">
        <img
          src={image}
          alt={imageAlt}
          loading="lazy"
          className="h-[80%] w-[80%] object-contain object-center mix-blend-multiply select-none transition-transform duration-300 group-hover:scale-[1.06]"
          draggable={false}
        />
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 px-3 pb-3 pt-2.5">
        <h3 className="text-sm font-medium leading-snug text-brand-dark line-clamp-2">{name}</h3>

        {unit && <p className="text-[11px] text-brand-muted leading-tight">{unit}</p>}

        {is_variable_weight && (
          <VariableWeightBadge compact className="self-start" />
        )}

        {/* Precio */}
        <div className="flex flex-col mt-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-brand-primary font-bold text-base tabular-nums">{priceLabel}</span>
          </div>
          {originalLabel && (
            <span className="text-[11px] text-brand-muted line-through tabular-nums">{originalLabel}</span>
          )}
        </div>

        {/* CTA */}
        <div className="mt-auto pt-2">
          {inStock ? (
            <button
              onClick={onAdd}
              disabled={disabled || loading}
              aria-label={`${added ? 'Quitar' : 'Agregar'} ${name}`}
              className={[
                'w-full py-2 rounded-xl text-sm font-semibold transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1',
                added
                  ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/30'
                  : 'border border-brand-primary text-brand-primary bg-white hover:bg-brand-primary/5',
                (disabled || loading) && 'opacity-50 cursor-not-allowed',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                  Agregando...
                </span>
              ) : added ? (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <Check size={14} />
                  En canasta
                </span>
              ) : (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <ShoppingCart size={14} />
                  Agregar
                </span>
              )}
            </button>
          ) : (
            <span className="block text-center text-xs text-brand-muted py-1.5 font-medium">
              Sin stock
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

export default memo(ProductCard)
