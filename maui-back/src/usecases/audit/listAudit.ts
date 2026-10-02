import { createHash } from 'node:crypto'
import type { AuditListResponse, ListAuditQuery } from '../../../../shared/contracts/audit.js'
import type { AuditRepository } from '../../domain/audit/AuditRepository.js'
import { staffStoreOf, type StoreActor } from '../../domain/store/storeAccess.js'
import { decodeOrderListCursor, encodeOrderListCursor } from '../orders/orderListCursor.js'

export async function listAuditForActor(audit: AuditRepository, actor: StoreActor, query: ListAuditQuery): Promise<AuditListResponse> {
  const storeId = staffStoreOf(actor)
  const { limit, cursor, ...filter } = query
  const binding = createHash('sha256').update(JSON.stringify(['audit:list', 1, actor.id, actor.role, storeId,
    filter.entity ?? null, filter.entityId ?? null, filter.action ?? null, filter.from ?? null, filter.to ?? null])).digest('base64url')
  const after = cursor === undefined ? undefined : decodeOrderListCursor(cursor, binding)
  const page = await audit.listPage({ storeId, filter, limit, ...(after ? { after } : {}) })
  const last = page.entries.at(-1)
  return { items: page.entries.map(({ event }) => event), nextCursor: page.hasMore && last ? encodeOrderListCursor(last.position, binding) : null }
}
