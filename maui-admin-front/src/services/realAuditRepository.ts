import { CapabilityUnavailableError } from './real/capabilityUnavailable'
import type { AuditRepository } from './mockAuditRepository'

/** Sin endpoint de auditoría (T-13): se declara no disponible; no se usa el log local del demo. */
export const realAuditRepository: AuditRepository = {
  log() {
    return Promise.reject(new CapabilityUnavailableError('El registro de auditoría'))
  },
  list() {
    return Promise.reject(new CapabilityUnavailableError('La consulta de auditoría'))
  },
}
