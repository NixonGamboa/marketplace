import { auditEventSchema, type AuditEvent } from '../../../../shared/contracts/audit.js'
import { SYSTEM_ACTOR, type AuditPageRequest, type AuditRepository, type AuditWrite } from '../../domain/audit/AuditRepository.js'
import { toListPosition } from '../../domain/orders/orderListing.js'
import { newId } from '../../shared/ids.js'

/** append es síncrono: validar/auditar antes de escribir permite rollback indivisible en memory. */
export class AuditRepositoryMemory implements AuditRepository {
  private readonly events: AuditEvent[] = []
  append(entity: AuditEvent['entity'], action: AuditEvent['action'], storeId: string, entityId: string,
    audit: AuditWrite = { actor: SYSTEM_ACTOR, metadata: {} }): void {
    this.events.push(auditEventSchema.parse({ id: newId(), entity, action, storeId, entityId,
      actorKind: audit.actor.kind, actorId: audit.actor.kind === 'account' ? audit.actor.id : null,
      createdAt: new Date().toISOString(), metadata: audit.metadata }))
  }
  async listPage({ storeId, filter, limit, after }: AuditPageRequest) {
    const matching = this.events.filter(event => event.storeId === storeId &&
      (filter.entity === undefined || filter.entity === event.entity) &&
      (filter.entityId === undefined || filter.entityId === event.entityId) &&
      (filter.action === undefined || filter.action === event.action) &&
      (filter.from === undefined || Date.parse(event.createdAt) >= Date.parse(filter.from)) &&
      (filter.to === undefined || Date.parse(event.createdAt) < Date.parse(filter.to)))
      .map(event => ({ event: structuredClone(event), position: toListPosition(event.createdAt, event.id) }))
      .filter(({ position }) => !after || position.createdAt < after.createdAt || (position.createdAt === after.createdAt && position.id < after.id))
      .sort((a, b) => a.position.createdAt === b.position.createdAt ? (a.event.id < b.event.id ? 1 : -1) : a.position.createdAt < b.position.createdAt ? 1 : -1)
    return { entries: matching.slice(0, limit), hasMore: matching.length > limit }
  }
}
