/*
  CheckoutPage — MAUI PWA Customers
  Wizard de 3 pasos con transición lateral.

  Invariantes críticos:
  - clearCart() SOLO tras confirmación exitosa del servicio (nunca en catch)
  - navigate() con replace:true para que el botón atrás del SO no regrese al checkout
*/

import { useState, useEffect } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  AlertCircle,
  ShoppingCart,
  Banknote,
  MessageCircle,
  StickyNote,
  ChevronRight,
  ChevronDown,
  Lock,
  MapPin,
  Clock,
  ShieldCheck,
} from 'lucide-react'

import { useCartStore } from '@/stores/cartStore'
import { useAuthStore } from '@/stores/authStore'
import { orderService } from '@/services'
import type { OrderPayload } from '@/types/orderService'

import { useCheckoutStore, useIsCheckoutReady, useIsDeliveryReady } from './checkoutStore'
import type { TimeSlot } from './checkoutStore'
import { TIME_SLOT_LABELS } from '@/config/app'
import DeliverySelector from './DeliverySelector'
import { SubstitutionSelector } from './SubstitutionSelector'
import { calculateShipping } from './shipping'
import { formatPrice } from '@/shared/utils/formatPrice'

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 0 | 1 | 2
type AnimDir = 'right' | 'left'

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Format phone: "+573001234567" → "300 123 4567" */
function formatPhone(raw: string | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/^\+57/, '').replace(/\D/g, '')
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  }
  return raw
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

type StepStatus = 'done' | 'active' | 'pending'

interface CheckoutStepperProps {
  step: WizardStep
  onStepClick: (idx: WizardStep) => void
}

