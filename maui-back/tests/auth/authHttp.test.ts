import type { VercelResponse } from '@vercel/node'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthRepositoryMemory } from '../../src/infra/memory/AuthRepositoryMemory.js'
import { LOGIN_ATTEMPT_POLICY } from '../../src/domain/auth/policy.js'
import { createStaffAccount } from '../../src/usecases/auth/createStaffAccount.js'
import { CUSTOMER_INPUT, CUSTOMER_PHONE, STAFF_INPUT } from './fixtures.js'
import {
  HTTP_ORIGIN,
  HTTP_SECRET,
  authRequest,
  bodyOf,
  cookiePair,
  headerNames,
  headerOf,
  mockResponse,
  statusOf,
} from './httpFixture.js'

const { checkConnection } = vi.hoisted(() => ({ checkConnection: vi.fn() }))
vi.mock('../../src/infra/postgres/health.js', () => ({ postgresHealthProbe: { checkConnection } }))

// Los hashes scrypt reales (N=32768, p=3) tardan cientos de ms por llamada.
vi.setConfig({ testTimeout: 30_000 })

const handlers = {
  register: () => import('../../../api/auth/register.js'),
  login: () => import('../../../api/auth/login.js'),
  session: () => import('../../../api/auth/session.js'),
  logout: () => import('../../../api/auth/logout.js'),
}

async function call(name: keyof typeof handlers, req: ReturnType<typeof authRequest>) {
  const { default: handler } = await handlers[name]()
  const res = mockResponse()
  await handler(req, res as unknown as VercelResponse)
  return res
}

const registerBody = { name: CUSTOMER_INPUT.name, phone: CUSTOMER_INPUT.phone, password: CUSTOMER_INPUT.password }
const phoneLoginBody = { method: 'phone', phone: CUSTOMER_INPUT.phone, password: CUSTOMER_INPUT.password }

const LOCAL_COOKIE = /^maui_session=[\w-]+\.[\w-]+\.[\w-]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800$/

beforeEach(() => {
  vi.resetModules()
  checkConnection.mockReset().mockResolvedValue(undefined)
  vi.stubEnv('APP_ENV', 'local')
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('VERCEL_ENV', undefined)
  vi.stubEnv('DB_DRIVER', 'memory')
  vi.stubEnv('AUTH_JWT_SECRET', HTTP_SECRET)
  vi.stubEnv('AUTH_ORIGIN', HTTP_ORIGIN)
})
afterEach(() => vi.unstubAllEnvs())

async function runtime() {
  const { getAuthRuntime } = await import('../../src/infra/auth/factory.js')
  return getAuthRuntime()
}

async function registered() {
  const res = await call('register', authRequest({ body: registerBody }))
  expect(statusOf(res)).toBe(201)
  return { res, cookie: cookiePair(res) }
}

describe('POST /api/auth/register', () => {
  it('crea el cliente, responde 201 con DTO y entrega el token solo por cookie', async () => {
    const { res, cookie } = await registered()
    const body = bodyOf(res) as { account: Record<string, unknown>; expiresAt: string }

    expect(body.account).toEqual({
      id: expect.stringMatching(/^acc_/),
      role: 'customer',
      name: 'Ana Pérez',
      phone: CUSTOMER_PHONE,
      phoneVerified: false,
    })
    expect(Object.keys(body).sort()).toEqual(['account', 'expiresAt'])
    expect(headerOf(res, 'Set-Cookie')).toMatch(LOCAL_COOKIE)
    const token = cookie.split('=')[1] as string
    expect(JSON.stringify(body)).not.toContain(token)
    expect(JSON.stringify(body)).not.toMatch(/scrypt|passwordHash/)
  })

  it('todas las respuestas son no-store y sin cabeceras CORS', async () => {
    for (const res of [
      (await registered()).res,
      await call('register', authRequest({ method: 'GET' })),
      await call('register', authRequest({ headers: { origin: 'https://evil.example' }, body: registerBody })),
    ]) {
      expect(headerOf(res, 'Cache-Control')).toBe('no-store, no-cache, max-age=0, must-revalidate')
      expect(headerOf(res, 'Pragma')).toBe('no-cache')
      expect(headerNames(res).some(name => name.startsWith('access-control-'))).toBe(false)
    }
  })

  it('rechaza role/storeId (400) sin repetir la contraseña ni crear la cuenta', async () => {
    const res = await call('register', authRequest({ body: { ...registerBody, role: 'owner', storeId: 'leche-y-miel' } }))
    expect(statusOf(res)).toBe(400)
    expect(bodyOf(res)).toMatchObject({ error: 'VALIDATION_ERROR' })
    expect(JSON.stringify(bodyOf(res))).not.toContain(CUSTOMER_INPUT.password)
    expect(headerOf(res, 'Set-Cookie')).toBeUndefined()
    expect(await (await runtime()).deps.repository.findAccountByPhone(CUSTOMER_PHONE)).toBeNull()
  })

  it('un teléfono ya registrado responde 409 genérico sin datos', async () => {
    await registered()
    const res = await call('register', authRequest({ body: registerBody }))
    expect(statusOf(res)).toBe(409)
    expect(bodyOf(res)).toEqual({ error: 'ACCOUNT_CONFLICT', message: 'No fue posible crear la cuenta' })
    expect(headerOf(res, 'Set-Cookie')).toBeUndefined()
  })
})

