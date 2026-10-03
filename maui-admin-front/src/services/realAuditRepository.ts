import { auditListResponseSchema, listAuditQuerySchema, type AuditEvent, type ListAuditQuery } from '@shared/contracts'
import { apiClient, type ApiClient } from './http/apiClient'
import { validateRequest } from './http/validateRequest'
import type { RequestOptions } from './realAuthRepository'

export interface AuditFilterInput {
  entity?: AuditEvent['entity']
  action?: AuditEvent['action']
  entityId?: string
  /** ISO 8601 con zona; `from` inclusivo, `to` exclusivo. */
  from?: string
  to?: string
}

export interface AuditPageRequest {
  limit?: number
  cursor?: string
}

export interface AuditPage {
  items: AuditEvent[]
  /** `null` en la última página; opaco y válido solo con los mismos filtros. */
  nextCursor: string | null
}

/**
 * Lectura de la auditoría persistente (T-13, solo owner). El servidor registra cada mutación
 * con actor derivado de la sesión: la UI no escribe eventos, por eso no hay `log`.
 */
export interface RealAuditRepository {
  listPage(filter?: AuditFilterInput, page?: AuditPageRequest, options?: RequestOptions): Promise<AuditPage>
}

const compactQuery = (query: Record<string, string | number | undefined>): Record<string, string | number> =>
  Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined)) as Record<string, string | number>

export const createRealAuditRepository = (client: ApiClient = apiClient): RealAuditRepository => ({
  async listPage(filter, page, options) {
    const query = compactQuery({
      entity: filter?.entity,
      action: filter?.action,
      entityId: filter?.entityId?.trim() || undefined,
      from: filter?.from,
      to: filter?.to,
      limit: page?.limit,
      cursor: page?.cursor,
    })
    // El esquema compartido recibe la query cruda (strings), igual que el handler.
    validateRequest<ListAuditQuery>(listAuditQuerySchema, Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])))
    return client.request({
      path: '/audit',
      query,
      schema: auditListResponseSchema,
      ...(options?.signal ? { signal: options.signal } : {}),
    })
  },
})

export const realAuditRepository: RealAuditRepository = createRealAuditRepository()
