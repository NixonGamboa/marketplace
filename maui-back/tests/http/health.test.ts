import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiErrorSchema } from '../../../shared/contracts/errors.js'
import { request, response } from './responseFixture.js'

const { checkConnection } = vi.hoisted(() => ({ checkConnection: vi.fn() }))
vi.mock('../../src/infra/postgres/health.js', () => ({ postgresHealthProbe: { checkConnection } }))

describe('GET/HEAD health', () => {
  beforeEach(() => {
    vi.resetModules()
    checkConnection.mockReset().mockResolvedValue(undefined)
    vi.stubEnv('APP_ENV', 'local')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', undefined)
    vi.stubEnv('DB_DRIVER', 'postgres')
    vi.stubEnv('DATABASE_URL', 'postgresql://usuario:secreto@localhost/maui')
  })
  afterEach(() => vi.unstubAllEnvs())

  async function invoke(method = 'GET') {
    const { default: handler } = await import('../../../api/health.js')
    const fixture = response()
    await handler(request(method), fixture.http)
    return fixture.res
  }

  it('devuelve JSON 200 conectado solo con probe exitoso', async () => {
    const res = await invoke()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ status: 'ok', database: 'connected', environment: 'local', time: expect.any(String) })
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(checkConnection).toHaveBeenCalledOnce()
  })

  it('HEAD verifica DB y conserva status/content type sin cuerpo', async () => {
    const res = await invoke('HEAD')
    expect(checkConnection).toHaveBeenCalledOnce()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8')
    expect(res.end).toHaveBeenCalledOnce()
    expect(res.json).not.toHaveBeenCalled()
  })

  it('Preview con aislamiento declarado usa test y ejecuta el probe', async () => {
    vi.stubEnv('APP_ENV', 'test')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('DATABASE_URL', 'postgresql://usuario:secreto@ep-test-pooler.neon.tech/maui')
    vi.stubEnv('TEST_DATABASE_HOST', 'ep-test.neon.tech')
    vi.stubEnv('TEST_DATABASE_NAME', 'maui')
    vi.stubEnv('PRODUCTION_DATABASE_HOST', 'ep-production.neon.tech')
    vi.stubEnv('PRODUCTION_DATABASE_NAME', 'maui')
    const res = await invoke()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ environment: 'test', database: 'connected' }))
    expect(checkConnection).toHaveBeenCalledOnce()
  })

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])('método %s devuelve 405 y Allow sin acceder a DB', async method => {
    vi.stubEnv('APP_ENV', undefined)
    const res = await invoke(method)
    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET, HEAD')
    expect(apiErrorSchema.parse(res.json.mock.calls[0]?.[0]).error).toBe('METHOD_NOT_ALLOWED')
    expect(checkConnection).not.toHaveBeenCalled()
  })

  it('fallo de DB devuelve 503 sin URL, secreto, datos personales o error interno', async () => {
    checkConnection.mockRejectedValue(new Error('postgresql://cliente:secreto@host/db teléfono privado'))
    const res = await invoke()
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({ error: 'SERVICE_UNAVAILABLE', message: 'Servicio no disponible' })
    expect(apiErrorSchema.safeParse(res.json.mock.calls[0]?.[0]).success).toBe(true)
  })

  it('memory indica base no conectada y nunca ejecuta SELECT', async () => {
    vi.stubEnv('DB_DRIVER', 'memory')
    const res = await invoke()
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({ error: 'SERVICE_UNAVAILABLE', message: 'Base de datos no conectada' })
    expect(checkConnection).not.toHaveBeenCalled()
  })

  it('config incompleta se captura como JSON antes de crear conexión', async () => {
    vi.stubEnv('DATABASE_URL', undefined)
    const res = await invoke()
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({ error: 'SERVICE_UNAVAILABLE', message: 'Servicio no disponible' })
    expect(checkConnection).not.toHaveBeenCalled()
  })

  it('Preview no validado se rechaza antes de crear conexión', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const res = await invoke()
    expect(res.status).toHaveBeenCalledWith(503)
    expect(checkConnection).not.toHaveBeenCalled()
  })

  it('HEAD fallido también responde 503 sin cuerpo', async () => {
    checkConnection.mockRejectedValue(new Error('error privado'))
    const res = await invoke('HEAD')
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.end).toHaveBeenCalledOnce()
    expect(res.json).not.toHaveBeenCalled()
  })
})
