import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import type { Product } from '@/types/catalog'
import { useUIStore } from '@/stores/uiStore'

interface ProductDetailSheetProps {
  open: boolean
  onClose: () => void
  id?: string
  name: string
  image: string
  price: number
  originalPrice?: number
  unit?: string
  currency?: string
  description?: string
  nutritionalInfo?: Product['nutritionalInfo']
  availability?: string
  inStock?: boolean
  is_variable_weight?: boolean
  badge?: string
  cartQuantity: number        // cantidad actual en carrito (0 si no está)
  onAdd: (qty: number) => void
  onOpenWeightSheet?: () => void
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

const NUTRITIONAL_LABELS: Array<{
  key: keyof NonNullable<Product['nutritionalInfo']>
  label: string
}> = [
  { key: 'calories', label: 'Calorías' },
  { key: 'protein', label: 'Proteínas' },
  { key: 'fat', label: 'Grasas' },
  { key: 'carbs', label: 'Carbohidratos' },
  { key: 'fiber', label: 'Fibra' },
]

function availabilityChip(availability: string) {
  if (availability === 'Disponible') return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
  if (availability === 'Pocas unidades') return 'bg-amber-50 text-amber-700 border border-amber-200'
  return 'bg-gray-100 text-gray-500 border border-gray-200'
}

export function ProductDetailSheet({
  open,
  onClose,
  name,
  image,
  price,
  originalPrice,
  unit,
  currency = 'COP',
  description,
  nutritionalInfo,
  availability,
  inStock = true,
  is_variable_weight = false,
  badge,
  cartQuantity,
  onAdd,
  onOpenWeightSheet,
}: ProductDetailSheetProps) {
  const titleId = useId()
  const setBottomSheetOpen = useUIStore((s) => s.setBottomSheetOpen)
  const [localQty, setLocalQty] = useState(() => Math.max(1, cartQuantity))

  useEffect(() => {
    setBottomSheetOpen(open)
    return () => { if (open) setBottomSheetOpen(false) }
  }, [open, setBottomSheetOpen])

  // Sincronizar con carrito al abrir
  useEffect(() => {
    if (open) setLocalQty(Math.max(1, cartQuantity))
  }, [open, cartQuantity])

  // Scroll lock
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Escape
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const priceLabel = formatPrice(price, currency)
  const originalLabel = originalPrice ? formatPrice(originalPrice, currency) : null
  const totalLabel = formatPrice(price * localQty, currency)
  const discountPct =
    originalPrice && originalPrice > price
      ? Math.round((1 - price / originalPrice) * 100)
      : null
  const hasNutritionalContent =
    nutritionalInfo &&
    NUTRITIONAL_LABELS.some(({ key }) => nutritionalInfo[key] !== undefined)

  // Si el producto ya está en carrito se puede bajar hasta 0 (eliminar)
  const canRemove = cartQuantity > 0
  const minQty = canRemove ? 0 : 1

  const handleAdd = () => {
    onAdd(localQty)
    onClose()
  }

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/40 animate-fade-in"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-elevated max-w-[640px] mx-auto animate-slide-in-bottom flex flex-col"
        style={{ height: '90dvh' }}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 shrink-0" aria-hidden="true" />

        {/* Botón cerrar */}
        <button
          type="button"
          aria-label="Cerrar detalle del producto"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
        >
          <X size={20} className="text-brand-dark" aria-hidden="true" />
        </button>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto">
          {/* Imagen */}
          <div className="relative w-full aspect-[4/3] bg-gray-50 flex items-center justify-center overflow-hidden">
            <img
              src={image}
              alt={name}
              className="w-full h-full object-contain mix-blend-multiply"
              draggable={false}
            />
            {discountPct && inStock && (
              <span className="absolute left-3 top-3 z-10 rounded-full bg-brand-primary px-2.5 py-1 text-[11px] font-bold text-white shadow-brand-sm">
                -{discountPct}%
              </span>
            )}
            {badge && !discountPct && (
              <span
                className={[
                  'absolute left-3 top-3 z-10 rounded-lg px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white shadow-brand-sm',
                  badge === 'Local' ? 'bg-emerald-600' : 'bg-brand-primary',
                ].join(' ')}
              >
                {badge}
              </span>
            )}
          </div>

          <div className="px-5">
            {/* Nombre */}
            <h2 id={titleId} className="text-xl font-bold text-brand-dark mt-4 leading-snug">
              {name}
            </h2>

            {/* Unidad */}
            {unit && <p className="text-sm text-brand-muted mt-0.5">{unit}</p>}

            {/* Precio */}
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-brand-primary font-bold text-2xl tabular-nums">
                {priceLabel}
              </span>
              {originalLabel && (
                <span className="text-sm text-brand-muted line-through tabular-nums">
                  {originalLabel}
                </span>
              )}
            </div>

            {/* Disponibilidad */}
            {availability && (
              <span
                className={[
                  'inline-block mt-3 px-2.5 py-1 rounded-full text-xs font-semibold',
                  availabilityChip(availability),
                ].join(' ')}
              >
                {availability}
              </span>
            )}

            {/* Descripción */}
            {description && (
              <p className="text-sm text-brand-dark leading-relaxed mt-3">{description}</p>
            )}

            {/* Información nutricional */}
            {hasNutritionalContent && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-brand-dark mb-2">
                  Información nutricional
                </h3>
                {nutritionalInfo!.serving && (
                  <p className="text-xs text-brand-muted mb-2">{nutritionalInfo!.serving}</p>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 bg-gray-50 rounded-xl p-3 border border-brand-border">
                  {NUTRITIONAL_LABELS.filter(({ key }) => nutritionalInfo![key] !== undefined).map(({ key, label }) => (
                    <div key={key}>
                      <p className="text-[10px] text-brand-muted uppercase tracking-wide leading-none mb-0.5">
                        {label}
                      </p>
                      <p className="text-sm font-semibold text-brand-dark tabular-nums">
                        {key === 'calories' ? `${nutritionalInfo![key]} kcal` : nutritionalInfo![key]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pb-6" />
          </div>
        </div>

        {/* Footer sticky */}
        <div
          className="shrink-0 border-t border-brand-border px-5 py-4 flex items-center gap-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
        >
          {inStock && !is_variable_weight && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                aria-label={localQty === 1 && canRemove ? 'Eliminar del carrito' : 'Disminuir cantidad'}
                onClick={() => setLocalQty((q) => Math.max(minQty, q - 1))}
                disabled={localQty <= minQty}
                className={[
                  'w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                  localQty === 1 && canRemove
                    ? 'bg-red-50 text-red-500 hover:bg-red-100 focus-visible:ring-red-400'
                    : 'bg-[rgba(91,61,245,0.08)] text-brand-primary hover:bg-[rgba(91,61,245,0.14)] focus-visible:ring-brand-primary',
                ].join(' ')}
              >
                {localQty === 1 && canRemove
                  ? <Trash2 size={15} aria-hidden="true" />
                  : <Minus size={15} aria-hidden="true" />
                }
              </button>
              <span className="text-base font-bold text-brand-dark tabular-nums min-w-[1.5rem] text-center">
                {localQty}
              </span>
              <button
                type="button"
                aria-label="Aumentar cantidad"
                onClick={() => setLocalQty((q) => q + 1)}
                className="w-9 h-9 rounded-full bg-[rgba(91,61,245,0.12)] flex items-center justify-center text-brand-primary transition-colors hover:bg-[rgba(91,61,245,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1"
              >
                <Plus size={15} aria-hidden="true" />
              </button>
            </div>
          )}

          {inStock ? (
            is_variable_weight ? (
              <button
                type="button"
                onClick={onOpenWeightSheet}
                className="flex-1 py-3.5 rounded-xl bg-brand-primary hover:bg-brand-primary-dark text-white font-semibold text-sm shadow-brand-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 flex items-center justify-center gap-2"
              >
                <ShoppingCart size={18} aria-hidden="true" />
                Seleccionar cantidad
              </button>
            ) : localQty === 0 ? (
              <button
                type="button"
                onClick={handleAdd}
                className="flex-1 py-3.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 flex items-center justify-center gap-2"
              >
                <Trash2 size={18} aria-hidden="true" />
                Eliminar del carrito
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAdd}
                className="flex-1 py-3.5 rounded-xl bg-brand-primary hover:bg-brand-primary-dark text-white font-semibold text-sm shadow-brand-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 flex items-center justify-between px-4"
              >
                <span className="flex items-center gap-2">
                  <ShoppingCart size={18} aria-hidden="true" />
                  Agregar al carrito
                </span>
                <span className="tabular-nums">{totalLabel}</span>
              </button>
            )
          ) : (
            <button
              type="button"
              disabled
              className="flex-1 py-3.5 rounded-xl bg-gray-200 text-gray-400 font-semibold text-sm cursor-not-allowed"
            >
              Sin stock
            </button>
          )}
        </div>
      </div>
    </>,
    document.body,
  )
}
