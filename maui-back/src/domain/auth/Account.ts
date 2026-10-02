import {
  STAFF_ROLES,
  type AccountRole,
  type StaffRole,
} from '../../../../shared/contracts/index.js'

export type AccountStatus = 'active' | 'disabled'

/**
 * Cuenta sin material secreto. Cliente: `phone` (contacto no verificado), sin email ni
 * tienda. Staff (owner/operator): `email` y `storeId` fijados por el servidor, sin phone.
 */
export interface Account {
  /** Aleatorio y opaco; nunca derivado del teléfono. */
  id: string
  role: AccountRole
  name: string
  phone: string | null
  email: string | null
  storeId: string | null
  status: AccountStatus
  /** ISO UTC. */
  createdAt: string
  updatedAt: string
}

/** Cuenta con hash de contraseña: solo para repositorio y casos de uso de credenciales. */
export interface StoredAccount extends Account {
  passwordHash: string
}

export const isStaffRole = (role: AccountRole): role is StaffRole =>
  (STAFF_ROLES as readonly string[]).includes(role)

/** Invariante rol ↔ identidad. Una cuenta incoherente se trata como inválida (deniega). */
export const hasConsistentIdentity = (account: Account): boolean =>
  account.role === 'customer'
    ? account.phone !== null && account.email === null && account.storeId === null
    : isStaffRole(account.role) &&
      account.email !== null &&
      account.storeId !== null &&
      account.phone === null

export const toPublicAccount = ({ passwordHash: _passwordHash, ...account }: StoredAccount): Account => account
