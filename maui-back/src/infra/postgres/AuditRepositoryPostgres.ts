import { recordAuditFailure } from '../../shared/observability.js'
import { and, eq, or, sql, type SQL } from 'drizzle-orm'
import { auditEventSchema } from '../../../../shared/contracts/audit.js'
import { AuditPersistenceError, type AuditPageRequest, type AuditRepository } from '../../domain/audit/AuditRepository.js'
import { auditEventsTable as t } from './schema.js'
import type { Db } from './client.js'

export class AuditRepositoryPostgres implements AuditRepository {
  constructor(private readonly db: Db) {}
  async listPage({ storeId, filter, limit, after }: AuditPageRequest) {
    const conditions: SQL[] = [eq(t.storeId, storeId)]
    if (filter.entity !== undefined) conditions.push(eq(t.entity, filter.entity))
    if (filter.entityId !== undefined) conditions.push(eq(t.entityId, filter.entityId))
    if (filter.action !== undefined) conditions.push(eq(t.action, filter.action))
    if (filter.from !== undefined) conditions.push(sql`${t.createdAt} >= ${filter.from}::timestamptz`)
    if (filter.to !== undefined) conditions.push(sql`${t.createdAt} < ${filter.to}::timestamptz`)
    if (after) conditions.push(or(sql`${t.createdAt} < ${after.createdAt}::timestamptz`, and(sql`${t.createdAt} = ${after.createdAt}::timestamptz`, sql`${t.id} < ${after.id}::text`))!)
    const query = this.db.select({ event: t, position: sql<string>`to_char(${t.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` })
      .from(t).where(and(...conditions)).orderBy(sql`${t.createdAt} desc nulls last`, sql`${t.id} desc nulls last`).limit(limit + 1)
    let rows: Awaited<typeof query>
    try { rows = await query } catch { recordAuditFailure('driver'); throw new AuditPersistenceError() }
    try {
      return { entries: rows.slice(0, limit).map(({ event, position }) => ({
        event: auditEventSchema.parse({ ...event, createdAt: position }), position: { createdAt: position, id: event.id },
      })), hasMore: rows.length > limit }
    } catch { recordAuditFailure('contract'); throw new AuditPersistenceError() }
  }
}
