import { describe, expect, it } from 'vitest'
import { EnvironmentGuardError, assertDatabaseIdentity, assertResetAllowed, assertSeedAllowed } from '../../src/usecases/seed/resetGuard.js'

const TEST_HOST = 'ep-dev-branch-123.us-east-2.aws.neon.tech'
const PROD_HOST = 'ep-prod-branch-456.us-east-2.aws.neon.tech'
const PASSWORD = 'clave-secreta-de-prueba'

const validEnv = (overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  APP_ENV: 'test',
  NODE_ENV: 'production',
  DB_DRIVER: 'postgres',
  DATABASE_URL: `postgresql://usuario:${PASSWORD}@${TEST_HOST}/maui?sslmode=require`,
  TEST_DATABASE_HOST: TEST_HOST,
  TEST_DATABASE_NAME: 'maui',
  PRODUCTION_DATABASE_HOST: PROD_HOST,
  PRODUCTION_DATABASE_NAME: 'maui',
  RESET_TARGET: 'dev/maui',
  ...overrides,
})

const reasonOf = (action: () => unknown): string => {
  try {
    action()
  } catch (error) {
    if (error instanceof EnvironmentGuardError) {
      expect(JSON.stringify([error.message, error.reason])).not.toContain(PASSWORD)
      expect(error.message).not.toContain('postgresql://')
      return error.reason
    }
    throw error
  }
  return 'ALLOWED'
}

describe('guard del reset (assertResetAllowed)', () => {
  it('permite únicamente APP_ENV=test + postgres + destino dev/maui declarado y aislado', () => {
    expect(assertResetAllowed(validEnv())).toEqual({ host: TEST_HOST, database: 'maui' })
  })

  it('el pooler de Neon del mismo endpoint es el mismo destino', () => {
    const pooler = TEST_HOST.replace('-123.', '-123-pooler.')
    expect(assertResetAllowed(validEnv({ DATABASE_URL: `postgresql://u:${PASSWORD}@${pooler}/maui` })).host).toBe(TEST_HOST)
  })

  it.each([
    ['APP_ENV local, aunque NODE_ENV sea test', { APP_ENV: 'local', NODE_ENV: 'test' }, 'APP_ENV_NOT_TEST'],
    ['APP_ENV production', { APP_ENV: 'production' }, 'APP_ENV_NOT_TEST'],
    ['sin APP_ENV, solo NODE_ENV=test', { APP_ENV: undefined, NODE_ENV: 'test' }, 'APP_ENV_NOT_TEST'],
    ['VERCEL_ENV production', { VERCEL_ENV: 'production' }, 'VERCEL_ENV_PRODUCTION'],
    ['DB_DRIVER ausente (el valor por defecto no basta)', { DB_DRIVER: undefined }, 'DB_DRIVER_NOT_POSTGRES'],
    ['DB_DRIVER memory', { DB_DRIVER: 'memory' }, 'DB_DRIVER_NOT_POSTGRES'],
    ['PGHOST ambiental', { PGHOST: 'otro-host.example' }, 'AMBIENT_DATABASE_OVERRIDE'],
    ['PGDATABASE ambiental', { PGDATABASE: 'otra' }, 'AMBIENT_DATABASE_OVERRIDE'],
    ['PGOPTIONS ambiental', { PGOPTIONS: '-c search_path=otro' }, 'AMBIENT_DATABASE_OVERRIDE'],
    ['sin RESET_TARGET', { RESET_TARGET: undefined }, 'RESET_TARGET_NOT_DECLARED'],
    ['RESET_TARGET vacío', { RESET_TARGET: '' }, 'RESET_TARGET_NOT_DECLARED'],
    ['RESET_TARGET main/maui', { RESET_TARGET: 'main/maui' }, 'RESET_TARGET_NOT_ALLOWED'],
    ['RESET_TARGET con espacio final', { RESET_TARGET: 'dev/maui ' }, 'RESET_TARGET_NOT_ALLOWED'],
    ['DATABASE_URL de Production', { DATABASE_URL: `postgresql://u:${PASSWORD}@${PROD_HOST}/maui` }, 'CONFIG_TEST_TARGETS_PRODUCTION'],
    ['DATABASE_URL de otro host', { DATABASE_URL: `postgresql://u:${PASSWORD}@otro.example.com/maui` }, 'CONFIG_TEST_DATABASE_TARGET_MISMATCH'],
    ['DATABASE_URL de otra base en el host de test', { DATABASE_URL: `postgresql://u:${PASSWORD}@${TEST_HOST}/otra` }, 'CONFIG_TEST_DATABASE_TARGET_MISMATCH'],
    ['host de test igual al de Production', { PRODUCTION_DATABASE_HOST: TEST_HOST }, 'CONFIG_DATABASE_ENDPOINTS_NOT_ISOLATED'],
    ['destino de test sin declarar', { TEST_DATABASE_HOST: undefined }, 'CONFIG_TEST_DATABASE_HOST_REQUIRED'],
    ['DATABASE_URL con parámetros no permitidos', { DATABASE_URL: `postgresql://u:${PASSWORD}@${TEST_HOST}/maui?options=otro` }, 'CONFIG_DATABASE_URL_QUERY_NOT_ALLOWED'],
    ['sin DATABASE_URL', { DATABASE_URL: undefined }, 'CONFIG_DATABASE_URL_REQUIRED'],
  ])('rechaza: %s', (_name, overrides, reason) => {
    expect(reasonOf(() => assertResetAllowed(validEnv(overrides)))).toBe(reason)
  })

  it('rechaza una base declarada distinta de la de RESET_TARGET aunque el host sea el de test', () => {
    const env = validEnv({ TEST_DATABASE_NAME: 'otra', DATABASE_URL: `postgresql://u:${PASSWORD}@${TEST_HOST}/otra` })
    expect(reasonOf(() => assertResetAllowed(env))).toBe('RESET_TARGET_DATABASE_MISMATCH')
  })
})

