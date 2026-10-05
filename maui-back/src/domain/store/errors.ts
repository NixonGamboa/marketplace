import { DomainError } from '../../shared/errors.js'

export const STORE_RULE_CODES = [
  'DELIVERY_UNAVAILABLE',
  'TIME_SLOT_UNAVAILABLE',
] as const
export type StoreRuleCode = (typeof STORE_RULE_CODES)[number]

/** Pedido que la tienda no puede recibir: domicilio deshabilitado o franja incompatible con la fecha de procesamiento. */
export class StoreRuleError extends DomainError {
  constructor(
    public readonly rule: StoreRuleCode,
    message: string,
  ) {
    super(message, rule)
    this.name = 'StoreRuleError'
  }
}

/** Escritura concurrente detectada por versión. */
export class StoreConflictError extends DomainError {
  constructor() {
    super('La configuración cambió mientras se editaba; recargue e intente de nuevo', 'STORE_CONCURRENT_UPDATE')
    this.name = 'StoreConflictError'
  }
}

/** Fallo de persistencia de tienda. No conserva el error original: puede contener URLs o SQL. */
export class StorePersistenceError extends Error {
  readonly code = 'STORE_PERSISTENCE_UNAVAILABLE'

  constructor() {
    super('La persistencia de tienda no está disponible')
    this.name = 'StorePersistenceError'
  }
}
