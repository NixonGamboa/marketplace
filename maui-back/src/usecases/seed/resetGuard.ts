import { ConfigurationError, databaseTarget, loadConfig } from '../../shared/config.js'
import { DomainError } from '../../shared/errors.js'

/**
 * Guards de entorno del seed y del reset (T-16). Se evalúan ANTES de abrir ninguna conexión y con
 * el entorno del proceso, también en el CLI local: `NODE_ENV` no autoriza nada. Solo devuelven
 * códigos de diagnóstico y el destino (host/base), nunca la URL ni sus credenciales.
 */

export type EnvironmentGuardCode =
  | 'APP_ENV_NOT_TEST'
  | 'APP_ENV_PRODUCTION'
  | 'DB_DRIVER_NOT_POSTGRES'
  | 'VERCEL_ENV_PRODUCTION'
  | 'AMBIENT_DATABASE_OVERRIDE'
  | 'RESET_TARGET_NOT_DECLARED'
  | 'RESET_TARGET_NOT_ALLOWED'
  | 'RESET_TARGET_DATABASE_MISMATCH'
  | 'RESET_TARGET_HOST_MISMATCH'
  | 'DATABASE_IDENTITY_MISMATCH'
  | `CONFIG_${string}`

export class EnvironmentGuardError extends DomainError {
  constructor(public readonly reason: EnvironmentGuardCode) {
    super(`Operación de seed rechazada por el guard de entorno: ${reason}`, 'SEED_GUARD_REJECTED')
    this.name = 'EnvironmentGuardError'
  }
}

/** Único destino de reset admitido: rama `dev`, base `maui`. La rama no viaja en la conexión: ver `assertResetAllowed`. */
export const ALLOWED_RESET_TARGETS: readonly string[] = ['dev/maui']
/** Endpoint actual y único de la rama dev; el pooler se normaliza en databaseTarget. */
export const RESET_DATABASE_HOST = 'ep-tiny-feather-aug4p4jh.c-10.us-east-1.aws.neon.tech'

/** Variables libpq que redirigirían un cliente: el seed solo usa `DATABASE_URL` validada. */
const AMBIENT_OVERRIDES = ['PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS'] as const

export interface DatabaseTarget {
  host: string
  database: string
}

const rejectAmbient = (env: NodeJS.ProcessEnv): void => {
  if (AMBIENT_OVERRIDES.some(name => env[name] !== undefined && env[name] !== '')) {
    throw new EnvironmentGuardError('AMBIENT_DATABASE_OVERRIDE')
  }
}

const validateIsolation = (env: NodeJS.ProcessEnv): DatabaseTarget => {
  try {
    loadConfig(env)
    return databaseTarget(env.DATABASE_URL)
  } catch (error) {
    if (error instanceof ConfigurationError) throw new EnvironmentGuardError(`CONFIG_${error.issues[0] ?? 'INVALID'}`)
    throw error
  }
}

/**
 * Seed: solo local o test, con Postgres explícito y el aislamiento de `loadConfig` (el destino de
 * test declarado y distinto de Production). Production y deploys de Vercel Production se rechazan.
 */
export const assertSeedAllowed = (env: NodeJS.ProcessEnv): DatabaseTarget => {
  if (env.APP_ENV === 'production') throw new EnvironmentGuardError('APP_ENV_PRODUCTION')
  if (env.APP_ENV !== 'test' && env.APP_ENV !== 'local') throw new EnvironmentGuardError('APP_ENV_NOT_TEST')
  if (env.VERCEL_ENV === 'production') throw new EnvironmentGuardError('VERCEL_ENV_PRODUCTION')
  if (env.DB_DRIVER !== 'postgres') throw new EnvironmentGuardError('DB_DRIVER_NOT_POSTGRES')
  rejectAmbient(env)
  return validateIsolation(env)
}

/**
 * Reset de fixtures: además del seed exige `APP_ENV=test` (no `local`) y declarar el destino exacto
 * `RESET_TARGET=dev/maui`, que debe coincidir con la base de la conexión. `loadConfig` ya obliga a que
 * host y base sean los de test declarados (`TEST_DATABASE_HOST`/`TEST_DATABASE_NAME`) y distintos de
 * Production. Además fija el endpoint conocido de dev: declarar otro host como test no lo autoriza.
 */
export const assertResetAllowed = (env: NodeJS.ProcessEnv): DatabaseTarget => {
  if (env.APP_ENV !== 'test') throw new EnvironmentGuardError('APP_ENV_NOT_TEST')
  if (env.VERCEL_ENV === 'production') throw new EnvironmentGuardError('VERCEL_ENV_PRODUCTION')
  if (env.DB_DRIVER !== 'postgres') throw new EnvironmentGuardError('DB_DRIVER_NOT_POSTGRES')
  rejectAmbient(env)
  const actual = validateIsolation(env)

  const declared = env.RESET_TARGET
  if (declared === undefined || declared === '') throw new EnvironmentGuardError('RESET_TARGET_NOT_DECLARED')
  if (!ALLOWED_RESET_TARGETS.includes(declared)) throw new EnvironmentGuardError('RESET_TARGET_NOT_ALLOWED')
  const [, database] = declared.split('/')
  if (actual.database !== database) throw new EnvironmentGuardError('RESET_TARGET_DATABASE_MISMATCH')
  if (actual.host !== RESET_DATABASE_HOST) throw new EnvironmentGuardError('RESET_TARGET_HOST_MISMATCH')

  return actual
}

/** La base a la que realmente se conectó el driver debe ser la declarada, no solo la de la URL. */
export const assertDatabaseIdentity = (target: DatabaseTarget, reportedDatabase: string): void => {
  if (reportedDatabase !== target.database) throw new EnvironmentGuardError('DATABASE_IDENTITY_MISMATCH')
}