describe('guardas de petición (origen, método, contenido, tamaño)', () => {
  it.each([
    ['sin Origin', undefined],
    ['otro origen', 'https://evil.example'],
    ['barra final', `${HTTP_ORIGIN}/`],
    ['null', 'null'],
  ])('rechaza 403 con %s', async (_case, origin) => {
    for (const name of ['register', 'login', 'logout'] as const) {
      const res = await call(name, authRequest({ headers: { origin }, body: name === 'logout' ? undefined : registerBody }))
      expect(statusOf(res)).toBe(403)
      expect(bodyOf(res)).toMatchObject({ error: 'FORBIDDEN_ORIGIN' })
    }
  })

  it('no deriva el origen confiable de Host/X-Forwarded-*', async () => {
    const res = await call(
      'register',
      authRequest({
        headers: {
          origin: 'https://evil.example',
          host: 'evil.example',
          'x-forwarded-host': 'evil.example',
          'x-forwarded-proto': 'https',
        },
        body: registerBody,
      }),
    )
    expect(statusOf(res)).toBe(403)
  })

  it.each(['GET', 'PUT', 'DELETE', 'OPTIONS'])('register/login/logout rechazan %s con 405 y Allow: POST', async method => {
    for (const name of ['register', 'login', 'logout'] as const) {
      const res = await call(name, authRequest({ method }))
      expect(statusOf(res)).toBe(405)
      expect(headerOf(res, 'Allow')).toBe('POST')
    }
  })

  it.each(['POST', 'PUT', 'HEAD'])('session solo admite GET (%s → 405)', async method => {
    const res = await call('session', authRequest({ method }))
    expect(statusOf(res)).toBe(405)
    expect(headerOf(res, 'Allow')).toBe('GET')
  })

  it.each([
    ['text/plain', 'text/plain'],
    ['sin Content-Type', undefined],
    ['charset distinto de utf-8', 'application/json; charset=latin1'],
    ['form', 'application/x-www-form-urlencoded'],
  ])('exige application/json (%s → 415)', async (_case, contentType) => {
    const res = await call('register', authRequest({ headers: { 'content-type': contentType }, body: registerBody }))
    expect(statusOf(res)).toBe(415)
    expect(bodyOf(res)).toMatchObject({ error: 'UNSUPPORTED_MEDIA_TYPE' })
  })

  it('acepta application/json con charset=utf-8 en cualquier capitalización', async () => {
    const res = await call('register', authRequest({ headers: { 'content-type': 'Application/JSON; Charset=UTF-8' }, body: registerBody }))
    expect(statusOf(res)).toBe(201)
  })

  it('limita el tamaño: declarado y real', async () => {
    const declared = await call('register', authRequest({ body: registerBody, contentLength: 5000 }))
    expect(statusOf(declared)).toBe(413)
    const real = await call('register', authRequest({ body: { ...registerBody, name: 'x'.repeat(5000) }, headers: { 'content-length': undefined } }))
    expect(statusOf(real)).toBe(413)
  })

  it.each([
    ['arreglo', [] as unknown],
    ['texto', 'hola' as unknown],
    ['null', null as unknown],
  ])('rechaza un body que no es un objeto JSON: %s', async (_case, body) => {
    const res = await call('register', authRequest({ body }))
    expect(statusOf(res)).toBe(400)
  })

  it('un JSON inválido (el getter del runtime lanza) responde 400 sin detalles', async () => {
    const res = await call('register', authRequest({ bodyThrows: true, headers: { 'content-length': '10' } }))
    expect(statusOf(res)).toBe(400)
    expect(bodyOf(res)).toEqual({ error: 'INVALID_JSON', message: 'JSON inválido' })
  })
})

