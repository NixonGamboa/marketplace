import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { Order, OrderStatus } from '@/types/order'
import { getOrderById, updateOrderStatus } from '@/lib/localStorage'
import StatusBadge from './StatusBadge'
import WhatsAppLink from './WhatsAppLink'

// ---------------------------------------------------------------------------
// State-machine
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<OrderStatus, OrderStatus | null> = {
  received:  'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready:     'delivered',
  delivered: null,
}

const TRANSITION_LABELS: Record<OrderStatus, string> = {
  received:  'Confirmar pedido',
  confirmed: 'Marcar como preparando',
  preparing: 'Marcar como listo',
  ready:     'Marcar como entregado',
  delivered: '',
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}

// ---------------------------------------------------------------------------
// Substitution labels
// ---------------------------------------------------------------------------

const SUBSTITUTION_LABELS: Record<Order['substitutionPreference'], string> = {
  call_me: 'Llamar antes de cambiar',
  similar: 'Cambiar por producto similar',
  remove:  'Quitar del pedido',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>()
  const [order, setOrder] = useState<Order | null>(null)

  useEffect(() => {
    if (orderId) {
      setOrder(getOrderById(orderId))
    }
  }, [orderId])

  if (!order) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-600 mb-4">Pedido no encontrado.</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 font-medium"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Volver a pedidos
        </Link>
      </div>
    )
  }

  const { deliveryType, deliveryData, substitutionPreference, items, estimatedTotal, createdAt, status, customerName } = order

  const nextStatus = TRANSITIONS[status]
  const showWhatsApp = status !== 'received'

  function handleAdvance() {
    if (!order) return
    const next = TRANSITIONS[order.status]
    if (!next) return
    const updated = updateOrderStatus(order.orderId, next)
    if (updated) setOrder(updated)
  }

  return (
    <article aria-label={`Detalle del pedido ${order.orderId}`}>
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Volver
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Pedido {order.orderId}</h2>
            <p className="text-sm text-gray-600 mt-0.5">Cliente: {customerName}</p>
            <p className="text-sm text-gray-500 mt-0.5">Fecha: {formatDate(createdAt)}</p>
          </div>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Delivery */}
      <section aria-labelledby="delivery-heading" className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h3 id="delivery-heading" className="font-semibold text-gray-800 mb-2">Modalidad</h3>
        {deliveryType === 'pickup' ? (
          <div className="text-sm text-gray-700 space-y-1">
            <p>Retiro en tienda</p>
            {deliveryData.timeSlot && (
              <p className="text-gray-500">
                Horario preferido:{' '}
                {deliveryData.timeSlot === 'morning'
                  ? 'Mañana'
                  : deliveryData.timeSlot === 'afternoon'
                  ? 'Tarde'
                  : 'Lo antes posible'}
              </p>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-700 space-y-1">
            <p>Domicilio</p>
            {deliveryData.address && <p className="text-gray-500">{deliveryData.address}</p>}
            {deliveryData.lat != null && deliveryData.lng != null && (
              <p className="inline-flex items-center gap-1 text-green-700 font-medium text-xs">
                GPS confirmado
              </p>
            )}
          </div>
        )}
      </section>

      {/* Substitution */}
      <section aria-labelledby="substitution-heading" className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h3 id="substitution-heading" className="font-semibold text-gray-800 mb-2">Sustitución</h3>
        <p className="text-sm text-gray-700">{SUBSTITUTION_LABELS[substitutionPreference]}</p>
      </section>

      {/* Items */}
      <section aria-labelledby="items-heading" className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h3 id="items-heading" className="font-semibold text-gray-800 mb-3">
          Items ({items.length})
        </h3>
        <ul className="divide-y divide-gray-100" role="list">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2 text-sm text-gray-700">
              <span>
                <span className="font-medium">{item.qty}x</span> {item.id}
              </span>
              <span className="text-gray-500">{formatCurrency(item.priceAtMoment * item.qty)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-right font-semibold text-gray-900">
          Total estimado: {formatCurrency(estimatedTotal)}
        </p>
      </section>

      {/* Status transition */}
      <section aria-labelledby="transition-heading" className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h3 id="transition-heading" className="font-semibold text-gray-800 mb-3">Cambiar estado</h3>
        {nextStatus ? (
          <button
            type="button"
            onClick={handleAdvance}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            {TRANSITION_LABELS[status]}
          </button>
        ) : (
          <p className="text-sm text-gray-500">El pedido ya fue entregado. No hay más transiciones disponibles.</p>
        )}
      </section>

      {/* WhatsApp */}
      {showWhatsApp && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <WhatsAppLink
            customerName={customerName}
            orderId={order.orderId}
            status={status as Exclude<OrderStatus, 'received'>}
          />
        </div>
      )}
    </article>
  )
}
