import type { AuthRepository } from '../../domain/auth/AuthRepository.js'
import { getConfig } from '../../shared/config.js'
import { systemClock } from '../../shared/clock.js'
import type { AuthDeps } from '../../usecases/auth/deps.js'
import { getAuthConfig, type AuthConfig } from './config.js'
import { JoseSessionTokenService } from './JoseSessionTokenService.js'
import { HmacBucketKeyer, RandomAuthIds } from './randomIds.js'
import { ScryptPasswordHasher } from './ScryptPasswordHasher.js'

export interface AuthRuntime {
  config: AuthConfig
  deps: AuthDeps
}

let pending: Promise<AuthRuntime> | null = null

const createRepository = async (): Promise<AuthRepository> => {
  // Valida aislamiento de BD (y veta memory en deploy) antes de crear ningún cliente.
  if (getConfig().DB_DRIVER === 'memory') {
    const { AuthRepositoryMemory } = await import('../memory/AuthRepositoryMemory.js')
    return new AuthRepositoryMemory()
  }
  const { db } = await import('../postgres/client.js')
  const { AuthRepositoryPostgres } = await import('../postgres/AuthRepositoryPostgres.js')
  return new AuthRepositoryPostgres(db)
}

const createRuntime = async (): Promise<AuthRuntime> => {
  const config = getAuthConfig()
  const repository = await createRepository()
  return {
    config,
    deps: {
      repository,
      hasher: new ScryptPasswordHasher(),
      tokens: new JoseSessionTokenService({
        secret: config.secret,
        issuer: config.issuer,
        audience: config.audience,
      }),
      ids: new RandomAuthIds(),
      keys: new HmacBucketKeyer(config.secret),
      clock: systemClock,
    },
  }
}

/**
 * Composición lazy de auth, separada del factory de pedidos. Se cachea la promesa (el
 * repositorio memory es con estado, no debe duplicarse con llamadas concurrentes) y se
 * descarta si falla, para que corregir la configuración no exija reiniciar.
 */
export const getAuthRuntime = (): Promise<AuthRuntime> => {
  pending ??= createRuntime().catch((error: unknown) => {
    pending = null
    throw error
  })
  return pending
}
