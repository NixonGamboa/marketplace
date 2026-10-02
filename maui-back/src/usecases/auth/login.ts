import { issuesFromZodError, loginRequestSchema } from '../../../../shared/contracts/index.js'
import {
  hasConsistentIdentity,
  toPublicAccount,
  type StoredAccount,
} from '../../domain/auth/Account.js'
import { AuthenticationError } from '../../domain/auth/errors.js'
import {
  LOGIN_ATTEMPT_POLICY,
  LOGIN_GLOBAL_BUCKET,
  LOGIN_GLOBAL_POLICY,
} from '../../domain/auth/policy.js'
import { ValidationError } from '../../shared/errors.js'
import type { AuthDeps, IssuedSession } from './deps.js'
import { openSession } from './openSession.js'
import { reserveAttemptOrThrow } from './reserveAttempt.js'

/**
 * Login por email (staff) o teléfono (cliente). Orden deliberado:
 * 1) reserva persistente en la cota GLOBAL y luego en el bucket del identificador, ambas
 *    ANTES de cualquier hash (la global acota a quien rota identificadores);
 * 2) cuenta inexistente → hash ficticio de igual costo;
 * 3) cualquier fallo (clave, cuenta desactivada, identidad incoherente) → el MISMO error.
 * Solo el bucket del identificador se reinicia tras un éxito; el global nunca.
 */
export const login = async (deps: AuthDeps, input: unknown): Promise<IssuedSession> => {
  const parsed = loginRequestSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('Datos de acceso inválidos', issuesFromZodError(parsed.error))
  }
  const credentials = parsed.data
  const identifier = credentials.method === 'email' ? credentials.email : credentials.phone
  const bucket = deps.keys.key(`login:${credentials.method}`, identifier)

  await reserveAttemptOrThrow(deps, { bucket: LOGIN_GLOBAL_BUCKET, ...LOGIN_GLOBAL_POLICY })
  await reserveAttemptOrThrow(deps, { bucket, ...LOGIN_ATTEMPT_POLICY })

  const stored: StoredAccount | null =
    credentials.method === 'email'
      ? await deps.repository.findAccountByEmail(credentials.email)
      : await deps.repository.findAccountByPhone(credentials.phone)

  if (!stored) {
    await deps.hasher.verifyUnknown(credentials.password)
    throw new AuthenticationError()
  }

  const passwordMatches = await deps.hasher.verify(credentials.password, stored.passwordHash)
  const roleMatchesMethod = credentials.method === 'email' ? stored.role !== 'customer' : stored.role === 'customer'
  if (!passwordMatches || stored.status !== 'active' || !hasConsistentIdentity(stored) || !roleMatchesMethod) {
    throw new AuthenticationError()
  }

  await deps.repository.clearAttempts(bucket)
  return openSession(deps, toPublicAccount(stored))
}
