import { and, eq, isNull, sql } from 'drizzle-orm'
import {
  ACCOUNT_ROLES,
  normalizeIsoUtc,
  type AccountRole,
} from '../../../../shared/contracts/index.js'
import type { Account, AccountStatus, StoredAccount } from '../../domain/auth/Account.js'
import type {
  AuthRepository,
  RateLimitReservation,
  RateLimitRule,
} from '../../domain/auth/AuthRepository.js'
import type { AuthSession, SessionWithAccount } from '../../domain/auth/AuthSession.js'
import { AccountConflictError, AuthPersistenceError } from '../../domain/auth/errors.js'
import type { Db } from './client.js'
import { authAccountsTable, authRateLimitsTable, authSessionsTable } from './schema.js'

type AccountRow = typeof authAccountsTable.$inferSelect
type PublicAccountRow = Omit<AccountRow, 'passwordHash'>
type SessionRow = typeof authSessionsTable.$inferSelect

const parseRole = (value: string): AccountRole => {
  const role = ACCOUNT_ROLES.find(candidate => candidate === value)
  if (!role) throw new Error('Invalid account role')
  return role
}

const parseStatus = (value: string): AccountStatus => {
  if (value !== 'active' && value !== 'disabled') throw new Error('Invalid account status')
  return value
}

const toAccount = (row: PublicAccountRow): Account => ({
  id: row.id,
  role: parseRole(row.role),
  name: row.name,
  phone: row.phone,
  email: row.email,
  storeId: row.storeId,
  status: parseStatus(row.status),
  createdAt: normalizeIsoUtc(row.createdAt),
  updatedAt: normalizeIsoUtc(row.updatedAt),
})

const toStoredAccount = (row: AccountRow): StoredAccount => ({
  ...toAccount(row),
  passwordHash: row.passwordHash,
})

const toSession = (row: SessionRow): AuthSession => ({
  id: row.id,
  accountId: row.accountId,
  createdAt: normalizeIsoUtc(row.createdAt),
  expiresAt: normalizeIsoUtc(row.expiresAt),
  revokedAt: row.revokedAt === null ? null : normalizeIsoUtc(row.revokedAt),
})

/**
 * Cualquier fallo del driver/SQL se reduce a `AuthPersistenceError` (→ 503): el error
 * original puede contener URL, SQL o datos personales y no se propaga ni se registra.
 */
const guard = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof AccountConflictError) throw error
    throw new AuthPersistenceError()
  }
}

/**
 * Adapter Drizzle sobre Neon HTTP. Este driver NO ofrece transacciones interactivas, así que
 * ninguna operación asume una transacción entre peticiones: cada invariante se resuelve con
 * UNA sentencia atómica (INSERT … ON CONFLICT, UPDATE condicionado, JOIN de lectura).
 */
export class AuthRepositoryPostgres implements AuthRepository {
  constructor(private readonly db: Db) {}

  createAccount(account: StoredAccount): Promise<void> {
    return guard(async () => {
      // Sin target: cubre cualquier índice único (id, phone, email) en una sola sentencia.
      const inserted = await this.db
        .insert(authAccountsTable)
        .values({
          id: account.id,
          role: account.role,
          name: account.name,
          phone: account.phone,
          email: account.email,
          storeId: account.storeId,
          passwordHash: account.passwordHash,
          status: account.status,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        })
        .onConflictDoNothing()
        .returning({ id: authAccountsTable.id })
      if (inserted.length === 0) throw new AccountConflictError()
    })
  }

  findAccountByPhone(phone: string): Promise<StoredAccount | null> {
    return guard(async () => {
      const [row] = await this.db
        .select()
        .from(authAccountsTable)
        .where(eq(authAccountsTable.phone, phone))
        .limit(1)
      return row ? toStoredAccount(row) : null
    })
  }

  findAccountByEmail(email: string): Promise<StoredAccount | null> {
    return guard(async () => {
      const [row] = await this.db
        .select()
        .from(authAccountsTable)
        .where(eq(authAccountsTable.email, email))
        .limit(1)
      return row ? toStoredAccount(row) : null
    })
  }

  createSession(session: AuthSession): Promise<void> {
    return guard(async () => {
      await this.db.insert(authSessionsTable).values({
        id: session.id,
        accountId: session.accountId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
      })
    })
  }

  findSessionWithAccount(sessionId: string): Promise<SessionWithAccount | null> {
    return guard(async () => {
      const [row] = await this.db
        .select({
          session: authSessionsTable,
          account: {
            id: authAccountsTable.id,
            role: authAccountsTable.role,
            name: authAccountsTable.name,
            phone: authAccountsTable.phone,
            email: authAccountsTable.email,
            storeId: authAccountsTable.storeId,
            status: authAccountsTable.status,
            createdAt: authAccountsTable.createdAt,
            updatedAt: authAccountsTable.updatedAt,
          },
        })
        .from(authSessionsTable)
        .innerJoin(authAccountsTable, eq(authSessionsTable.accountId, authAccountsTable.id))
        .where(eq(authSessionsTable.id, sessionId))
        .limit(1)
      return row ? { session: toSession(row.session), account: toAccount(row.account) } : null
    })
  }

  revokeSession(sessionId: string, accountId: string, revokedAt: string): Promise<void> {
    return guard(async () => {
      await this.db
        .update(authSessionsTable)
        .set({ revokedAt })
        .where(
          and(
            eq(authSessionsTable.id, sessionId),
            eq(authSessionsTable.accountId, accountId),
            isNull(authSessionsTable.revokedAt),
          ),
        )
    })
  }

  /**
   * Upsert atómico en una sentencia: crea la ventana o la renueva si venció y, si no, suma un
   * intento (acotado a limit+1 para no crecer sin límite). Dos peticiones concurrentes
   * serializan sobre la fila del bucket, así que nunca se reservan más de `limit` cupos.
   */
  reserveAttempt(rule: RateLimitRule, now: string): Promise<RateLimitReservation> {
    return guard(async () => {
      const result = await this.db.execute<{ attempts: number | string; window_start_ms: number | string }>(sql`
        INSERT INTO auth_rate_limits AS rl (bucket, window_start, attempts)
        VALUES (${rule.bucket}, ${now}::timestamptz, 1)
        ON CONFLICT (bucket) DO UPDATE SET
          attempts = CASE
            WHEN rl.window_start + make_interval(secs => ${rule.windowSeconds}::double precision) <= ${now}::timestamptz THEN 1
            ELSE LEAST(rl.attempts + 1, ${rule.limit + 1}::integer)
          END,
          window_start = CASE
            WHEN rl.window_start + make_interval(secs => ${rule.windowSeconds}::double precision) <= ${now}::timestamptz THEN ${now}::timestamptz
            ELSE rl.window_start
          END
        RETURNING attempts, (extract(epoch FROM window_start) * 1000)::bigint AS window_start_ms
      `)
      const row = result.rows[0]
      if (!row) throw new Error('Rate limit upsert returned no row')

      const attempts = Number(row.attempts)
      const windowEndMs = Number(row.window_start_ms) + rule.windowSeconds * 1000
      if (!Number.isFinite(attempts) || !Number.isFinite(windowEndMs)) throw new Error('Invalid rate limit row')
      return {
        allowed: attempts <= rule.limit,
        retryAfterSeconds: Math.max(1, Math.ceil((windowEndMs - Date.parse(now)) / 1000)),
      }
    })
  }

  clearAttempts(bucket: string): Promise<void> {
    return guard(async () => {
      await this.db.delete(authRateLimitsTable).where(eq(authRateLimitsTable.bucket, bucket))
    })
  }
}
