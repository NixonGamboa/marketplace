import type { StoredAccount } from './Account.js'
import type { AuthSession, SessionWithAccount } from './AuthSession.js'

/** Regla de ventana fija por bucket. `bucket` ya viene como clave opaca (sin PII). */
export interface RateLimitRule {
  bucket: string
  /** Intentos permitidos por ventana. */
  limit: number
  windowSeconds: number
}

export interface RateLimitReservation {
  allowed: boolean
  /** Segundos hasta que la ventana se renueva (≥ 1 si se denegó). */
  retryAfterSeconds: number
}

export interface AuthRepository {
  /** Lanza `AccountConflictError` si phone/email/id ya existen. */
  createAccount(account: StoredAccount): Promise<void>
  findAccountByPhone(phone: string): Promise<StoredAccount | null>
  findAccountByEmail(email: string): Promise<StoredAccount | null>
  createSession(session: AuthSession): Promise<void>
  /** Una sola lectura: sesión + cuenta vigente (sin hash). */
  findSessionWithAccount(sessionId: string): Promise<SessionWithAccount | null>
  /** Idempotente: conserva el `revokedAt` original si ya estaba revocada. */
  revokeSession(sessionId: string, accountId: string, revokedAt: string): Promise<void>
  /**
   * Reserva ATÓMICA de un intento (antes de hashear): incrementa el contador de la
   * ventana vigente y dice si cabe en la cota. Cada intento consume cupo, también el denegado.
   */
  reserveAttempt(rule: RateLimitRule, now: string): Promise<RateLimitReservation>
  clearAttempts(bucket: string): Promise<void>
}
