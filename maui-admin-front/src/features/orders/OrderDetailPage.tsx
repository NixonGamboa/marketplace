/**
 * @spec §12, §13, CU-3..5, US-4/5, ADR-006, ADR-007, TASK-017
 * Detalle de un pedido: pesos reales, cancelación, contacto cliente, picking list.
 */
import { useEffect, useLayoutEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { OrderStatus } from '@/types/orderService'
import { isCancelled as isOrderCancelled, isTerminal, type AdminOrder } from '@/types/adminOrder'
import type { Product } from '@/types/catalog'
import { isDemoMode, orderRepo, catalogRepo } from '@/services'
import { errorMessage, isConflict, isNotFound } from '@/lib/errorMessage'
import { RealOrderReceipt } from '@/components/orders/RealOrderReceipt'
import { describeTimeSlot } from '@shared/receipts'
import { useSession } from '@/auth/useSession'
import { useToast } from '@/ui/Toast'
import { latestOrder, orderPollingInterval, startOrderPolling } from '@/lib/orderPolling'
import { Spinner } from '@/ui/Spinner'
import { WeightInput } from '@/ui/WeightInput'
import { Tabs } from '@/ui/Tabs'
import { StatusBadge } from './StatusBadge'
import { CustomerContactBar } from './CustomerContactBar'
import { PickingListView } from './PickingListView'
import { ItemChangesPanel } from './ItemChangesPanel'

// ---------------------------------------------------------------------------
// State-machine de transiciones
// ---------------------------------------------------------------------------

const TRANSITIONS: Partial<Record<OrderStatus, OrderStatus>> = {
  received: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
  in_delivery: 'delivered',
}

const TRANSITION_LABELS: Record<string, string> = {
  received: 'Confirmar pedido',
  confirmed: 'Marcar como preparando',
  preparing: 'Marcar como listo',
  ready: 'Marcar como entregado',
  in_delivery: 'Marcar como entregado',
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

// ---------------------------------------------------------------------------
// CancelSection — separado para mantener la longitud del padre acotada
// ---------------------------------------------------------------------------

interface CancelSectionProps {
  orderId: string
  by: string
  /** Versión que el usuario está viendo: el servidor rechaza (409) si otro cambio ganó. */
  version: number | undefined
  onCancelled(order: AdminOrder): void
  onConflict(): void
}

function CancelSection({ orderId, by, version, onCancelled, onConflict }: CancelSectionProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const valid = reason.trim().length >= 5

  async function handleConfirm() {
    if (!valid) return
    setBusy(true)
    try {
      const updated = await orderRepo.cancel(orderId, reason, by, version)
      onCancelled(updated as AdminOrder)
      toast.success('Pedido cancelado')
      setOpen(false)
    } catch (err) {
      toast.error(errorMessage(err, 'Error al cancelar'))
      if (isConflict(err)) {
        setOpen(false)
        onConflict()
      }
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium rounded-lg transition"
      >
        Cancelar pedido
      </button>
    )
  }

  return (
    <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-xl">
      <p className="text-sm font-medium text-red-800 mb-2">Motivo de cancelación (mín. 5 caracteres)</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        className="w-full text-sm border border-red-200 rounded-lg p-2 focus:outline-none focus:border-red-400 resize-none"
        placeholder="Ej: Cliente no contestó, producto sin stock..."
        aria-label="Motivo de cancelación"
      />
      {!valid && reason.length > 0 && (
        <p className="text-xs text-red-600 mt-1">Mínimo 5 caracteres</p>
      )}
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!valid || busy}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition"
        >
          {busy ? 'Cancelando...' : 'Confirmar cancelación'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setReason('') }}
          className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium rounded-lg transition"
        >
          Volver
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// OrderDetailPage
// ---------------------------------------------------------------------------

type DetailTab = 'detail' | 'picking' | 'receipt'

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const { session } = useSession()
  const toast = useToast()

  const [order, setOrder] = useState<AdminOrder | null>(null)
  const [productNames, setProductNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<{ notFound: boolean; message: string } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [activeTab, setActiveTab] = useState<DetailTab>('detail')
  // Pesos locales: id → kilos
  const [localWeights, setLocalWeights] = useState<Record<string, number>>({})
  const [advanceBusy, setAdvanceBusy] = useState(false)
  const [weightsBusy, setWeightsBusy] = useState(false)

  const by = session?.user.email ?? 'demo'

  // El sondeo no pisa una versión posterior ni borra el último estado cuando falla.
  useEffect(() => {
    if (!orderId) return
    const controller = new AbortController()
    setOrder(null)
    setLoading(true)
    setLoadError(null)
    const poll = startOrderPolling(async (signal) => {
      const received = await orderRepo.getById(orderId, { signal })
      if (signal.aborted || controller.signal.aborted) return
      setOrder((current) => latestOrder(current, received))
      setLoadError(null)
      setLoading(false)
      // Los snapshots reales ya traen nombres; solo el demo necesita resolver el catálogo.
      const ids = [...new Set(received.items.filter((item) => !item.name).map((item) => item.id))]
      if (ids.length === 0) return
      const products = await Promise.all(ids.map((id) => catalogRepo.getProduct(id)))
      if (signal.aborted || controller.signal.aborted) return
      const names: Record<string, string> = {}
      products.forEach((product: Product | null, index) => { names[ids[index]] = product?.name ?? ids[index] })
      setProductNames(names)
    }, (failure) => {
      if (controller.signal.aborted) return
      setLoadError({ notFound: isNotFound(failure), message: errorMessage(failure, 'No pudimos actualizar el pedido; mostramos el último estado.') })
      setLoading(false)
    }, isDemoMode ? null : orderPollingInterval())
    return () => { controller.abort(); poll.stop() }
  }, [orderId, session?.user.email, session?.expiresAt, reloadToken])

  // Un 409 significa que otro cambio ganó: se recarga el pedido vigente (los pesos sin guardar se descartan).
  const reloadOrder = useCallback(() => setReloadToken((value) => value + 1), [])

  // Sincronizar antes de mostrar los inputs: un efecto tardío borraría una edición inmediata.
  useLayoutEffect(() => {
    if (!order) return
    const initial: Record<string, number> = {}
    for (const item of order.items) {
      if (item.is_variable_weight && item.kilosReal != null) {
        initial[item.id] = item.kilosReal
      }
    }
    setLocalWeights(initial)
  }, [order])

  const handleWeightChange = useCallback((itemId: string, kilos: number) => {
    setLocalWeights((prev) => ({ ...prev, [itemId]: kilos }))
  }, [])

  const variableItems = order?.items.filter((i) => i.is_variable_weight) ?? []
  const allWeightsSet = variableItems.length === 0
    || variableItems.every((i) => (localWeights[i.id] ?? 0) > 0)

  /** Pesos a enviar: el demo reescribe todos; el servidor solo recibe los que cambiaron (cada envío sube la versión). */
  function weightsToSend(current: AdminOrder) {
    return variableItems
      .filter((i) => isDemoMode || localWeights[i.id] !== current.items.find((c) => c.id === i.id)?.kilosReal)
      .map((i) => ({ itemId: i.id, kilos: localWeights[i.id] ?? 0 }))
  }

  async function handleSaveWeights() {
    if (!order) return
    const weights = weightsToSend(order)
    if (weights.length === 0) return
    setWeightsBusy(true)
    try {
      const updated = await orderRepo.setRealWeights(order.orderId, weights, by, order.version)
      setOrder(updated as AdminOrder)
      toast.success('Pesos guardados')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudieron guardar los pesos'))
      if (isConflict(err)) reloadOrder()
    } finally {
      setWeightsBusy(false)
    }
  }

  async function handleTransition(next: OrderStatus) {
    if (!order) return
    setAdvanceBusy(true)
    let current: AdminOrder = order
    try {
      // Si avanzamos a "ready" y hay items variables, guardar pesos primero
      if (order.status === 'preparing' && variableItems.length > 0) {
        const weights = weightsToSend(order)
        if (weights.length > 0) {
          const weighed = await orderRepo.setRealWeights(order.orderId, weights, by, order.version)
          current = (weighed ?? order) as AdminOrder
          setOrder(current)
        }
      }
      const updated = await orderRepo.updateStatus(order.orderId, next, by, current.version)
      setOrder(updated as AdminOrder)
      toast.success(`Estado cambiado a ${next}`)
    } catch (err) {
      toast.error(errorMessage(err, 'Error al actualizar estado'))
      if (isConflict(err)) reloadOrder()
    } finally {
      setAdvanceBusy(false)
    }
  }

  function handleAdvance() {
    const next = order ? TRANSITIONS[order.status] : undefined
    if (next) void handleTransition(next)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner size={32} />
      </div>
    )
  }

  if (!order) {
    const retryable = loadError !== null && !loadError.notFound
    return (
      <div className="py-16 text-center">
        <p role={retryable ? 'alert' : undefined} className="text-gray-600 mb-4">
          {retryable ? loadError.message : 'Pedido no encontrado.'}
        </p>
        {retryable && (
          <button
            type="button"
            onClick={reloadOrder}
            className="mb-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
          >
            Reintentar
          </button>
        )}
        <Link to="/pedidos" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
          ← Volver a pedidos
        </Link>
      </div>
    )
  }

  const isCancelled = isOrderCancelled(order)
  // Cancelar solo hasta «listo»; en camino y los estados finales no se cancelan (contrato común).
  const canCancel = !isTerminal(order) && order.status !== 'in_delivery'
  const { lat, lng } = order.deliveryData
  const hasValidCoordinates = typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90
    && typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180
  const nextStatus = TRANSITIONS[order.status]
  const isPreparingWithVariables = order.status === 'preparing' && variableItems.length > 0
  const canAdvance = !isCancelled && !!nextStatus && (!isPreparingWithVariables || allWeightsSet)

  const weightsEditable = isDemoMode ? !isCancelled && order.status !== 'delivered' : order.status === 'preparing'
  const canMarkInDelivery = !isDemoMode && order.status === 'ready' && order.deliveryType === 'delivery'
  const pendingWeights = !isDemoMode && order.status === 'preparing' && weightsToSend(order).length > 0
  const itemNames: Record<string, string> = Object.fromEntries(
    order.items.map((item) => [item.id, item.name ?? productNames[item.id] ?? item.id]),
  )
  const removedOriginals = (order.originalItems ?? []).filter((original) => !order.items.some((item) => item.id === original.id))

  const resolvedItems = order.items.map((item) => ({
    id: item.id,
    name: itemNames[item.id],
    qty: item.qty,
    isVariable: Boolean(item.is_variable_weight),
    kilosRequested: item.kilosRequested,
    kilosReal: localWeights[item.id] ?? item.kilosReal,
    priceAtMoment: item.priceAtMoment,
  }))

  const tabItems = [
    { value: 'detail', label: 'Detalle' },
    { value: 'picking', label: 'Lista de picking' },
    ...(isDemoMode ? [] : [{ value: 'receipt', label: 'Comprobante' }]),
  ]

  return (
    <article aria-label={`Detalle del pedido ${order.orderId}`}>
      {loadError && <p role="status" className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{loadError.message}</p>}
      {/* Navegación */}
      <div className="mb-5">
        <Link
          to="/pedidos"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Volver a pedidos
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{order.orderId}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {dateFormatter.format(new Date(order.createdAt))}
            </p>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {/* Contacto con el cliente (ADR-007: sólo customerPhone) */}
      <CustomerContactBar
        customerName={order.customerName}
        customerPhone={order.customerPhone}
        orderId={order.orderId}
        status={order.status}
      />

      {/* Aviso de cancelación */}
      {isCancelled && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-red-700">Pedido cancelado</p>
          {order.cancellationReason && (
            <p className="text-sm text-red-600 mt-0.5">{order.cancellationReason}</p>
          )}
        </div>
      )}

      {/* Tabs: Detalle | Picking */}
      <Tabs
        items={tabItems}
        value={activeTab}
        onChange={(v) => setActiveTab(v as DetailTab)}
      />

      <div className="mt-4">
        {activeTab === 'detail' && (
          <div className="space-y-4">
            {/* Modalidad de entrega */}
            <section
              aria-labelledby="delivery-heading"
              className="bg-white rounded-xl border border-gray-200 p-4"
            >
              <h3 id="delivery-heading" className="font-semibold text-gray-800 mb-2">
                Modalidad
              </h3>
              <p className="text-sm text-gray-700">
                {order.deliveryType === 'pickup' ? 'Retiro en tienda' : 'Domicilio'}
              </p>
              {order.deliveryType === 'pickup' && order.deliveryData.timeSlot && (
                <p className="mt-1 text-sm text-gray-600">
                  Franja de recogida: {describeTimeSlot(order.deliveryData.timeSlot, order.timeSlotDate)}
                </p>
              )}
              {order.deliveryType === 'delivery' && order.deliveryData.address && (
                <p className="mt-1 text-sm text-gray-600">Dirección o referencia: {order.deliveryData.address}</p>
              )}
              {order.deliveryType === 'delivery' && hasValidCoordinates && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-indigo-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Abrir ubicación en Google Maps
                </a>
              )}
            </section>

            {/* Items */}
            <section
              aria-labelledby="items-heading"
              className="bg-white rounded-xl border border-gray-200 p-4"
            >
              <h3 id="items-heading" className="font-semibold text-gray-800 mb-3">
                Items ({order.items.length})
              </h3>
              <ul className="divide-y divide-gray-100" role="list">
                {resolvedItems.map((item) => (
                  <li key={item.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm text-gray-800 font-medium">
                        {item.name}
                        {order.items.find((candidate) => candidate.id === item.id)?.substitutedFor && (
                          <span className="ml-2 text-xs font-normal text-indigo-700">Sustituto</span>
                        )}
                      </span>
                      <span className="text-sm text-gray-600 shrink-0">
                        {item.isVariable
                          ? `${currencyFormatter.format(item.priceAtMoment)}/kg`
                          : `${item.qty} × ${currencyFormatter.format(item.priceAtMoment)}`}
                      </span>
                    </div>

                    {/* WeightInput para items de peso variable */}
                    {item.isVariable && (
                      <div className="mt-2 max-w-[180px]">
                        <WeightInput
                          id={`weight-${item.id}`}
                          label="Peso real"
                          value={item.kilosReal ?? null}
                          suggested={item.kilosRequested}
                          onChange={(kg) => handleWeightChange(item.id, kg)}
                          disabled={!weightsEditable}
                        />
                        {(item.kilosReal ?? 0) > 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            Subtotal: {currencyFormatter.format((item.kilosReal ?? 0) * item.priceAtMoment)}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {removedOriginals.length > 0 && (
                <p className="mt-3 text-xs text-gray-500">
                  Quitado o sustituido respecto al pedido original:{' '}
                  {removedOriginals.map((original) => original.name ?? original.id).join(', ')}
                </p>
              )}
              <p className="mt-3 text-right font-semibold text-gray-900">
                {order.finalTotal != null ? 'Total final' : 'Total estimado'}: {currencyFormatter.format(order.finalTotal ?? order.estimatedTotal)}
              </p>
            </section>

            {/* Avanzar estado */}
            {!isCancelled && (
              <section
                aria-labelledby="actions-heading"
                className="bg-white rounded-xl border border-gray-200 p-4"
              >
                <h3 id="actions-heading" className="font-semibold text-gray-800 mb-3">
                  Acciones
                </h3>
                <div className="flex flex-wrap gap-2">
                  {nextStatus && (
                    <button
                      type="button"
                      onClick={handleAdvance}
                      disabled={!canAdvance || advanceBusy}
                      title={isPreparingWithVariables && !allWeightsSet
                        ? 'Registra los pesos de todos los productos variables primero'
                        : undefined}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition"
                    >
                      {advanceBusy ? 'Guardando...' : TRANSITION_LABELS[order.status]}
                    </button>
                  )}
                  {pendingWeights && (
                    <button
                      type="button"
                      onClick={handleSaveWeights}
                      disabled={weightsBusy || advanceBusy}
                      className="px-4 py-2 border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 text-sm font-medium rounded-lg transition"
                    >
                      {weightsBusy ? 'Guardando pesos...' : 'Guardar pesos'}
                    </button>
                  )}
                  {canMarkInDelivery && (
                    <button
                      type="button"
                      onClick={() => void handleTransition('in_delivery')}
                      disabled={advanceBusy}
                      className="px-4 py-2 border border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50 text-sm font-medium rounded-lg transition"
                    >
                      Marcar en camino
                    </button>
                  )}
                  {canCancel && (
                    <CancelSection
                      orderId={order.orderId}
                      by={by}
                      version={order.version}
                      onCancelled={setOrder}
                      onConflict={reloadOrder}
                    />
                  )}
                </div>
              </section>
            )}

            {!isDemoMode && !isCancelled && order.status === 'preparing' && (
              <ItemChangesPanel
                order={order}
                names={itemNames}
                onApplied={setOrder}
                onConflict={reloadOrder}
              />
            )}
          </div>
        )}

        {activeTab === 'receipt' && !isDemoMode && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <RealOrderReceipt key={`${order.orderId}-${order.version ?? 0}`} orderId={order.orderId} />
          </div>
        )}

        {activeTab === 'picking' && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <PickingListView order={order} items={resolvedItems} />
          </div>
        )}
      </div>
    </article>
  )
}
