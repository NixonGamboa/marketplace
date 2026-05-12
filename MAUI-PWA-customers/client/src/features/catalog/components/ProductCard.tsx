/*
ProductCard de MAUI
─────────────────────────────────────────────
- Card de producto para el catálogo.
- Contiene:
  - Imagen centrada (fondo blanco).
  - Nombre del producto (máx 2 líneas, texto #120f20).
  - Precio destacado en morado (#7441d8).
  - Unidad/medida en gris claro (#777).
  - Botón "Agregar" con ícono carrito (color morado).
- Layout:
  - Diseño vertical, borde redondeado, sombra ligera.
  - Hover en desktop: elevación sutil.
- Mobile first: cards apiladas en carruseles horizontales.
- Accesibilidad: alt en imágenes, botón con aria-label "Agregar <nombre producto>".
*/
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
  unit?: string // Ej: "kg", "500 g"
  currency?: string // ISO code
  onAdd?: () => void
  added?: boolean
  disabled?: boolean
  loading?: boolean
  inStock?: boolean
  is_variable_weight?: boolean
  /** Mostrar un badge, ej: Local, Fresco */
  badge?: string
  className?: string
}

const formatPrice = (value: number, currency = 'COP') => {
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
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
        'group relative flex flex-col rounded-xl border border-brand-border bg-brand-surface shadow-card hover:shadow-brand-sm transition overflow-hidden',
        'focus-within:ring-2 focus-within:ring-brand-primary focus-within:ring-offset-2 focus-within:ring-offset-brand-surface',
        !inStock && 'opacity-70',
        className,
      ].filter(Boolean).join(' ')}
      aria-label={name}
    >
      {badge && (
        <span className="absolute left-2 top-2 z-10 rounded-md bg-brand-primary px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white shadow">
          {badge}
        </span>
      )}
      {!inStock && (
        <span className="absolute right-2 top-2 z-10 rounded-md bg-brand-error px-2 py-0.5 text-[11px] font-semibold text-white">
          Agotado
        </span>
      )}
      {/* Imagen */}
      <div className="relative aspect-square w-full bg-gray-50 flex items-center justify-center p-4 overflow-hidden">
        <img
          src={image}
          alt={imageAlt}
          loading="lazy"
          className="h-full w-full object-contain object-center mix-blend-multiply select-none transition-transform duration-300 group-hover:scale-[1.04]"
          draggable={false}
        />
      </div>
      {/* Información */}
      <div className="flex flex-1 flex-col gap-2 px-3 pb-3 pt-2">
        <h3 className="text-sm font-medium leading-snug text-brand-dark line-clamp-2 overflow-hidden">
          {name}
        </h3>
        {is_variable_weight && <VariableWeightBadge compact className="self-start" />}
        <div className="flex items-baseline gap-2">
          <span className="text-brand-primary font-semibold text-base">{priceLabel}</span>
          {unit && <span className="text-[12px] text-brand-muted">{unit}</span>}
        </div>
        <div className="mt-auto pt-1">
          {inStock ? (
            <Button
              variant={added ? 'secondary' : 'primary'}
              size="sm"
              onClick={onAdd}
              disabled={disabled}
              loading={loading}
              aria-label={`${added ? 'Quitar' : 'Agregar'} ${name}`}
              className="w-full font-semibold"
            >
              <Icon name="cart" size="sm" decorative />
              {added ? 'En carrito' : 'Agregar'}
            </Button>
          ) : (
            <span className="block text-center text-xs text-brand-muted py-1.5">Sin stock</span>
          )}
        </div>
      </div>
    </article>
  )
}

export default memo(ProductCard)
