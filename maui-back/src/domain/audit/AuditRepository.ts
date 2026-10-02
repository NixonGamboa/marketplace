import type { AuditEvent, AuditMetadata, ListAuditQuery } from '../../../../shared/contracts/audit.js'
import type { OrderListPosition } from '../orders/orderListing.js'
import type { StoreActor } from '../store/storeAccess.js'

export type AuditActor = { kind: 'account'; id: string } | { kind: 'system' }
export const SYSTEM_ACTOR: AuditActor = { kind: 'system' }
export interface AuditWrite { actor: AuditActor; metadata: AuditMetadata }
export const auditFor = (actor: StoreActor, fields: AuditMetadata['fields'] = []): AuditWrite => ({ actor: { kind: 'account', id: actor.id }, metadata: { fields } })
/** Metadata igual en memory y PostgreSQL, con versión previa solo para UPDATE. */
export const auditVersion = (audit: AuditWrite | undefined, version: number, updated = false): AuditWrite => ({
  actor: audit?.actor ?? SYSTEM_ACTOR,
  metadata: { ...audit?.metadata, version, ...(updated ? { previousVersion: version - 1 } : {}) },
})
export interface AuditPageRequest {
  storeId: string
  filter: Omit<ListAuditQuery, 'limit' | 'cursor'>
  limit: number
  after?: OrderListPosition
}
export interface AuditRepository {
  listPage(request: AuditPageRequest): Promise<{ entries: { event: AuditEvent; position: OrderListPosition }[]; hasMore: boolean }>
}
export class AuditPersistenceError extends Error {
  constructor() { super('Auditoría no disponible'); this.name = 'AuditPersistenceError' }
}
