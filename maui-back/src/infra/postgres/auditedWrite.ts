import { getTableColumns, sql, type SQLWrapper, type Table } from 'drizzle-orm'
import { auditMetadataSchema, type AuditEvent } from '../../../../shared/contracts/audit.js'
import { SYSTEM_ACTOR, type AuditWrite } from '../../domain/audit/AuditRepository.js'
import { newId } from '../../shared/ids.js'
import type { Db } from './client.js'

/** Mutación y evento indivisibles; una fila CAS inexistente no produce evento. */
export async function auditedWrite<T extends Table>(db: Db, table: T, mutation: SQLWrapper,
  entity: AuditEvent['entity'], action: AuditEvent['action'], storeId: string,
  audit: AuditWrite = { actor: SYSTEM_ACTOR, metadata: {} }): Promise<T['$inferSelect'][]> {
  const metadata = auditMetadataSchema.parse(audit.metadata)
  const result = await db.execute<Record<string, unknown>>(sql`
    with changed as (${mutation.getSQL()}), audited as (
      insert into audit_events (id, store_id, entity, entity_id, action, actor_kind, actor_id, metadata)
      select ${newId()}, ${storeId}, ${entity}, changed.id, ${action}, ${audit.actor.kind},
        ${audit.actor.kind === 'account' ? audit.actor.id : null}, ${JSON.stringify(metadata)}::jsonb || jsonb_build_object('version', changed.version) ||
          case when ${action} = 'updated' then jsonb_build_object('previousVersion', changed.version - 1) else '{}'::jsonb end
      from changed returning id
    ) select changed.* from changed cross join audited
  `)
  const columns = getTableColumns(table)
  return result.rows.map(row => Object.fromEntries(Object.entries(columns).map(([key, column]) =>
    [key, row[column.name] === null ? null : column.mapFromDriverValue(row[column.name])]))) as T['$inferSelect'][]
}
