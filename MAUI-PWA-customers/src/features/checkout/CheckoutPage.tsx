/*
  CheckoutPage — MAUI PWA Customers
  ─────────────────────────────────────────────────────────────────────────────
  TASK-011: Checkout con flujo completo

  Estructura vertical (una sola página, sin steps separados):
    1. Resumen del carrito
    2. DeliverySelector
    3. SubstitutionSelector
    4. Aviso Ley 1581 + CTA "Pedir mi Mercado"

  Reglas críticas:
  - clearCart() SOLO tras confirmación exitosa
  - navigate() con replace: true tras éxito
  - CTA texto exacto "Pedir mi Mercado"
  - Pago en efectivo explícito
*/

import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle, ShoppingCart, Banknote } from 'lucide-react'

import { useCartStore } from '@/stores/cartStore'
import { useAuthStore } from '@/stores/authStore'
import { orderService } from '@/services'
import type { OrderPayload } from '@/types/orderService'

import { useCheckoutStore, useIsCheckoutReady } from './checkoutStore'
import DeliverySelector from './DeliverySelector'
import { SubstitutionSelector } from './SubstitutionSelector'

// ─── Utilities ────────────────────────────────────────────────────────────────

const formatPrice = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)

// ─── Component ────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const navigate = useNavigate()

  // ── Stores ────────────────────────────────────────────────────────────────

  const cartItems    = useCartStore((s) => s.items)
  const cartTotal    = useCartStore((s) => s.total)
  const clearCart    = useCartStore((s) => s.clearCart)

  const user         = useAuthStore((s) => s.user)

  const checkout     = useCheckoutStore()
  const isCheckoutReady = useIsCheckoutReady()

  // ── Local UI state ────────────────────────────────────────────────────────

  const [submitError, setSubmitError] = useState<string | null>(null)

  // ── Guard: carrito vacío ──────────────────────────────────────────────────

  if (cartItems.length === 0) {
    return <Navigate to="/" replace />
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const isSubmitting  = checkout.isSubmitting
  const isCtaDisabled = !isCheckoutReady || isSubmitting || cartItems.length === 0

  // ── Submit handler ────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (isCtaDisabled) return

    setSubmitError(null)
    checkout.setSubmitting(true)

    const payload: OrderPayload = {
      items: cartItems.map((item) => ({
        id:             item.productId,
        qty:            item.quantity,
        priceAtMoment:  item.price_at_moment,
      })),
      substitutionPreference: checkout.substitutionPref!,
      deliveryType:           checkout.deliveryMode!,
      deliveryData: {
        address:  checkout.address  ?? undefined,
        lat:      checkout.lat      ?? undefined,
        lng:      checkout.lng      ?? undefined,
        timeSlot: checkout.timeSlot ?? undefined,
      },
      customerName: user?.name ?? 'Cliente',
    }

    try {
      const confirmation = await orderService.submit(payload)
      clearCart()          // SOLO tras éxito
      checkout.reset()
      navigate(`/orden/${confirmation.orderId}`, { replace: true })
    } catch {
      setSubmitError('No pudimos procesar tu pedido. Inténtalo de nuevo.')
      checkout.setSubmitting(false)
      // El carrito NO se destruye — el usuario puede reintentar
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-white px-4 py-3 shadow-sm">
        <Link
          to="/cart"
          aria-label="Volver al carrito"
          className="rounded-lg p-1.5 text-brand-dark hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          <ArrowLeft size={22} aria-hidden="true" />
        </Link>
        <h1 className="text-lg font-semibold text-brand-dark">Tu pedido</h1>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-lg px-4 pb-48 pt-5 space-y-5">

        {/* ── Section 1: Resumen del carrito ──────────────────────────────── */}
        <section
          aria-labelledby="summary-heading"
          className="rounded-2xl border border-brand-border bg-white p-5 shadow-card"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2
              id="summary-heading"
              className="text-base font-semibold text-brand-dark"
            >
              Resumen del carrito
            </h2>
            <Link
              to="/cart"
              className="text-xs font-medium text-brand-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1 rounded"
            >
              Editar carrito
            </Link>
          </div>

          {/* Item list */}
          <ul className="space-y-3" aria-label="Productos en tu carrito">
            {cartItems.map((item) => (
              <li
                key={item.productId}
                className="flex items-start justify-between gap-2 text-sm"
              >
                <span className="flex-1 text-brand-dark leading-snug">
                  {item.name}
                  <span className="ml-1 text-brand-muted">
                    × {item.is_variable_weight ? (item.kilos ?? 1) : item.quantity}
                  </span>
                </span>
                <span className="tabular-nums font-medium text-brand-dark shrink-0">
                  {formatPrice(item.price_at_moment * (item.is_variable_weight ? (item.kilos ?? 1) : item.quantity))}
                </span>
              </li>
            ))}
          </ul>

          {/* Totals */}
          <div className="mt-4 space-y-1.5 border-t border-brand-border pt-3">
            <div className="flex justify-between text-sm text-brand-muted">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatPrice(cartTotal)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-brand-dark">
              <span>Total estimado</span>
              <span className="tabular-nums">{formatPrice(cartTotal)}</span>
            </div>
            <p className="text-xs text-brand-muted">
              * Productos de peso variable pueden ajustarse al momento de pesar.
            </p>
          </div>
        </section>

        {/* ── Section 2: DeliverySelector ─────────────────────────────────── */}
        <section
          aria-labelledby="delivery-section-heading"
          className="rounded-xl border border-brand-border bg-white p-4 shadow-sm"
        >
          {/*
            DeliverySelector already renders its own <h2> via aria-labelledby
            internally, so we use a visually-hidden label here only for the
            outer section landmark.
          */}
          <span id="delivery-section-heading" className="sr-only">
            Entrega
          </span>
          <DeliverySelector />
        </section>

        {/* ── Section 3: SubstitutionSelector ─────────────────────────────── */}
        <section
          aria-labelledby="substitution-section-heading"
          className="rounded-xl border border-brand-border bg-white p-4 shadow-sm"
        >
          <span id="substitution-section-heading" className="sr-only">
            Sustitución de productos
          </span>
          <SubstitutionSelector />
        </section>

      </main>

      {/* ── Fixed bottom zone: pago + aviso legal + CTA ──────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-brand-border bg-white px-4 pb-6 pt-4 shadow-lg">
        <div className="mx-auto max-w-lg space-y-3">

          {/* Pago en efectivo — refuerzo de confianza */}
          <div className="flex items-center gap-2 rounded-xl bg-brand-primary-light px-3 py-2.5">
            <Banknote
              size={18}
              aria-hidden="true"
              className="shrink-0 text-brand-primary"
            />
            <p className="text-xs font-semibold text-brand-primary">
              Pagas en efectivo cuando llegue tu pedido
            </p>
          </div>

          {/* Error de envío */}
          {submitError && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2"
            >
              <AlertCircle
                size={16}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-red-600"
              />
              <p className="text-xs font-medium text-red-700">{submitError}</p>
            </div>
          )}

          {/* Aviso Ley 1581 — AC-3: visible y encima del CTA */}
          <p className="text-center text-[11px] leading-snug text-brand-muted">
            Al confirmar, aceptas el tratamiento de tus datos personales
            conforme a nuestra{' '}
            <span className="font-medium text-brand-dark">
              política de privacidad (Ley 1581 de 2012)
            </span>
            .
          </p>

          {/* CTA principal — AC-2: texto exacto "Pedir mi Mercado" */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isCtaDisabled}
            aria-busy={isSubmitting}
            aria-describedby={submitError ? 'submit-error' : undefined}
            className={[
              'flex w-full min-h-14 items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold text-white transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2',
              isCtaDisabled
                ? 'cursor-not-allowed bg-brand-primary/40'
                : 'bg-brand-primary hover:bg-brand-primary-dark active:scale-[0.98]',
            ].join(' ')}
          >
            {isSubmitting ? (
              <>
                {/* Inline spinner via CSS animation — no extra dep */}
                <span
                  aria-hidden="true"
                  className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white"
                />
                <span>Enviando pedido…</span>
              </>
            ) : (
              <>
                <ShoppingCart size={20} aria-hidden="true" />
                <span>Pedir mi Mercado</span>
              </>
            )}
          </button>

        </div>
      </div>
    </div>
  )
}
