import { z } from 'zod'
import {
  STAFF_ROLES,
  accountNameSchema,
  emailInputSchema,
  entityIdSchema,
  issuesFromZodError,
  newPasswordSchema,
} from '../../../../shared/contracts/index.js'
import { toPublicAccount, type Account, type StoredAccount } from '../../domain/auth/Account.js'
import { ValidationError } from '../../shared/errors.js'
import type { AuthDeps } from './deps.js'

/** Esquema interno del servidor: NO es un contrato público ni se expone por HTTP. */
const staffAccountInputSchema = z
  .object({
    role: z.enum(STAFF_ROLES),
    name: accountNameSchema,
    email: emailInputSchema,
    storeId: entityIdSchema,
    password: newPasswordSchema,
  })
  .strict()

export type StaffAccountInput = z.input<typeof staffAccountInputSchema>

/**
 * Alta controlada de owner/operator con email y tienda fijados por el servidor.
 * Solo la invocan tests y, más adelante, el seed/bootstrap de T-16; no hay endpoint,
 * cuenta demo ni bootstrap público.
 */
export const createStaffAccount = async (
  deps: Pick<AuthDeps, 'repository' | 'hasher' | 'ids' | 'clock'>,
  input: StaffAccountInput,
): Promise<Account> => {
  const parsed = staffAccountInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('Datos de cuenta inválidos', issuesFromZodError(parsed.error))
  }
  const { role, name, email, storeId, password } = parsed.data

  const now = deps.clock.nowIso()
  const account: StoredAccount = {
    id: deps.ids.accountId(),
    role,
    name,
    phone: null,
    email,
    storeId,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    passwordHash: await deps.hasher.hash(password),
  }
  await deps.repository.createAccount(account)
  return toPublicAccount(account)
}
