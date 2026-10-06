/**
 * Acciones disponibles por estado (ME-03). Puro: una acción principal, a lo sumo una secundaria de
 * avance y la corrección «Reabrir preparación». Se apoya en la máquina de transiciones común; las
 * etiquetas dependen de la modalidad, nunca del nombre técnico del estado.
 */
import { allowedNextStatuses, canReopenPreparation, canTransition } from '@shared/contracts'
import type { OrderStatus } from '@/types/orderService'
import { isCancelled, type AdminOrder } from '@/types/adminOrder'

/** Una confirmación explícita solo en los pasos que cierran ajustes o entregan el pedido. */
export type ConfirmationKind = 'ready' | 'handover'

export interface OrderAction {
  status: OrderStatus
  label: string
  /** Sin valor, el toque aplica la transición directamente. */
  confirmation?: ConfirmationKind
}

const PRIMARY_BY_STATUS: Partial<Record<OrderStatus, OrderAction>> = {
  received: { status: 'confirmed', label: 'Confirmar pedido' },
  confirmed: { status: 'preparing', label: 'Comenzar preparación' },
  preparing: { status: 'ready', label: 'Marcar como listo', confirmation: 'ready' },
  in_delivery: { status: 'delivered', label: 'Confirmar entrega', confirmation: 'handover' },
}

const permitted = (order: AdminOrder, action: OrderAction | undefined): OrderAction | null =>
  action && canTransition(order.status, action.status, order.deliveryType) ? action : null

export function primaryAction(order: AdminOrder): OrderAction | null {
  if (isCancelled(order)) return null
  if (order.status === 'ready') {
    return permitted(order, order.deliveryType === 'delivery'
      ? { status: 'in_delivery', label: 'Salió a domicilio' }
      : { status: 'delivered', label: 'Cliente recogió', confirmation: 'handover' })
  }
  return permitted(order, PRIMARY_BY_STATUS[order.status])
}

/** Entrega directa de un domicilio listo, sin pasar por «En camino». */
export function directDeliveryAction(order: AdminOrder): OrderAction | null {
  if (isCancelled(order) || order.status !== 'ready' || order.deliveryType !== 'delivery') return null
  return permitted(order, { status: 'delivered', label: 'Entrega directa', confirmation: 'handover' })
}

/** Cancelar solo hasta «listo»: en camino y los estados finales no se cancelan. */
export const canCancelOrder = (order: AdminOrder): boolean =>
  !isCancelled(order) && allowedNextStatuses(order.status, order.deliveryType).includes('cancelled')

export const canReopenOrder = (order: AdminOrder, role: string | undefined): boolean =>
  !isCancelled(order) && canReopenPreparation(order.status) && (role === 'owner' || role === 'operator')

export const handoverTitle = (order: AdminOrder): string =>
  order.deliveryType === 'pickup' ? 'Confirmar recogida' : 'Confirmar entrega'

export const handoverMessage = (order: AdminOrder): string =>
  order.deliveryType === 'pickup'
    ? '¿Confirmas que el cliente recogió el pedido? Esta acción cierra el pedido y no se puede deshacer.'
    : '¿Confirmas que el pedido fue entregado al cliente? Esta acción cierra el pedido y no se puede deshacer.'
