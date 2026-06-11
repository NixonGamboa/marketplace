/*
  OrderDetailPage
  ─────────────────────────────────────────────────────────────────────────────
  Página de detalle de un pedido identificado por :orderId en la URL.
  - Hace polling cada 5 s mientras la pestaña está visible.
  - Muestra stepper OrderTimeline, resumen de items, modalidad y CTA WhatsApp.
  - Accesibilidad: WCAG 2.2 AA — contraste ≥ 7:1 sobre fondo crema brand-bg.

  TASK-014 · AC-1 · AC-2 · AC-3 · AC-4
*/

import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, MapPin, Clock, AlertCircle } from 'lucide-react'

import { orderService } from '../../services/index'
import { WHATSAPP_SUPPORT_NUMBER, MERCHANT_NAME, WA_MESSAGES, TIME_SLOT_LABELS_ORDER } from '../../config/app'
import OrderTimeline from './OrderTimeline'

import type { OrderStatus } from '../../types/orderService'

// ── WhatsApp helpers ──────────────────────────────────────────────────────────

function buildWhatsAppUrl(orderId: string, status: OrderStatus): string {
  const phone   = WHATSAPP_SUPPORT_NUMBER.replace(/\D/g, '')
  const message = encodeURIComponent(WA_MESSAGES[status](orderId))
  return `https://wa.me/${phone}?text=${message}`
}

// ── Date formatter ────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day:    '2-digit',
      month:  'long',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ── Currency formatter ────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style:                 'currency',
    currency:              'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function OrderDetailSkeleton() {
  return (
    <main
      aria-label="Cargando detalle del pedido"
      aria-busy="true"
      className="min-h-screen bg-brand-bg px-4 pt-6 pb-32 max-w-lg mx-auto"
    >
      {/* Header skeleton */}
      <div className="mb-4 space-y-2 animate-pulse">
        <div className="h-6 w-48 bg-gray-200 rounded" />
        <div className="h-4 w-36 bg-gray-200 rounded" />
      </div>

      {/* Cards skeleton */}
      {[80, 140, 100, 72].map((h, i) => (
        <div
          key={i}
          className="mb-3 rounded-xl border border-brand-border bg-brand-surface p-4 animate-pulse"
          style={{ height: h }}
        />
      ))}
    </main>
  )
}

// ── Error / Not Found ─────────────────────────────────────────────────────────

interface ErrorStateProps {
  orderId?: string
  message: string
}

