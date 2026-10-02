import { DomainError } from '../../shared/errors.js'

/** Credenciales o sesión inválidas. Mensaje único: no distingue causa ni existencia de cuenta. */
export class AuthenticationError extends DomainError {
  constructor() {
    super('Credenciales o sesión inválidas', 'UNAUTHENTICATED')
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends DomainError {
  constructor() {
    super('No tiene permisos para esta operación', 'FORBIDDEN')
    this.name = 'AuthorizationError'
  }
}

export class RateLimitedError extends DomainError {
  constructor(public readonly retryAfterSeconds: number) {
    super('Demasiados intentos. Intente de nuevo más tarde', 'RATE_LIMITED')
    this.name = 'RateLimitedError'
  }
}

/** Teléfono o email ya registrados. El mensaje no revela cuál ni de quién. */
export class AccountConflictError extends DomainError {
  constructor() {
    super('No fue posible crear la cuenta', 'ACCOUNT_CONFLICT')
    this.name = 'AccountConflictError'
  }
}

/** Fallo de persistencia de auth. No conserva el error original: puede contener URLs o SQL. */
export class AuthPersistenceError extends Error {
  readonly code = 'AUTH_PERSISTENCE_UNAVAILABLE'

  constructor() {
    super('La persistencia de autenticación no está disponible')
    this.name = 'AuthPersistenceError'
  }
}
