/**
 * ME-03 — Qué muestra el detalle según el estado: modalidad, pago y datos de entrega; en «Recibido» la
 * antigüedad, el aviso fuera de horario y la preferencia de sustitución; desde «Confirmado» los productos con
 * lo pedido (o los pesos finales). El pago es solo el método elegido: no hay «pagado» ni datos de cobro.
 */
import { describeTimeSlot, paymentMethodLabel } from '@shared/receipts'
import type { OrderStatus } from '@/types/orderService'
import type { AdminOrder } from '@/types/adminOrder'
import { DELIVERY_TYPE_LABELS, SUBSTITUTION_LABELS, formatCop, formatKilos, orderAgeLabel } from './orderPresentation'

interface OrderOverviewProps {
  order: AdminOrder
  now?: Date
}

const coordinatesOf = ({ deliveryData: { lat, lng } }: AdminOrder): { lat: number; lng: number } | null =>
  typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90
    && typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180
    ? { lat, lng }
    : null

export function OrderOverview({ order, now }: OrderOverviewProps) {
  const { deliveryType, deliveryData } = order
  const coordinates = coordinatesOf(order)
  return (
    <section aria-labelledby="delivery-heading" className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 id="delivery-heading" className="mb-2 font-semibold text-gray-800">Modalidad</h3>
      <p className="text-sm text-gray-700">{DELIVERY_TYPE_LABELS[deliveryType]}</p>
      {deliveryType === 'pickup' && deliveryData.timeSlot && (
        <p className="mt-1 text-sm text-gray-600">
          Franja de recogida: {describeTimeSlot(deliveryData.timeSlot, order.timeSlotDate)}
        </p>
      )}
      {deliveryType === 'delivery' && deliveryData.address && (
        <p className="mt-1 text-sm text-gray-600">Dirección o referencia: {deliveryData.address}</p>
      )}
      {deliveryType === 'delivery' && coordinates && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-medium text-indigo-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Abrir ubicación en Google Maps
        </a>
      )}
      <p className="mt-1 text-sm text-gray-600">Pago: {paymentMethodLabel(order.paymentMethod)}</p>
      {order.status === 'received' && (
        <>
          <p className="mt-1 text-sm text-gray-600">{orderAgeLabel(order.createdAt, now)}</p>
          {order.processingNotice && (
            <p className="mt-1 inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-semibold text-amber-800">
              Llegó fuera de horario
            </p>
          )}
          <p className="mt-1 text-sm text-gray-600">
            {order.items.length} {order.items.length === 1 ? 'producto' : 'productos'}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Si falta un producto: {SUBSTITUTION_LABELS[order.substitutionPreference]}
          </p>
        </>
      )}
    </section>
  )
}

interface OrderItemsSectionProps {
  order: AdminOrder
  names: Record<string, string>
  /** Productos con lo pedido o los pesos finales; la lista de preparación y «Recibido» no la usan. */
  listed: boolean
}

/** Desde «Listo» los importes son los finales; antes, lo pedido. */
const showsFinalWeights = (status: OrderStatus): boolean => status === 'ready' || status === 'in_delivery' || status === 'delivered'

export function OrderItemsSection({ order, names, listed }: OrderItemsSectionProps) {
  const removedOriginals = (order.originalItems ?? []).filter((original) => !order.items.some((item) => item.id === original.id))
  const final = showsFinalWeights(order.status)

  return (
    <section aria-labelledby="items-heading" className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 id="items-heading" className="mb-3 font-semibold text-gray-800">Productos ({order.items.length})</h3>
      {listed && (
        <ul className="divide-y divide-gray-100" role="list">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-3">
              <span className="text-sm font-medium text-gray-800">
                {names[item.id] ?? 'Producto'}
                {item.substitutedFor && <span className="ml-2 text-xs font-normal text-indigo-700">Sustituto</span>}
                {item.is_variable_weight && (
                  <span className="block text-xs font-normal text-gray-600">
                    {final && item.kilosReal !== undefined
                      ? `Peso real: ${formatKilos(item.kilosReal)}`
                      : `Pedido: ${formatKilos(item.kilosRequested ?? 0)}`}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm text-gray-600">
                {item.is_variable_weight
                  ? `${formatCop(item.priceAtMoment)}/kg`
                  : `${item.qty} × ${formatCop(item.priceAtMoment)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {removedOriginals.length > 0 && listed && (
        <p className="mt-3 text-xs text-gray-500">
          Quitado o sustituido respecto al pedido original:{' '}
          {removedOriginals.map((original) => original.name ?? 'Producto').join(', ')}
        </p>
      )}
      <p className="mt-3 text-right font-semibold text-gray-900">
        {order.finalTotal != null ? 'Total final' : 'Total estimado'}: {formatCop(order.finalTotal ?? order.estimatedTotal)}
      </p>
    </section>
  )
}
