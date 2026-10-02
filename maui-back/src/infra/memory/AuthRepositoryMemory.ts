import type { StoredAccount } from '../../domain/auth/Account.js'
import type {
  AuthRepository,
  RateLimitReservation,
  RateLimitRule,
} from '../../domain/auth/AuthRepository.js'
import type { AuthSession, SessionWithAccount } from '../../domain/auth/AuthSession.js'
import { toPublicAccount } from '../../domain/auth/Account.js'
import { AccountConflictError } from '../../domain/auth/errors.js'

interface Bucket {
  windowStartMs: number
  attempts: number
}

/**
 * Fixture para unit tests y desarrollo local (`DB_DRIVER=memory`, vetado fuera de local/test
 * por `loadConfig`). NO acredita persistencia ni límites distribuidos: en deploy los límites
 * y sesiones viven en Postgres. Cada método es síncrono por dentro, por lo que `reserveAttempt`
 * es atómico dentro del proceso.
 */
export class AuthRepositoryMemory implements AuthRepository {
  private readonly accounts = new Map<string, StoredAccount>()
  private readonly sessions = new Map<string, AuthSession>()
  private readonly buckets = new Map<string, Bucket>()

  async createAccount(account: StoredAccount): Promise<void> {
    const duplicate = [...this.accounts.values()].some(
      existing =>
        existing.id === account.id ||
        (account.phone !== null && existing.phone === account.phone) ||
        (account.email !== null && existing.email === account.email),
    )
    if (duplicate) throw new AccountConflictError()
    this.accounts.set(account.id, { ...account })
  }

  async findAccountByPhone(phone: string): Promise<StoredAccount | null> {
    return this.copyOf([...this.accounts.values()].find(account => account.phone === phone))
  }

  async findAccountByEmail(email: string): Promise<StoredAccount | null> {
    return this.copyOf([...this.accounts.values()].find(account => account.email === email))
  }

  async createSession(session: AuthSession): Promise<void> {
    if (!this.accounts.has(session.accountId) || this.sessions.has(session.id)) {
      throw new Error('Invalid session')
    }
    this.sessions.set(session.id, { ...session })
  }

  async findSessionWithAccount(sessionId: string): Promise<SessionWithAccount | null> {
    const session = this.sessions.get(sessionId)
    const account = session ? this.accounts.get(session.accountId) : undefined
    if (!session || !account) return null
    return { session: { ...session }, account: toPublicAccount({ ...account }) }
  }

  async revokeSession(sessionId: string, accountId: string, revokedAt: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session && session.accountId === accountId && session.revokedAt === null) {
      this.sessions.set(sessionId, { ...session, revokedAt })
    }
  }

  async reserveAttempt(rule: RateLimitRule, now: string): Promise<RateLimitReservation> {
    const nowMs = Date.parse(now)
    const windowMs = rule.windowSeconds * 1000
    const current = this.buckets.get(rule.bucket)

    const expired = !current || current.windowStartMs + windowMs <= nowMs
    const bucket: Bucket = expired
      ? { windowStartMs: nowMs, attempts: 1 }
      : { windowStartMs: current.windowStartMs, attempts: Math.min(current.attempts + 1, rule.limit + 1) }
    this.buckets.set(rule.bucket, bucket)

    return {
      allowed: bucket.attempts <= rule.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStartMs + windowMs - nowMs) / 1000)),
    }
  }

  async clearAttempts(bucket: string): Promise<void> {
    this.buckets.delete(bucket)
  }

  /** Solo tests: simula cambios administrativos (desactivar cuenta, cambiar rol/tienda). */
  patchAccount(id: string, patch: Partial<Omit<StoredAccount, 'id'>>): void {
    const current = this.accounts.get(id)
    if (!current) throw new Error('Account not found')
    this.accounts.set(id, { ...current, ...patch })
  }

  /** Solo tests: inspección del estado de una sesión. */
  getSession(id: string): AuthSession | null {
    const session = this.sessions.get(id)
    return session ? { ...session } : null
  }

  private copyOf(account: StoredAccount | undefined): StoredAccount | null {
    return account ? { ...account } : null
  }
}
