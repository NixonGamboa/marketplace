import type { Account } from '../../domain/auth/Account.js'
import type { AuthRepository } from '../../domain/auth/AuthRepository.js'
import type {
  AuthIdGenerator,
  BucketKeyer,
  PasswordHasher,
  SessionTokenService,
} from '../../domain/auth/ports.js'
import type { Clock } from '../../shared/clock.js'

/** Dependencias inyectadas: clock, crypto y tokens son puertos, así los casos de uso son portables. */
export interface AuthDeps {
  repository: AuthRepository
  hasher: PasswordHasher
  tokens: SessionTokenService
  ids: AuthIdGenerator
  keys: BucketKeyer
  clock: Clock
}

/**
 * Sesión recién abierta. `token` es solo para que el adaptador HTTP lo ponga en la
 * cookie HttpOnly: no debe copiarse a ningún cuerpo de respuesta.
 */
export interface IssuedSession {
  token: string
  account: Account
  expiresAt: string
}
