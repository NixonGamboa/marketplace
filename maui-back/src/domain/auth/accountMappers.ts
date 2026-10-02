import {
  accountDtoSchema,
  authSessionResponseSchema,
  type AccountDto,
  type AuthSessionResponse,
} from '../../../../shared/contracts/index.js'
import type { Account } from './Account.js'

/**
 * Proyección por lista blanca + validación runtime. Se arma campo a campo (nunca por
 * spread) para que un campo nuevo del modelo interno no se filtre al DTO.
 */
export const toAccountDto = (account: Account): AccountDto =>
  accountDtoSchema.parse(
    account.role === 'customer'
      ? {
          id: account.id,
          role: account.role,
          name: account.name,
          phone: account.phone,
          phoneVerified: false,
        }
      : {
          id: account.id,
          role: account.role,
          name: account.name,
          email: account.email,
          storeId: account.storeId,
        },
  )

export const toAuthSessionResponse = (account: Account, expiresAt: string): AuthSessionResponse =>
  authSessionResponseSchema.parse({ account: toAccountDto(account), expiresAt })
