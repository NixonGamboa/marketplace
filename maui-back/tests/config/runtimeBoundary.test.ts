import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { neon } = vi.hoisted(() => ({ neon: vi.fn() }))
vi.mock('@neondatabase/serverless', () => ({ neon }))

describe('configuración antes del adapter', () => {
  beforeEach(() => {
    vi.resetModules()
    neon.mockClear()
    vi.stubEnv('APP_ENV', 'test')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('DB_DRIVER', 'postgres')
    vi.stubEnv('DATABASE_URL', undefined)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('factory se importa sin abrir DB y rechaza config incompleta al operar', async () => {
    const { getRepositories } = await import('../../src/infra/factory.js')
    expect(neon).not.toHaveBeenCalled()
    await expect(getRepositories()).rejects.toMatchObject({ code: 'INVALID_CONFIGURATION' })
    expect(neon).not.toHaveBeenCalled()
  })

  it('local memory crea repository sin invocar el adapter Postgres', async () => {
    vi.stubEnv('APP_ENV', 'local')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', undefined)
    vi.stubEnv('DB_DRIVER', 'memory')
    const { getRepositories } = await import('../../src/infra/factory.js')
    await expect(getRepositories()).resolves.toHaveProperty('orders')
    expect(neon).not.toHaveBeenCalled()
  })
})
