/**
 * @spec §12, §13, CU-3..5, US-4/5, ADR-006, ADR-007, TASK-017
 * Detalle de un pedido según su estado (ME-03): una acción principal al pie, contacto secundario, cancelar en
 * una zona aparte y, en «Preparando», una sola lista de alistamiento con guardado automático.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { calculateOrderTotals } from '@shared/contracts'
import { orderReferenceLabel } from '@shared/receipts'
import type { OrderStatus } from '@/types/orderService'
import { isCancelled as isOrderCancelled, type AdminOrder } from '@/types/adminOrder'
import type { Product } from '@/types/catalog'
import { isDemoMode, orderRepo, catalogRepo } from '@/services'
import { errorMessage, isConflict, isNotFound } from '@/lib/errorMessage'
import { RealOrderReceipt } from '@/components/orders/RealOrderReceipt'
import { useSession } from '@/auth/useSession'
import { useToast } from '@/ui/Toast'
import { ConfirmDialog } from '@/ui/ConfirmDialog'
import { latestOrder, orderPollingInterval, startOrderPolling } from '@/lib/orderPolling'
import { Spinner } from '@/ui/Spinner'
import { Tabs } from '@/ui/Tabs'
import { StatusBadge } from './StatusBadge'
import { CustomerContactBar } from './CustomerContactBar'
import { PickingListView } from './PickingListView'
import { CancelSection } from './CancelSection'
import { MissingItemDialog } from './MissingItemDialog'
import { OrderActionFooter } from './OrderActionFooter'
import { OrderItemsSection, OrderOverview } from './OrderOverview'
import { PreparationChecklist } from './PreparationChecklist'
import { focusRow } from './rowFocus'
import { usePreparationEditor, type PreparationApi } from './usePreparationEditor'
import {
  canCancelOrder,
  canReopenOrder,
  directDeliveryAction,
  handoverMessage,
  handoverTitle,
  primaryAction,
  type OrderAction,
} from './orderActions'
import { formatCop, itemDisplayName } from './orderPresentation'

type DetailTab = 'detail' | 'picking' | 'receipt'

const REOPEN_ACTION: OrderAction = { status: 'preparing', label: 'Reabrir preparación' }

const TRANSITION_TOASTS: Record<OrderStatus, string> = {
  received: 'Pedido recibido',
  confirmed: 'Pedido confirmado',
  preparing: 'Preparación iniciada',
  ready: 'Pedido listo',
  in_delivery: 'Salió a domicilio',
  delivered: 'Pedido entregado',
  cancelled: 'Pedido cancelado',
}

const PENDING_AT_CONFIRM = 'Hay cambios sin guardar. Revísalos antes de marcar el pedido como listo.'

const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

/** Los pedidos cerrados se abren en el comprobante; el resto, en el detalle. */
const defaultTabFor = (order: AdminOrder): DetailTab =>
  !isDemoMode && (order.status === 'delivered' || isOrderCancelled(order)) ? 'receipt' : 'detail'

const preparationApi: PreparationApi = {
  changeItems: (orderId, changes, expectedVersion) => orderRepo.changeItems(orderId, changes, expectedVersion),
  getById: (orderId) => orderRepo.getById(orderId),
}

/** Total que la confirmación de «Listo» muestra: el del servidor o, si aún no llegó, el de los pesos guardados. */
const finalTotalOf = (order: AdminOrder): number =>
  order.finalTotal ?? calculateOrderTotals(order.items, order.shippingCost ?? 0).finalTotal ?? order.estimatedTotal

// ---------------------------------------------------------------------------
// Vista del pedido ya cargado
// ---------------------------------------------------------------------------

interface OrderDetailViewProps {
  order: AdminOrder
  productNames: Record<string, string>
  loadError: string | null
  tab: DetailTab
  onTab(tab: DetailTab): void
  onOrder(order: AdminOrder): void
  /** Relee el pedido en segundo plano, sin vaciar la pantalla ni perder lo escrito. */
  onRefresh(): void
}

