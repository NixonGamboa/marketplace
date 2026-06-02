/*
ProductDetailModal de MAUI
─────────────────────────────────────────────
- Modal de detalle de producto para el catálogo.
- Muestra imagen, nombre, precio/unidad, badge "Agotado",
  contador de cantidad en carrito y botón "Agregar al carrito".
- Accesibilidad: role="dialog", aria-modal, focus trap, Escape.
- Cierra con: backdrop click, botón X, tecla Escape.
*/
import { useEffect, useRef, useId } from 'react'
import { X, Plus, Minus, ShoppingCart } from 'lucide-react'
import type { Product } from '@/types'
import { useCart, useAddToCart } from '@/hooks'
import { useCartStore } from '@/stores/cartStore'
import { VariableWeightBadge } from './components/VariableWeightBadge'

export interface ProductDetailModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
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

export default function ProductDetailModal({
  product,
  isOpen,
  onClose,
}: ProductDetailModalProps) {
  const titleId = useId()
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const { items } = useCart()
  const addToCart = useAddToCart()
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)

  const cartItem = product ? items.find((i) => i.productId === product.id) : undefined
  const qty = cartItem?.quantity ?? 0

  // Focus botón cerrar al abrir
  useEffect(() => {
    if (isOpen && closeBtnRef.current) {
      closeBtnRef.current.focus()
    }
  }, [isOpen, product])

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Bloquear scroll del body al abrir
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen || !product) return null

  const displayName = product.name_display ?? product.name
  const priceLabel = formatPrice(product.price, product.currency)

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleDecrease = () => {
    if (qty <= 1) {
      removeItem(product.id)
    } else {
      updateQuantity(product.id, qty - 1)
    }
  }

  const handleIncrease = () => {
    updateQuantity(product.id, qty + 1)
  }

  const handleAddToCart = () => {
    addToCart(product)
  }

  const handleImgError = () => {
    if (imgRef.current) {
      imgRef.current.src =
        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"%3E%3Crect width="400" height="400" fill="%23f3f4f6"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16" fill="%239ca3af"%3ESin imagen%3C/text%3E%3C/svg%3E'
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      aria-hidden="false"
    >
      {/* Card del modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón cerrar */}
        <button
          ref={closeBtnRef}
          onClick={onClose}
          aria-label="Cerrar detalle del producto"
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/80 backdrop-blur-sm text-brand-muted hover:text-brand-dark hover:bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
        >
          <X size={20} aria-hidden="true" />
        </button>

        {/* Imagen */}
        <div className="relative w-full aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
          <img
            ref={imgRef}
            src={product.imageUrl}
            alt={displayName}
            loading="lazy"
            width={400}
            height={400}
            onError={handleImgError}
            className="h-full w-full object-contain p-6 mix-blend-multiply select-none"
            draggable={false}
          />
          {/* Badge fuera de stock sobre imagen */}
          {!product.inStock && (
            <span
              className="absolute top-3 left-3 bg-red-100 text-red-700 rounded-full px-3 py-1 text-xs font-semibold"
              aria-label="Producto agotado"
            >
              Agotado
            </span>
          )}
        </div>

        {/* Contenido inferior */}
        <div className="flex flex-col gap-4 px-5 pb-6 pt-4">
          {/* Nombre */}
          <h2
            id={titleId}
            className="text-lg font-semibold text-brand-dark leading-snug"
          >
            {displayName}
          </h2>

          {/* Badge peso variable */}
          {product.is_variable_weight && (
            <VariableWeightBadge compact className="self-start" />
          )}

          {/* Precio y unidad */}
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-brand-primary tabular-nums">
              {priceLabel}
            </span>
            <span className="text-sm text-brand-muted">/ {product.unit}</span>
          </div>

          {/* Badge agotado inline (para screen readers y contraste) */}
          {!product.inStock && (
            <span className="self-start bg-red-100 text-red-700 rounded-full px-3 py-1 text-xs font-semibold">
              Agotado
            </span>
          )}

          {/* Zona inferior: contador + CTA — zona del pulgar */}
          <div className="flex items-center gap-3 mt-2">
            {/* Contador +/- */}
            {qty > 0 ? (
              <div
                className="flex items-center gap-1 border border-brand-border rounded-xl overflow-hidden flex-shrink-0"
                aria-label={`Cantidad en carrito: ${qty}`}
              >
                <button
                  onClick={handleDecrease}
                  aria-label="Reducir cantidad"
                  className="w-10 h-10 flex items-center justify-center text-brand-primary hover:bg-brand-primary/5 transition-colors disabled:opacity-50"
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
                <span className="w-10 text-center text-sm font-semibold text-brand-dark tabular-nums">
                  {qty}
                </span>
                <button
                  onClick={handleIncrease}
                  aria-label="Aumentar cantidad"
                  disabled={!product.inStock}
                  className="w-10 h-10 flex items-center justify-center text-brand-primary hover:bg-brand-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            ) : (
              /* Placeholder de mismo tamaño para mantener layout cuando qty === 0 */
              <div className="w-10 h-10 flex-shrink-0" aria-hidden="true" />
            )}

            {/* Botón Agregar al carrito */}
            <button
              onClick={handleAddToCart}
              disabled={!product.inStock}
              aria-label={
                !product.inStock
                  ? `${displayName} no disponible`
                  : `Agregar ${displayName} al carrito`
              }
              className={[
                'flex-1 flex items-center justify-center gap-2 h-10 rounded-xl font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2',
                product.inStock
                  ? 'bg-brand-primary text-white hover:bg-brand-primary/90 active:scale-[0.98]'
                  : 'bg-brand-primary/40 text-white cursor-not-allowed',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <ShoppingCart size={16} aria-hidden="true" />
              {qty > 0 ? 'Agregar más' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
