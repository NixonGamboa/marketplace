import { issuesFromZodError, registerRequestSchema } from '../../../../shared/contracts/index.js'
import { toPublicAccount, type Account, type StoredAccount } from '../../domain/auth/Account.js'
import { ValidationError } from '../../shared/errors.js'
import type { AuthDeps } from './deps.js'

/**
 * Alta controlada de un cliente para el seed de servidor (T-16). Aplica el mismo contrato que el
 * registro público (nombre, celular canónico, política de contraseña) y crea la misma cuenta
 * `customer` sin email ni tienda, pero no abre sesión ni consume la cota pública de registro.
 * No hay endpoint: solo la invocan el seed y las pruebas.
 */
export const createCustomerAccount = async (
  deps: Pick<AuthDeps, 'repository' | 'hasher' | 'ids' | 'clock'>,
  input: unknown,
): Promise<Account> => {
  const parsed = registerRequestSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('Datos de cuenta inválidos', issuesFromZodError(parsed.error))
  }
  const { name, phone, password } = parsed.data

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
    passwordHash: await deps.hasher.hash(password),
  }
  await deps.repository.createAccount(account)
  return toPublicAccount(account)
}
