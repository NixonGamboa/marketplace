import { issuesFromZodError, registerRequestSchema } from '../../../../shared/contracts/index.js'
import { toPublicAccount, type StoredAccount } from '../../domain/auth/Account.js'
import {
  REGISTER_GLOBAL_BUCKET,
  REGISTER_GLOBAL_POLICY,
  REGISTER_PHONE_POLICY,
} from '../../domain/auth/policy.js'
import { ValidationError } from '../../shared/errors.js'
import type { AuthDeps, IssuedSession } from './deps.js'
import { openSession } from './openSession.js'
import { reserveAttemptOrThrow } from './reserveAttempt.js'

/**
 * Registro público: crea SIEMPRE un cliente sin tienda. El schema es estricto, por lo que
 * `role`/`storeId` del body se rechazan; aquí tampoco existe ningún camino para fijarlos.
 * El teléfono queda como contacto NO verificado.
 */
export const registerCustomer = async (deps: AuthDeps, input: unknown): Promise<IssuedSession> => {
  const parsed = registerRequestSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('Datos de registro inválidos', issuesFromZodError(parsed.error))
  }
  const { name, phone, password } = parsed.data

  await reserveAttemptOrThrow(deps, { bucket: REGISTER_GLOBAL_BUCKET, ...REGISTER_GLOBAL_POLICY })
  await reserveAttemptOrThrow(deps, {
    bucket: deps.keys.key('register:phone', phone),
    ...REGISTER_PHONE_POLICY,
  })

  const passwordHash = await deps.hasher.hash(password)
  const now = deps.clock.nowIso()
  const account: StoredAccount = {
    id: deps.ids.accountId(),
    role: 'customer',
    name,
    phone,
    email: null,
    storeId: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    passwordHash,
  }
  await deps.repository.createAccount(account)

  return openSession(deps, toPublicAccount(account))
}
