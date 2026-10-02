import type { AuditMetadata } from '../../../../shared/contracts/audit.js'
import type { OrderChange } from '../orders/OrdersRepository.js'
import type { AuditWrite } from './AuditRepository.js'

/** Actor ya fijado por lifecycle; nunca copiar ítems ni texto libre a la bitácora. */
export const orderChangeAudit = ({ expected, next, audit }: OrderChange): AuditWrite => ({
  actor: next.updatedBy ? { kind: 'account', id: next.updatedBy } : { kind: 'system' },
  metadata: {
    previousVersion: expected.version, version: next.version,
    previousStatus: expected.status, status: next.status,
    ...(next.finalTotal !== undefined ? { finalTotal: next.finalTotal } : {}),
    ...(audit ? { changes: audit } : {}),
  },
})
export type OrderAuditChanges = NonNullable<AuditMetadata['changes']>