describe('login, session y logout', () => {
  it('login por teléfono: 200, cookie de sesión y DTO sin token', async () => {
    await registered()
    const res = await call('login', authRequest({ body: phoneLoginBody }))
    expect(statusOf(res)).toBe(200)
    expect(headerOf(res, 'Set-Cookie')).toMatch(LOCAL_COOKIE)
    expect(Object.keys(bodyOf(res) as object).sort()).toEqual(['account', 'expiresAt'])
  })

  it('credenciales erróneas y cuenta inexistente responden idéntico (401 genérico)', async () => {
    await registered()
    const wrong = await call('login', authRequest({ body: { ...phoneLoginBody, password: 'otra-clave-123' } }))
    const unknown = await call('login', authRequest({ body: { ...phoneLoginBody, phone: '3000000000' } }))
    expect(statusOf(wrong)).toBe(401)
    expect(statusOf(unknown)).toBe(401)
    expect(bodyOf(wrong)).toEqual(bodyOf(unknown))
    expect(bodyOf(wrong)).toEqual({ error: 'UNAUTHENTICATED', message: 'Credenciales o sesión inválidas' })
    expect(headerOf(wrong, 'Set-Cookie')).toBeUndefined()
  })

  it('el límite persistente de intentos responde 429 con Retry-After', async () => {
    await registered()
    const { deps } = await runtime()
    const bucket = deps.keys.key('login:phone', CUSTOMER_PHONE)
    for (let i = 0; i < LOGIN_ATTEMPT_POLICY.limit; i += 1) {
      await deps.repository.reserveAttempt({ bucket, ...LOGIN_ATTEMPT_POLICY }, deps.clock.nowIso())
    }
    const res = await call('login', authRequest({ body: phoneLoginBody }))
    expect(statusOf(res)).toBe(429)
    expect(bodyOf(res)).toMatchObject({ error: 'RATE_LIMITED' })
    expect(Number(headerOf(res, 'Retry-After'))).toBeGreaterThanOrEqual(1)
    expect(headerOf(res, 'Set-Cookie')).toBeUndefined()
  })

  it('session: 200 con la cookie; sin cookie o alterada 401 y cookie borrada', async () => {
    const { cookie } = await registered()
    const ok = await call('session', authRequest({ method: 'GET', headers: { cookie } }))
    expect(statusOf(ok)).toBe(200)
    expect(bodyOf(ok)).toMatchObject({ account: { role: 'customer', phone: CUSTOMER_PHONE, phoneVerified: false } })

    const tampered = `${cookie.slice(0, -4)}${cookie.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`
    for (const headers of [{}, { cookie: tampered }, { cookie: 'maui_session=basura' }]) {
      const res = await call('session', authRequest({ method: 'GET', headers }))
      expect(statusOf(res)).toBe(401)
      expect(bodyOf(res)).toEqual({ error: 'UNAUTHENTICATED', message: 'Credenciales o sesión inválidas' })
      expect(headerOf(res, 'Set-Cookie')).toMatch(/^maui_session=; .*Max-Age=0/)
    }
  })

  it('logout revoca en el servidor, borra la cookie con los mismos atributos y el token deja de valer', async () => {
    const { cookie } = await registered()
    const res = await call('logout', authRequest({ headers: { cookie } }))
    expect(statusOf(res)).toBe(204)
    expect(res.end).toHaveBeenCalledOnce()
    expect(headerOf(res, 'Set-Cookie')).toBe(
      'maui_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    )

    const after = await call('session', authRequest({ method: 'GET', headers: { cookie } }))
    expect(statusOf(after)).toBe(401)
  })

  it('logout es idempotente sin cookie y acepta cuerpo {} pero no otro', async () => {
    expect(statusOf(await call('logout', authRequest()))).toBe(204)
    expect(statusOf(await call('logout', authRequest({ body: {} })))).toBe(204)
    expect(statusOf(await call('logout', authRequest({ body: { a: 1 } })))).toBe(400)
  })

  it('el rol y la tienda del staff salen de la BD y un cambio aplica en la siguiente lectura', async () => {
    const { deps } = await runtime()
    await createStaffAccount(deps, STAFF_INPUT)
    const loginRes = await call('login', authRequest({ body: { method: 'email', email: STAFF_INPUT.email, password: STAFF_INPUT.password } }))
    expect(statusOf(loginRes)).toBe(200)
    expect(bodyOf(loginRes)).toMatchObject({ account: { role: 'owner', email: STAFF_INPUT.email, storeId: 'leche-y-miel' } })

    const cookie = cookiePair(loginRes)
    const account = await deps.repository.findAccountByEmail(STAFF_INPUT.email)
    ;(deps.repository as AuthRepositoryMemory).patchAccount(account?.id as string, { role: 'operator', storeId: 'otra-tienda' })
    const session = await call('session', authRequest({ method: 'GET', headers: { cookie } }))
    expect(bodyOf(session)).toMatchObject({ account: { role: 'operator', storeId: 'otra-tienda' } })

    ;(deps.repository as AuthRepositoryMemory).patchAccount(account?.id as string, { status: 'disabled' })
    expect(statusOf(await call('session', authRequest({ method: 'GET', headers: { cookie } })))).toBe(401)
  })
})

describe('configuración y aislamiento', () => {
  const unavailable = { error: 'SERVICE_UNAVAILABLE', message: 'Servicio no disponible' }

  it.each(['AUTH_JWT_SECRET', 'AUTH_ORIGIN'])('sin %s los endpoints responden 503 genérico (sin fallback)', async variable => {
    vi.stubEnv(variable, undefined)
    for (const name of ['register', 'login', 'logout'] as const) {
      const res = await call(name, authRequest({ body: registerBody }))
      expect(statusOf(res)).toBe(503)
      expect(bodyOf(res)).toEqual(unavailable)
    }
    const session = await call('session', authRequest({ method: 'GET' }))
    expect(statusOf(session)).toBe(503)
    expect(JSON.stringify(bodyOf(session))).not.toContain(variable)
  })

  it('un secreto demasiado corto también da 503', async () => {
    vi.stubEnv('AUTH_JWT_SECRET', Buffer.alloc(16, 1).toString('base64'))
    expect(statusOf(await call('register', authRequest({ body: registerBody })))).toBe(503)
  })

  it('DB_DRIVER=memory fuera de local/test se veta por la guarda existente (503)', async () => {
    vi.stubEnv('APP_ENV', 'test')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('AUTH_ORIGIN', 'https://maui-test.example.com')
    const res = await call('register', authRequest({ headers: { origin: 'https://maui-test.example.com' }, body: registerBody }))
    expect(statusOf(res)).toBe(503)
    expect(bodyOf(res)).toEqual(unavailable)
  })

  it('/api/health sigue funcionando sin configuración de auth (validación lazy)', async () => {
    vi.stubEnv('AUTH_JWT_SECRET', undefined)
    vi.stubEnv('AUTH_ORIGIN', undefined)
    vi.stubEnv('DB_DRIVER', 'postgres')
    vi.stubEnv('DATABASE_URL', 'postgresql://usuario:secreto@localhost/maui')
    const { default: health } = await import('../../../api/health.js')
    const res = mockResponse()
    await health({ method: 'GET', headers: {} } as never, res as unknown as VercelResponse)
    expect(statusOf(res)).toBe(200)
    expect(checkConnection).toHaveBeenCalledOnce()
  })
})