function ErrorState({ orderId, message }: ErrorStateProps) {
  return (
    <main className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-6 text-center gap-4">
      <AlertCircle
        size={48}
        className="text-brand-error"
        aria-hidden
      />
      <h1 className="text-xl font-semibold text-brand-dark">
        {orderId ? `Pedido ${orderId}` : 'Pedido no encontrado'}
      </h1>
      <p className="text-brand-muted text-sm max-w-xs">{message}</p>
      <Link
        to="/"
        className="mt-2 inline-flex items-center justify-center rounded-xl bg-brand-primary px-6 py-3 text-sm font-semibold text-white shadow-brand-sm hover:bg-brand-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary transition-colors"
      >
        Volver al inicio
      </Link>
    </main>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  // AC-1 — useParams
  const { orderId } = useParams<{ orderId: string }>()

  // AC-1 — useQuery with refetchInterval 5000
  const { data: order, isLoading, error } = useQuery({
    queryKey:                   ['order', orderId],
    queryFn:                    () => orderService.getById(orderId!),
    enabled:                    !!orderId,
    refetchInterval:            5_000,
    refetchIntervalInBackground: false,
  })

  // ── Guard: missing orderId param ──────────────────────────────────────────
  if (!orderId) {
    return (
      <ErrorState
        message="No se encontró el identificador del pedido. Verifica el enlace e inténtalo de nuevo."
      />
    )
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return <OrderDetailSkeleton />
  }

  // ── AC-4: Error / not found ───────────────────────────────────────────────
  if (error || !order) {
    return (
      <ErrorState
        orderId={orderId}
        message={
          error
            ? 'No pudimos cargar tu pedido. Verifica tu conexión e intenta de nuevo.'
            : 'No encontramos un pedido con ese identificador.'
        }
      />
    )
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const isPickup        = order.deliveryType === 'pickup'
  const totalItems      = order.items.reduce((sum, item) => sum + item.qty, 0)
  const whatsappHref    = buildWhatsAppUrl(order.orderId, order.status)

  // Build timestamps for OrderTimeline: map updatedAt to current status
  const timestamps: Partial<Record<OrderStatus, string>> = {}
  if (order.createdAt) timestamps['received']  = order.createdAt
  if (order.updatedAt) timestamps[order.status] = order.updatedAt

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main
      aria-label={`Detalle del pedido ${order.orderId}`}
      className="min-h-screen bg-brand-bg px-4 pt-6 pb-36 max-w-lg mx-auto animate-fade-in"
    >

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="mb-4">
        <h1 className="text-lg font-bold text-brand-dark leading-tight">
          Pedido{' '}
          <span className="text-brand-primary font-mono tracking-wide">
            {order.orderId}
          </span>
        </h1>
        <p className="mt-1 text-xs text-brand-muted">
          <time dateTime={order.createdAt}>{formatDate(order.createdAt)}</time>
        </p>
      </header>

      {/* ── Payment notice ─────────────────────────────────────────────────── */}
      {/* AC-2 — mensaje pago efectivo */}
      <div
        role="status"
        className="mb-3 flex items-start gap-3 rounded-xl border border-brand-border bg-brand-surface px-4 py-3 shadow-card"
      >
        <span aria-hidden className="text-lg leading-none">✅</span>
        <p className="text-sm font-medium text-brand-dark">
          Pagas en efectivo cuando llegue tu pedido
        </p>
      </div>

      {/* ── AC-2: OrderTimeline ─────────────────────────────────────────────── */}
      <section
        aria-label="Estado del pedido"
        className="mb-3 rounded-xl border border-brand-border bg-brand-surface px-4 py-4 shadow-card"
      >
        <OrderTimeline
          currentStatus={order.status}
          timestamps={timestamps}
        />
      </section>

      {/* ── Order summary ──────────────────────────────────────────────────── */}
      <section
        aria-label="Resumen del pedido"
        className="mb-3 rounded-xl border border-brand-border bg-brand-surface px-4 py-4 shadow-card space-y-3"
      >
        <h2 className="text-sm font-semibold text-brand-dark">Resumen</h2>

        {/* Products count + total */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-brand-muted">
            {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
          </span>
          <span className="text-sm font-bold text-brand-dark">
            Total:{' '}
            <span className="text-brand-primary">
              {formatCurrency(order.estimatedTotal)}
            </span>
          </span>
        </div>

        {/* Divider */}
        <hr className="border-brand-border" aria-hidden />

        {/* Delivery details */}
        {isPickup ? (
          /* ── Pickup ── */
          <div className="flex items-start gap-2">
            <Clock
              size={16}
              className="mt-0.5 shrink-0 text-brand-muted"
              aria-hidden
            />
            <div>
              <p className="text-xs font-medium text-brand-dark">
                Modalidad: Recoger en tienda
              </p>
              {order.deliveryData.timeSlot && (
                <p className="mt-0.5 text-xs text-brand-muted">
                  {TIME_SLOT_LABELS_ORDER[order.deliveryData.timeSlot]}
                </p>
              )}
            </div>
          </div>
        ) : (
          /* ── Delivery ── */
          <div className="flex items-start gap-2">
            <MapPin
              size={16}
              className="mt-0.5 shrink-0 text-brand-muted"
              aria-hidden
            />
            <div>
              <p className="text-xs font-medium text-brand-dark">
                Modalidad: Domicilio
              </p>
              {order.deliveryData.address && (
                <p className="mt-0.5 text-xs text-brand-muted">
                  {order.deliveryData.address}
                </p>
              )}
              {order.deliveryData.lat != null && order.deliveryData.lng != null && (
                <p className="mt-1 text-xs font-medium text-brand-primary">
                  Ubicación confirmada por GPS
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── AC-3: WhatsApp CTA ─────────────────────────────────────────────── */}
      {/* Fixed to bottom thumb zone for mobile ergonomics (ui-rules.md) */}
      <div className="fixed bottom-0 left-0 right-0 z-60 bg-brand-bg/95 backdrop-blur-sm px-4 py-4 border-t border-brand-border max-w-lg mx-auto">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Contactar a ${MERCHANT_NAME} por WhatsApp sobre el pedido ${order.orderId}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-whatsapp px-6 py-4 text-sm font-bold text-white shadow-brand-md hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-whatsapp active:scale-[0.98] transition-all"
        >
          <MessageCircle size={20} aria-hidden />
          Contactar a {MERCHANT_NAME}
        </a>
      </div>

    </main>
  )
}
