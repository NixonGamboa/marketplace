/**
 * Capacidad sin endpoint real todavía (transiciones, pesos, cancelación y auditoría).
 * En modo real se informa de forma explícita; nunca se recurre a mocks ni a localStorage.
 */
export class CapabilityUnavailableError extends Error {
  readonly capability: string

  constructor(capability: string) {
    super(`${capability} aún no está disponible con el servicio real.`)
    this.name = 'CapabilityUnavailableError'
    this.capability = capability
  }
}
