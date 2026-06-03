import Button from '../../../shared/components/ui/Button'
import Icon from '../../../shared/components/ui/Icon'
import { VariableWeightBadge } from './VariableWeightBadge'
import { memo } from 'react'

export interface ProductCardProps {
  id?: string
  name: string
  image: string
  imageAlt?: string
  price: number
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
  const priceLabel = formatPrice(price, currency)

  return (
    <article
      id={id}
      className={[
        'group relative flex flex-col rounded-2xl border border-brand-border bg-white',
        'shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 overflow-hidden',
        'focus-within:ring-2 focus-within:ring-brand-primary focus-within:ring-offset-2',
        !inStock && 'opacity-60',
        className,
      ].filter(Boolean).join(' ')}
      aria-label={name}
    >
      {/* Badge personalizado */}
      {badge && (
        <span className="absolute left-2.5 top-2.5 z-10 rounded-lg bg-brand-primary px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white shadow-sm">
          {badge}
        </span>
      )}

      {/* Badge agotado */}
      {!inStock && (
        <span className="absolute right-2.5 top-2.5 z-10 rounded-lg bg-gray-800/80 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          Agotado
        </span>
      )}

      {/* Imagen */}
      <div className="relative aspect-square w-full bg-gray-50 flex items-center justify-center overflow-hidden">
        <img
          src={image}
          alt={imageAlt}
          loading="lazy"
          className="h-[85%] w-[85%] object-contain object-center mix-blend-multiply select-none transition-transform duration-300 group-hover:scale-[1.06]"
          draggable={false}
        />
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1.5 px-3 pb-3 pt-2.5">
        <h3 className="text-sm font-medium leading-snug text-brand-dark line-clamp-2">
          {name}
        </h3>

        {is_variable_weight && (
          <VariableWeightBadge compact className="self-start" />
        )}

        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-brand-primary font-bold text-base tabular-nums">
            {priceLabel}
          </span>
          {unit && (
            <span className="text-[11px] text-brand-muted">{unit}</span>
          )}
        </div>

        {/* CTA */}
        <div className="mt-auto pt-1.5">
          {inStock ? (
            <Button
              variant={added ? 'secondary' : 'primary'}
              size="sm"
              onClick={onAdd}
              disabled={disabled}
              loading={loading}
              aria-label={`${added ? 'Quitar' : 'Agregar'} ${name}`}
              className="w-full"
            >
              <Icon name="cart" size="sm" decorative />
              {added ? 'En canasta' : 'Agregar'}
            </Button>
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
