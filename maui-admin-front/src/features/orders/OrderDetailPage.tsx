/**
 * @spec §12, §13, CU-3..5, US-4/5, ADR-006, ADR-007, TASK-017
 * Detalle de un pedido: pesos reales, cancelación, contacto cliente, picking list.
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { OrderStatus } from '@/types/orderService'
import type { AdminOrder } from '@/types/adminOrder'
import type { Product } from '@/types/catalog'
import { orderRepo, catalogRepo } from '@/services'
import { useSession } from '@/auth/useSession'
import { useToast } from '@/ui/Toast'
import { Spinner } from '@/ui/Spinner'
import { WeightInput } from '@/ui/WeightInput'
import { Tabs } from '@/ui/Tabs'
import { StatusBadge } from './StatusBadge'
import { CustomerContactBar } from './CustomerContactBar'
import { PickingListView } from './PickingListView'

// ---------------------------------------------------------------------------
// State-machine de transiciones
// ---------------------------------------------------------------------------

const TRANSITIONS: Partial<Record<OrderStatus, OrderStatus>> = {
  received: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
}

const TRANSITION_LABELS: Record<string, string> = {
  received: 'Confirmar pedido',
  confirmed: 'Marcar como preparando',
  preparing: 'Marcar como listo',
  ready: 'Marcar como entregado',
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
  onCancelled(order: AdminOrder): void
}

function CancelSection({ orderId, by, onCancelled }: CancelSectionProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const valid = reason.trim().length >= 5

  async function handleConfirm() {
    if (!valid) return
    setBusy(true)
    try {
      const updated = await orderRepo.cancel(orderId, reason, by)
      onCancelled(updated as AdminOrder)
      toast.success('Pedido cancelado')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cancelar')
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

type DetailTab = 'detail' | 'picking'

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const { session } = useSession()
  const toast = useToast()

  const [order, setOrder] = useState<AdminOrder | null>(null)
  const [productNames, setProductNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<DetailTab>('detail')
  // Pesos locales: id → kilos
  const [localWeights, setLocalWeights] = useState<Record<string, number>>({})
  const [advanceBusy, setAdvanceBusy] = useState(false)

  const by = session?.user.email ?? 'demo'

  // Carga del pedido + nombres del catálogo en paralelo
  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    setLoading(true)

    orderRepo.getById(orderId)
      .then(async (o) => {
        if (cancelled) return
        setOrder(o as AdminOrder)

        // Resolución de nombres en paralelo
        const ids = [...new Set(o.items.map((i) => i.id))]
        const products = await Promise.all(ids.map((id) => catalogRepo.getProduct(id)))
        if (cancelled) return
        const names: Record<string, string> = {}
        products.forEach((p: Product | null, idx) => {
          names[ids[idx]] = p?.name ?? ids[idx]
        })
        setProductNames(names)
      })
      .catch(() => {
        if (!cancelled) toast.error('No se pudo cargar el pedido')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [orderId, toast])

  // Inicializar pesos locales al cargar el pedido
  useEffect(() => {
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

  async function handleAdvance() {
    if (!order) return
    const next = TRANSITIONS[order.status]
    if (!next) return

    setAdvanceBusy(true)
    try {
      // Si avanzamos a "ready" y hay items variables, guardar pesos primero
      if (order.status === 'preparing' && variableItems.length > 0) {
        const weights = variableItems.map((i) => ({
          itemId: i.id,
          kilos: localWeights[i.id] ?? 0,
        }))
        await orderRepo.setRealWeights(order.orderId, weights, by)
      }
      const updated = await orderRepo.updateStatus(order.orderId, next, by)
      setOrder(updated as AdminOrder)
      toast.success(`Estado cambiado a ${next}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar estado')
    } finally {
      setAdvanceBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner size={32} />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-600 mb-4">Pedido no encontrado.</p>
        <Link to="/pedidos" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
          ← Volver a pedidos
        </Link>
      </div>
    )
  }

  const isCancelled = Boolean(order.cancellationReason)
  const nextStatus = TRANSITIONS[order.status]
  const isPreparingWithVariables = order.status === 'preparing' && variableItems.length > 0
  const canAdvance = !isCancelled && !!nextStatus && (!isPreparingWithVariables || allWeightsSet)

  const resolvedItems = order.items.map((item) => ({
    id: item.id,
    name: productNames[item.id] ?? item.id,
    qty: item.qty,
    isVariable: Boolean(item.is_variable_weight),
    kilosRequested: item.kilosRequested,
    kilosReal: localWeights[item.id] ?? item.kilosReal,
    priceAtMoment: item.priceAtMoment,
  }))

  const tabItems = [
    { value: 'detail', label: 'Detalle' },
    { value: 'picking', label: 'Lista de picking' },
  ]

  return (
    <article aria-label={`Detalle del pedido ${order.orderId}`}>
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
          <p className="text-sm text-red-600 mt-0.5">{order.cancellationReason}</p>
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
                {order.deliveryData.address && ` — ${order.deliveryData.address}`}
              </p>
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
                      <span className="text-sm text-gray-800 font-medium">{item.name}</span>
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
                          disabled={isCancelled || order.status === 'delivered'}
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
              <p className="mt-3 text-right font-semibold text-gray-900">
                Total: {currencyFormatter.format(order.estimatedTotal)}
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
                  {order.status !== 'delivered' && (
                    <CancelSection
                      orderId={order.orderId}
                      by={by}
                      onCancelled={setOrder}
                    />
                  )}
                </div>
              </section>
            )}
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
