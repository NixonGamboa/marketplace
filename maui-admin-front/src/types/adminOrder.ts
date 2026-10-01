// Extensiones del Order **sólo para el panel admin**.
//
// El tipo `Order` se replica byte-a-byte desde el PWA (ADR-002, scripts/
// check-types-drift.sh). El admin necesita registrar estado de cancelación que
// el PWA no expone. Esos campos viajan en `localStorage['maui-orders']` como
// propiedades extra del JSON: el PWA simplemente las ignora cuando deserializa.
//
// Uso:
//  - El admin escribe/lee `AdminOrder` desde `mockOrderRepository`.
//  - Para componentes que consumen el contrato shared con PWA, basta con
//    proyectar a `Order`.

import type { Order } from './orderService'

export interface AdminOrderExtensions {
  /** Motivo capturado al cancelar (mínimo no vacío, normalmente >10 chars). */
  cancellationReason?: string
  /** ISO timestamp de cuándo se canceló. */
  cancelledAt?: string
}

export type AdminOrder = Order & AdminOrderExtensions

/**
 * Indica si el pedido fue cancelado (estado terminal en admin, RN-6): estado canónico
 * `cancelled` o, en pedidos legacy del demo, `cancellationReason` sobre otro estado.
 */
export function isCancelled(order: AdminOrder): boolean {
  return order.status === 'cancelled' || Boolean(order.cancellationReason)
}

/** Estados finales: no admiten más acciones de avance ni cancelación. */
export function isTerminal(order: AdminOrder): boolean {
  return order.status === 'delivered' || isCancelled(order)
}