function CheckoutStepper({ step, onStepClick }: CheckoutStepperProps) {
  const labels = ['Resumen', 'Entrega', 'Pago'] as const

  return (
    <nav aria-label="Progreso del pedido" className="flex items-start w-full">
      {labels.map((label, idx) => {
        const status: StepStatus =
          idx < step ? 'done' : idx === step ? 'active' : 'pending'
        const isClickable = idx < step
        const isLast = idx === labels.length - 1

        return (
          <div key={label} className={['flex items-start', isLast ? '' : 'flex-1'].join(' ')}>
            {/* Step node + label (fixed width so the label centers under the node) */}
            <div className="flex flex-col items-center gap-1 shrink-0 w-20">
              {isClickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick(idx as WizardStep)}
                  aria-label={`Volver a ${label}`}
                  className={[
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1',
                    'bg-brand-primary text-white',
                  ].join(' ')}
                >
                  ✓
                </button>
              ) : (
                <span
                  aria-current={status === 'active' ? 'step' : undefined}
                  className={[
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
                    status === 'active'
                      ? 'bg-brand-primary text-white ring-2 ring-brand-primary/30 ring-offset-1'
                      : 'bg-gray-200 text-gray-400',
                  ].join(' ')}
                >
                  {idx + 1}
                </span>
              )}
              <span
                className={[
                  'text-[11px] font-medium text-center',
                  status === 'pending' ? 'text-gray-400' : 'text-brand-primary',
                ].join(' ')}
              >
                {label}
              </span>
            </div>

            {/* Connector line — fills space between this node and the next */}
            {!isLast && (
              <div
                aria-hidden="true"
                className={[
                  'flex-1 h-0.5 rounded-full mt-3.5 transition-colors',
                  status === 'done' ? 'bg-brand-primary' : 'bg-gray-200',
                ].join(' ')}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}

// ─── Step 0: Resumen ──────────────────────────────────────────────────────────

interface StepResumenProps {
  animClass: string
}

function StepResumen({ animClass }: StepResumenProps) {
  const cartItems = useCartStore((s) => s.items)
  const cartTotal = useCartStore((s) => s.total)
  const [expanded, setExpanded] = useState(false)

  const shipping = calculateShipping(cartTotal)
  const totalWithShipping = cartTotal + shipping.cost

  return (
    <section
      aria-labelledby="step-resumen-heading"
      className={['space-y-4', animClass].join(' ')}
    >
      {/* Lista de productos */}
      <div className="rounded-2xl border border-brand-border bg-white shadow-card overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="resumen-items"
          className="flex w-full items-center justify-between px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary"
        >
          <div className="flex items-center gap-2.5">
            <ShoppingCart
              size={18}
              aria-hidden="true"
              className="text-brand-primary flex-shrink-0"
            />
            <h2
              id="step-resumen-heading"
              className="text-[15px] sm:text-base font-semibold text-brand-dark"
            >
              {cartItems.length} {cartItems.length === 1 ? 'producto' : 'productos'}
            </h2>
          </div>

          <div className="flex items-center gap-1 text-brand-primary text-sm font-medium">
            <span>{expanded ? 'Ocultar' : 'Ver detalles'}</span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={[
                'transition-transform duration-200',
                expanded ? 'rotate-180' : '',
              ].join(' ')}
            />
          </div>
        </button>

        {expanded && (
          <ul
            id="resumen-items"
            className="animate-slide-in-top space-y-3 px-5 pb-3 border-t border-brand-border pt-3"
            aria-label="Productos en tu carrito"
          >
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
                  {formatPrice(
                    item.price_at_moment *
                      (item.is_variable_weight ? (item.kilos ?? 1) : item.quantity),
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Totals */}
        <div className="px-5 pb-4 pt-3 space-y-1.5 border-t border-brand-border">
          <div className="flex justify-between text-sm text-brand-muted">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatPrice(cartTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-brand-muted">Envío</span>
            {shipping.isFree ? (
              <span className="font-semibold text-brand-primary">Gratis</span>
            ) : (
              <span className="tabular-nums text-brand-dark">
                {formatPrice(shipping.cost)}
              </span>
            )}
          </div>
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-sm font-semibold text-brand-dark">Total estimado</span>
            <span className="tabular-nums text-xl font-bold text-brand-primary">
              {formatPrice(totalWithShipping)}
            </span>
          </div>
          <p className="text-[10px] text-brand-muted leading-snug">
            * Productos de peso variable pueden ajustarse al momento de pesar.
          </p>
        </div>
      </div>

      {/* SubstitutionSelector — el componente trae su propio layout multi-card */}
      <SubstitutionSelector />
    </section>
  )
}

// ─── Step 1: Entrega ──────────────────────────────────────────────────────────

function StepEntrega({ animClass }: { animClass: string }) {
  const user = useAuthStore((s) => s.user)
  const [localNote,     setLocalNote]     = useState('')
  const [notesExpanded, setNotesExpanded] = useState(false)

  return (
    <section
      aria-labelledby="step-entrega-heading"
      className={['space-y-4', animClass].join(' ')}
    >
      <span id="step-entrega-heading" className="sr-only">
        Entrega
      </span>

      {/* DeliverySelector */}
      <div className="rounded-2xl border border-brand-border bg-white p-5 shadow-card">
        <DeliverySelector />
      </div>

      {/* Tarjeta WhatsApp */}
      <section
        aria-labelledby="whatsapp-heading"
        className="rounded-2xl border border-brand-border bg-white px-5 py-4 shadow-card"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              aria-hidden="true"
              className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-[#25D366]/10"
            >
              <MessageCircle size={20} className="text-brand-whatsapp" />
            </span>
            <div className="min-w-0">
              <p id="whatsapp-heading" className="text-sm font-semibold text-brand-dark">
                WhatsApp
              </p>
              <p className="text-xs text-brand-muted mt-0.5">
                Te avisaremos sobre tu pedido.
              </p>
              <p className="text-sm font-medium text-brand-dark tabular-nums mt-0.5">
                {formatPhone(user?.phone ?? '')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => alert('Función disponible próximamente')}
            className="flex-shrink-0 rounded-lg border border-brand-border px-3 py-1.5 text-xs font-semibold text-brand-primary transition-colors hover:bg-brand-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          >
            Editar
          </button>
        </div>
      </section>

      {/* Tarjeta Notas */}
      <section
        aria-labelledby="notes-heading"
        className="rounded-2xl border border-brand-border bg-white shadow-card overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setNotesExpanded((v) => !v)}
          aria-expanded={notesExpanded}
          aria-controls="notes-content"
          className="flex w-full items-center gap-3 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary"
        >
          <span
            aria-hidden="true"
            className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100"
          >
            <StickyNote size={18} className="text-brand-muted" />
          </span>
          <div className="flex-1 min-w-0">
            <p id="notes-heading" className="text-sm font-semibold text-brand-dark">
              ¿Algún cambio o nota para tu pedido?
            </p>
            <p className="text-xs text-brand-muted mt-0.5 truncate">
              {localNote.trim()
                ? localNote
                : 'Ej: Sin cilantro, llamar al llegar, dejar en portería.'}
            </p>
          </div>
          <ChevronRight
            size={18}
            aria-hidden="true"
            className={[
              'flex-shrink-0 text-brand-muted transition-transform duration-200',
              notesExpanded ? 'rotate-90' : '',
            ].join(' ')}
          />
        </button>

        {notesExpanded && (
          <div id="notes-content" className="animate-slide-in-top px-5 pb-5 pt-1">
            <label htmlFor="order-notes" className="sr-only">
              Notas para tu pedido
            </label>
            <textarea
              id="order-notes"
              value={localNote}
              onChange={(e) => setLocalNote(e.target.value)}
              placeholder="Ej: Sin cilantro, llamar al llegar, dejar en portería."
              rows={3}
              className={[
                'w-full resize-none rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm text-brand-dark placeholder:text-gray-400 outline-none transition',
                'focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/40',
              ].join(' ')}
            />
            <p className="mt-1.5 text-[11px] text-brand-muted">
              Solo es una nota para el equipo. No afecta tu pedido.
            </p>
          </div>
        )}
      </section>
    </section>
  )
}

// ─── Step 2: Pago ─────────────────────────────────────────────────────────────

interface StepPagoProps {
  animClass: string
  submitError: string | null
  isSubmitting: boolean
}

function StepPago({ animClass, submitError, isSubmitting }: StepPagoProps) {
  const cartTotal      = useCartStore((s) => s.total)
  const user           = useAuthStore((s) => s.user)
  const deliveryMode   = useCheckoutStore((s) => s.deliveryMode)
  const address        = useCheckoutStore((s) => s.address)
  const timeSlot       = useCheckoutStore((s) => s.timeSlot)

  const shipping = calculateShipping(cartTotal)
  const totalWithShipping = cartTotal + shipping.cost

  const deliverySummary =
    deliveryMode === 'delivery'
      ? `Entregamos en: ${address ?? ''}`
      : deliveryMode === 'pickup' && timeSlot
        ? `Recoges en tienda — ${TIME_SLOT_LABELS[timeSlot]}`
        : 'Entrega pendiente'

  return (
    <section
      aria-labelledby="step-pago-heading"
      className={['space-y-4', animClass].join(' ')}
    >
      <h2 id="step-pago-heading" className="sr-only">
        Confirmación y pago
      </h2>

      {/* Mini-resumen de lo elegido */}
      <div className="rounded-2xl border border-brand-border bg-white px-5 py-4 shadow-card space-y-3">
        <h3 className="text-sm font-semibold text-brand-dark">Resumen de tu pedido</h3>

        {/* Entrega */}
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-brand-primary/10 mt-0.5"
          >
            {deliveryMode === 'pickup' ? (
              <Clock size={16} className="text-brand-primary" />
            ) : (
              <MapPin size={16} className="text-brand-primary" />
            )}
          </span>
          <p className="text-sm text-brand-dark leading-snug">{deliverySummary}</p>
        </div>

        {/* WhatsApp */}
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-[#25D366]/10 mt-0.5"
          >
            <MessageCircle size={16} className="text-brand-whatsapp" />
          </span>
          <p className="text-sm text-brand-dark leading-snug">
            Te avisamos por WhatsApp al{' '}
            <span className="font-semibold tabular-nums">
              {formatPhone(user?.phone ?? '')}
            </span>
          </p>
        </div>

        {/* Totales con envío */}
        <div className="pt-2 border-t border-brand-border space-y-1">
          <div className="flex justify-between text-xs text-brand-muted">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatPrice(cartTotal)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-brand-muted">Envío</span>
            {shipping.isFree ? (
              <span className="font-semibold text-brand-primary">Gratis</span>
            ) : (
              <span className="tabular-nums text-brand-dark">{formatPrice(shipping.cost)}</span>
            )}
          </div>
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-sm font-semibold text-brand-dark">Total a pagar</span>
            <span className="tabular-nums text-2xl font-bold text-brand-primary">
              {formatPrice(totalWithShipping)}
            </span>
          </div>
        </div>
      </div>

      {/* Pago en efectivo */}
      <div className="flex items-center gap-2 rounded-xl bg-brand-primary-light px-3 py-2.5">
        <Banknote size={18} aria-hidden="true" className="shrink-0 text-brand-primary" />
        <p className="text-xs font-semibold text-brand-primary">
          Pagas en efectivo cuando llegue tu pedido
        </p>
      </div>

      {/* Error de envío (también visible aquí para feedback en paso 2) */}
      {submitError && !isSubmitting && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5"
        >
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-red-600" />
          <p className="text-xs font-medium text-red-700">{submitError}</p>
        </div>
      )}

      {/* Aviso Ley 1581 */}
      <p className="text-center text-[10px] leading-snug text-brand-muted">
        Al confirmar, aceptas el tratamiento de tus datos personales conforme a nuestra{' '}
        <span className="font-medium text-brand-dark">
          política de privacidad (Ley 1581 de 2012)
        </span>
        .
      </p>
    </section>
  )
}

// ─── CheckoutPage ─────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const navigate = useNavigate()

  // ── Stores ────────────────────────────────────────────────────────────────

  const cartItems       = useCartStore((s) => s.items)
  const cartTotal       = useCartStore((s) => s.total)
  const clearCart       = useCartStore((s) => s.clearCart)

  const user            = useAuthStore((s) => s.user)

  const checkout        = useCheckoutStore()
  const isCheckoutReady = useIsCheckoutReady()

  // ── Local UI state ────────────────────────────────────────────────────────

  const [step,          setStep]          = useState<WizardStep>(0)
  const [animDir,       setAnimDir]       = useState<AnimDir>('right')
  const [animKey,       setAnimKey]       = useState(0)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ── Scroll to top on step change ─────────────────────────────────────────

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])

  // ── Guard: carrito vacío ──────────────────────────────────────────────────

  if (cartItems.length === 0) {
    return <Navigate to="/" replace />
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const isSubmitting = checkout.isSubmitting

  const isStep1Ready = useIsDeliveryReady()

  const isCtaDisabled =
    step === 0
      ? false                                        // always enabled on step 0
      : step === 1
        ? !isStep1Ready                              // delivery readiness
        : !isCheckoutReady || isSubmitting

  // ── Navigation helpers ────────────────────────────────────────────────────

  function navigateTo(target: WizardStep) {
    const dir: AnimDir = target > step ? 'right' : 'left'
    setAnimDir(dir)
    setAnimKey((k) => k + 1)
    setStep(target)
  }

  function goNext() {
    if (step < 2) navigateTo((step + 1) as WizardStep)
  }

  function goBack() {
    if (step > 0) navigateTo((step - 1) as WizardStep)
  }

  // ── Submit handler ────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (isCtaDisabled) return

    setSubmitError(null)
    checkout.setSubmitting(true)

    const payload: OrderPayload = {
      items: cartItems.map((item) => ({
        id:            item.productId,
        qty:           item.quantity,
        priceAtMoment: item.price_at_moment,
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

  // ── CTA action + label ────────────────────────────────────────────────────

  const ctaAction = step === 2 ? handleSubmit : goNext
  const ctaLabel  = step === 2 ? 'Pedir mi Mercado' : 'Continuar'

  // ── Animation class ───────────────────────────────────────────────────────

  const animClass = animDir === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-brand-bg">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-white px-4 py-3 shadow-sm">
        {step === 0 ? (
          <Link
            to="/cart"
            aria-label="Volver al carrito"
            className="rounded-lg p-1.5 text-brand-dark hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          >
            <ArrowLeft size={22} aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={goBack}
            aria-label="Volver al paso anterior"
            className="rounded-lg p-1.5 text-brand-dark hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          >
            <ArrowLeft size={22} aria-hidden="true" />
          </button>
        )}
        <h1 className="text-base sm:text-lg font-semibold text-brand-dark">Tu pedido</h1>
      </header>

      {/* ── Stepper ───────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-brand-border px-4 py-4">
        <div className="mx-auto max-w-lg">
          <CheckoutStepper step={step} onStepClick={navigateTo} />
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-lg px-4 pb-44 pt-5 overflow-x-hidden">
        {/* key triggers re-mount (and animation) on every step change */}
        <div key={animKey} className="will-change-transform">
          {step === 0 && <StepResumen animClass={animClass} />}
          {step === 1 && <StepEntrega animClass={animClass} />}
          {step === 2 && (
            <StepPago
              animClass={animClass}
              submitError={submitError}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </main>

      {/* ── Footer sticky ─────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-brand-border bg-white px-4 pt-3 pb-5 shadow-elevated">
        <div className="mx-auto max-w-lg space-y-3">

          {/* Total + CTA row */}
          <div className="flex items-center justify-between gap-3">
            {/* Total a pagar */}
            <div className="flex flex-col min-w-0 flex-shrink-0">
              <span className="text-[11px] font-medium text-brand-muted leading-none">
                Total a pagar
              </span>
              <span className="tabular-nums text-xl font-bold text-brand-primary leading-tight mt-0.5">
                {formatPrice(cartTotal + calculateShipping(cartTotal).cost)}
              </span>
            </div>

            {/* CTA principal */}
            <button
              type="button"
              onClick={ctaAction}
              disabled={isCtaDisabled}
              aria-busy={step === 2 ? isSubmitting : undefined}
              className={[
                'flex flex-shrink-0 ml-auto min-h-11 min-w-44 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2',
                isCtaDisabled
                  ? 'cursor-not-allowed opacity-50 bg-brand-primary'
                  : 'bg-gradient-to-r from-brand-primary to-brand-secondary shadow-brand-sm hover:shadow-brand-md active:scale-[0.98]',
              ].join(' ')}
            >
              {step === 2 && isSubmitting ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white flex-shrink-0"
                  />
                  <span>Enviando…</span>
                </>
              ) : (
                <>
                  {step === 2 && (
                    <ShoppingCart size={16} aria-hidden="true" className="flex-shrink-0" />
                  )}
                  <span>{ctaLabel}</span>
                </>
              )}
            </button>
          </div>

          {/* Trust signals — solo en paso de Pago */}
          {step === 2 && (
            <div
              aria-label="Señales de confianza"
              className="flex items-center justify-between gap-2 px-1"
            >
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-brand-muted">
                <ShieldCheck size={13} aria-hidden="true" className="text-brand-primary" />
                Pago seguro
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-brand-muted">
                <Lock size={13} aria-hidden="true" className="text-brand-primary" />
                Datos protegidos
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-brand-muted">
                <MessageCircle size={13} aria-hidden="true" className="text-brand-whatsapp" />
                ¿Dudas? Escríbenos
              </span>
            </div>
          )}

        </div>
      </div>

    </div>
  )
}