describe('guard del seed (assertSeedAllowed)', () => {
  it('permite test aislado y local con base loopback', () => {
    expect(assertSeedAllowed(validEnv()).host).toBe(TEST_HOST)
    const local = { APP_ENV: 'local', NODE_ENV: 'development', DB_DRIVER: 'postgres', DATABASE_URL: 'postgresql://u:p@localhost:5432/maui_local' }
    expect(assertSeedAllowed(local)).toEqual({ host: 'localhost', database: 'maui_local' })
  })

  it.each([
    ['production', { APP_ENV: 'production', NODE_ENV: 'production' }, 'APP_ENV_PRODUCTION'],
    ['APP_ENV desconocido', { APP_ENV: 'staging' }, 'APP_ENV_NOT_TEST'],
    ['Vercel Production', { VERCEL_ENV: 'production' }, 'VERCEL_ENV_PRODUCTION'],
    ['memory', { DB_DRIVER: 'memory' }, 'DB_DRIVER_NOT_POSTGRES'],
    ['host de Production', { DATABASE_URL: `postgresql://u:${PASSWORD}@${PROD_HOST}/maui` }, 'CONFIG_TEST_TARGETS_PRODUCTION'],
    ['PGHOST ambiental', { PGHOST: 'x' }, 'AMBIENT_DATABASE_OVERRIDE'],
  ])('rechaza %s', (_name, overrides, reason) => {
    expect(reasonOf(() => assertSeedAllowed(validEnv(overrides)))).toBe(reason)
  })

  it('local con una base remota se rechaza', () => {
    const local = { APP_ENV: 'local', DB_DRIVER: 'postgres', DATABASE_URL: `postgresql://u:${PASSWORD}@${TEST_HOST}/maui` }
    expect(reasonOf(() => assertSeedAllowed(local))).toBe('CONFIG_REMOTE_DATABASE_REQUIRES_DECLARED_ENVIRONMENT')
  })
})

describe('identidad real de la base', () => {
  it('la base reportada por el servidor debe ser la declarada', () => {
    expect(() => assertDatabaseIdentity({ host: TEST_HOST, database: 'maui' }, 'maui')).not.toThrow()
    expect(() => assertDatabaseIdentity({ host: TEST_HOST, database: 'maui' }, 'otra')).toThrow(EnvironmentGuardError)
  })
})
