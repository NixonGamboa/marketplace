import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const initialArguments = process.argv

describe('config de herramientas Drizzle', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('APP_ENV', 'local')
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('VERCEL_ENV', undefined)
    vi.stubEnv('DB_DRIVER', 'postgres')
    vi.stubEnv('DATABASE_URL', undefined)
    vi.stubEnv('PRODUCTION_DATABASE_HOST', undefined)
  })
  afterEach(() => {
    process.argv = initialArguments
    vi.unstubAllEnvs()
  })

  it.each(['generate', 'check', 'export'])('%s conserva operaciones offline sin credenciales', async command => {
    process.argv = ['node', 'drizzle-kit', command]
    const { default: config } = await import('../../drizzle.config.js')
    expect(config).not.toHaveProperty('dbCredentials')
  })

  it.each(['migrate', 'push', 'studio', 'pull'])('%s falla antes de acceder a URL remota no declarada', async command => {
    process.argv = ['node', 'drizzle-kit', command]
    vi.stubEnv('DATABASE_URL', 'postgresql://u:secreto@ep-production.neon.tech/maui')
    await expect(import('../../drizzle.config.js')).rejects.toMatchObject({ code: 'INVALID_CONFIGURATION' })
  })

  it('operación DB solo entrega credenciales después de validar destino', async () => {
    process.argv = ['node', 'drizzle-kit', 'studio']
    vi.stubEnv('DATABASE_URL', 'postgresql://u:secreto@localhost/maui')
    const { default: config } = await import('../../drizzle.config.js')
    expect(config).toHaveProperty('dbCredentials.url', 'postgresql://u:secreto@localhost/maui')
  })
})
