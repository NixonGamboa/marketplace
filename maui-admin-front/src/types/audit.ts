// Audit log de acciones del panel admin (FIFO 500 entradas en localStorage).
// Source of truth: tech/wip/20260611-evolucion-admin-panel-demo/2-technical/spec.md §5.3

export type AuditAction =
  | 'order.status_changed'
  | 'order.cancelled'
  | 'order.weights_set'
  | 'catalog.product_upsert'
  | 'catalog.product_delete'
  | 'catalog.stock_toggled'
  | 'store.override_changed'
  | 'store.schedule_changed'
  | 'merchant.config_changed'
  | 'auth.login'
  | 'auth.logout'

export interface AuditEvent {
  id: string
  /** Email del usuario que realizó la acción. */
  user: string
  action: AuditAction
  /** Identificador del recurso afectado (orderId, productId, etc.). */
  targetId?: string
  /** Metadata libre para describir el cambio (de-a, motivo, payload). */
  meta?: Record<string, unknown>
  /** ISO timestamp del evento. */
  at: string
}