function OrderDetailView({ order, productNames, loadError, tab, onTab, onOrder, onRefresh }: OrderDetailViewProps) {
  const { session } = useSession()
  const toast = useToast()
  const by = session?.user.email ?? 'demo'
  const reference = orderReferenceLabel(order)

  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<OrderAction | null>(null)
  const [missingItemId, setMissingItemId] = useState<string | null>(null)
  // Un segundo toque o un doble manejador no pueden enviar la misma transición dos veces.
  const transitionLock = useRef(false)

  const editor = usePreparationEditor(order, onOrder, preparationApi)

  const names = useMemo<Record<string, string>>(
    () => Object.fromEntries(order.items.map((item) => [item.id, itemDisplayName(item, productNames)])),
    [order.items, productNames],
  )

  async function runTransition(action: OrderAction) {
    if (transitionLock.current) return
    transitionLock.current = true
    setBusy(true)
    try {
      const updated = await orderRepo.updateStatus(order.orderId, action.status, by, editor.latest().version)
      onOrder(updated)
      toast.success(action === REOPEN_ACTION ? 'Preparación reabierta' : TRANSITION_TOASTS[action.status])
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo actualizar el estado'))
      if (isConflict(err)) onRefresh()
    } finally {
      transitionLock.current = false
      setBusy(false)
    }
  }

  function handleAction(action: OrderAction) {
    if (action.confirmation) setConfirming(action)
    else void runTransition(action)
  }

  function handleConfirmed() {
    const action = confirming
    setConfirming(null)
    if (!action) return
    // Algo pudo quedar pendiente después de abrir la confirmación: «Listo» cierra la edición, así que se reevalúa ahora.
    if (action.confirmation === 'ready' && editor.pendingNow().length > 0) {
      toast.error(PENDING_AT_CONFIRM)
      return
    }
    void runTransition(action)
  }

  const isCancelled = isOrderCancelled(order)
  const preparing = order.status === 'preparing' && !isCancelled
  const primary = primaryAction(order)
  const secondary = directDeliveryAction(order)
  const pendingNames = editor.pending.map((row) => names[row.itemId] ?? 'Producto')
  const blocked = preparing && editor.pending.length > 0
    ? {
        text: `Faltan ${editor.pending.length}: ${pendingNames.join(', ')}`,
        onJump: () => focusRow(editor.pending[0].itemId, editor.pending[0].issue),
      }
    : null
  // Si un cambio queda pendiente con la confirmación de «Listo» abierta, esta se cierra: no se cierra la edición a medias.
  const hasPending = editor.pending.length > 0
  const readyConfirmationOpen = confirming?.confirmation === 'ready'
  useEffect(() => {
    if (readyConfirmationOpen && hasPending) {
      setConfirming(null)
      toast.error(PENDING_AT_CONFIRM)
    }
  }, [readyConfirmationOpen, hasPending, toast])

  // Fuera de «Preparando» la lista no se muestra: lo que no llegó a guardarse se avisa en vez de desaparecer.
  const unsaved = preparing ? undefined : Object.values(editor.rows).find((row) => row.phase === 'error')
  const missingItem = missingItemId ? order.items.find((item) => item.id === missingItemId) : undefined

  const tabItems = [
    { value: 'detail', label: 'Detalle' },
    { value: 'picking', label: 'Lista de picking' },
    ...(isDemoMode ? [] : [{ value: 'receipt', label: 'Comprobante' }]),
  ]
  const resolvedItems = order.items.map((item) => ({
    id: item.id,
    name: names[item.id],
    qty: item.qty,
    isVariable: Boolean(item.is_variable_weight),
    kilosRequested: item.kilosRequested,
    kilosReal: item.kilosReal,
    priceAtMoment: item.priceAtMoment,
  }))

  return (
    <article aria-label={`Detalle del pedido ${reference}`}>
      {loadError && <p role="status" className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{loadError}</p>}
      <div className="mb-5">
        <Link to="/pedidos" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver a pedidos
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{reference}</h2>
            <p className="mt-0.5 text-sm text-gray-500">{dateFormatter.format(new Date(order.createdAt))}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {unsaved?.phase === 'error' && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          Hay cambios que no se guardaron. {unsaved.message}
        </p>
      )}

      <CustomerContactBar
        customerName={order.customerName}
        customerPhone={order.customerPhone}
        reference={reference}
        status={order.status}
      />

      {isCancelled && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">Pedido cancelado</p>
          {order.cancellationReason && <p className="mt-0.5 text-sm text-red-600">Motivo: {order.cancellationReason}</p>}
          {order.cancelledAt && <p className="mt-0.5 text-xs text-red-600">Cancelado: {dateFormatter.format(new Date(order.cancelledAt))}</p>}
        </div>
      )}

      <Tabs items={tabItems} value={tab} onChange={(value) => onTab(value as DetailTab)} />

      <div className="mt-4">
        {tab === 'detail' && (
          <div className="space-y-4">
            <OrderOverview order={order} />
            {preparing && (
              <PreparationChecklist
                order={order}
                names={names}
                editor={editor}
                canResolveMissing={!isDemoMode}
                onMissing={setMissingItemId}
              />
            )}
            <OrderItemsSection
              order={order}
              names={names}
              listed={order.status !== 'received' && !preparing}
            />
            {canCancelOrder(order) && (
              <CancelSection
                orderId={order.orderId}
                by={by}
                version={order.version}
                onCancelled={onOrder}
                onConflict={onRefresh}
              />
            )}
          </div>
        )}

        {tab === 'receipt' && !isDemoMode && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <RealOrderReceipt key={`${order.orderId}-${order.version ?? 0}`} orderId={order.orderId} />
          </div>
        )}

        {tab === 'picking' && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <PickingListView order={order} items={resolvedItems} />
          </div>
        )}
      </div>

      <OrderActionFooter
        primary={primary}
        secondary={secondary}
        canReopen={canReopenOrder(order, session?.user.role)}
        busy={busy}
        blocked={blocked}
        onAction={handleAction}
        onReopen={() => void runTransition(REOPEN_ACTION)}
      />

      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.confirmation === 'ready' ? 'Marcar pedido como listo' : handoverTitle(order)}
        message={confirming?.confirmation === 'ready'
          ? `Total final: ${formatCop(finalTotalOf(order))}. Al continuar se cierran los productos y los pesos; puedes corregirlos con «Reabrir preparación» antes de que el pedido salga o se entregue.`
          : handoverMessage(order)}
        confirmLabel="Confirmar"
        cancelLabel="Volver"
        onConfirm={handleConfirmed}
        onCancel={() => setConfirming(null)}
      />

      {missingItem && (
        <MissingItemDialog
          order={order}
          item={missingItem}
          name={names[missingItem.id]}
          reference={reference}
          editor={editor}
          onClose={() => setMissingItemId(null)}
          onApplied={(decision) => {
            setMissingItemId(null)
            toast.success(decision === 'remove' ? 'Producto quitado' : 'Producto sustituido')
          }}
        />
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------
// OrderDetailPage — carga y sondeo
// ---------------------------------------------------------------------------

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()
  // Cada pedido arranca con estado propio: pestaña, errores y borradores no se arrastran de otro pedido.
  return orderId ? <OrderDetailLoader key={orderId} orderId={orderId} /> : null
}

function OrderDetailLoader({ orderId }: { orderId: string }) {
  const { session } = useSession()

  const [order, setOrder] = useState<AdminOrder | null>(null)
  const [productNames, setProductNames] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState<{ notFound: boolean; message: string } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  // La pestaña se decide al abrir según el estado; la actualización automática no la cambia.
  const [tab, setTab] = useState<DetailTab | null>(null)
  const poll = useRef<{ refresh(): void } | null>(null)
  const loading = order === null && loadError === null

  // El sondeo no pisa una versión posterior ni borra el último estado cuando falla.
  useEffect(() => {
    const controller = new AbortController()
    setLoadError(null)
    const polling = startOrderPolling(async (signal) => {
      const received = await orderRepo.getById(orderId, { signal })
      if (signal.aborted || controller.signal.aborted) return
      setOrder((current) => latestOrder(current, received))
      setTab((current) => current ?? defaultTabFor(received))
      setLoadError(null)
      // Los snapshots reales ya traen nombres; solo el demo necesita resolver el catálogo.
      const ids = [...new Set(received.items.filter((item) => !item.name).map((item) => item.id))]
      if (ids.length === 0) return
      const products = await Promise.all(ids.map((id) => catalogRepo.getProduct(id)))
      if (signal.aborted || controller.signal.aborted) return
      const names: Record<string, string> = {}
      products.forEach((product: Product | null, index) => { if (product) names[ids[index]] = product.name })
      setProductNames(names)
    }, (failure) => {
      if (controller.signal.aborted) return
      setLoadError({ notFound: isNotFound(failure), message: errorMessage(failure, 'No pudimos actualizar el pedido; mostramos el último estado.') })
    }, isDemoMode ? null : orderPollingInterval())
    poll.current = polling
    return () => { controller.abort(); polling.stop(); poll.current = null }
  }, [orderId, session?.user.email, session?.expiresAt, reloadToken])

  const refresh = useCallback(() => poll.current?.refresh(), [])
  const retryLoad = useCallback(() => setReloadToken((value) => value + 1), [])
  const handleOrder = useCallback((next: AdminOrder) => setOrder((current) => latestOrder(current, next)), [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={32} />
      </div>
    )
  }

  if (!order) {
    const retryable = loadError !== null && !loadError.notFound
    return (
      <div className="py-16 text-center">
        <p role={retryable ? 'alert' : undefined} className="mb-4 text-gray-600">
          {retryable ? loadError.message : 'Pedido no encontrado.'}
        </p>
        {retryable && (
          <button
            type="button"
            onClick={retryLoad}
            className="mb-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            Reintentar
          </button>
        )}
        <Link to="/pedidos" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
          ← Volver a pedidos
        </Link>
      </div>
    )
  }

  return (
    <OrderDetailView
      order={order}
      productNames={productNames}
      loadError={loadError?.message ?? null}
      tab={tab ?? defaultTabFor(order)}
      onTab={setTab}
      onOrder={handleOrder}
      onRefresh={refresh}
    />
  )
}
