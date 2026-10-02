import { describe, expect, it } from 'vitest'
import { toAuthSessionResponse } from '../../src/domain/auth/accountMappers.js'
import {
  AccountConflictError,
  AuthenticationError,
  AuthorizationError,
  RateLimitedError,
} from '../../src/domain/auth/errors.js'
import {
  LOGIN_ATTEMPT_POLICY,
  LOGIN_GLOBAL_POLICY,
  REGISTER_GLOBAL_POLICY,
  REGISTER_PHONE_POLICY,
  SESSION_TTL_SECONDS,
} from '../../src/domain/auth/policy.js'
import { ValidationError } from '../../src/shared/errors.js'
import { authenticateSession } from '../../src/usecases/auth/authenticateSession.js'
import { createStaffAccount } from '../../src/usecases/auth/createStaffAccount.js'
import { login } from '../../src/usecases/auth/login.js'
import { logout } from '../../src/usecases/auth/logout.js'
import { registerCustomer } from '../../src/usecases/auth/registerCustomer.js'
import { requireRole } from '../../src/usecases/auth/requireRole.js'
import { CUSTOMER_INPUT, CUSTOMER_PHONE, STAFF_INPUT, createAuthFixture } from './fixtures.js'

const phoneLogin = (password: string = CUSTOMER_INPUT.password, phone: string = CUSTOMER_INPUT.phone) => ({ method: 'phone', phone, password })
const emailLogin = (password: string = STAFF_INPUT.password, email: string = STAFF_INPUT.email) => ({ method: 'email', email, password })
const distinctPhone = (index: number): string => `3${(100000000 + index).toString()}`

describe('registerCustomer', () => {
  it('crea un cliente sin tienda, con id aleatorio y teléfono no verificado', async () => {
    const { deps, repository, clock } = createAuthFixture()
    const issued = await registerCustomer(deps, CUSTOMER_INPUT)

    expect(issued.account).toMatchObject({ role: 'customer', name: 'Ana Pérez', phone: CUSTOMER_PHONE, email: null, storeId: null, status: 'active' })
    expect(issued.account.id).toMatch(/^acc_[A-Za-z0-9_-]{22}$/)
    expect(issued.account.id).not.toContain(CUSTOMER_PHONE)
    expect(issued.account).not.toHaveProperty('passwordHash')
    expect(JSON.stringify(toAuthSessionResponse(issued.account, issued.expiresAt))).toContain('"phoneVerified":false')

    const stored = await repository.findAccountByPhone(CUSTOMER_PHONE)
    expect(stored?.passwordHash).toBe(`fake$${CUSTOMER_INPUT.password}`)
    expect(issued.expiresAt).toBe(new Date(clock.now().getTime() + SESSION_TTL_SECONDS * 1000).toISOString())
  })

  it('el id de cuenta es distinto en cada alta', async () => {
    const { deps } = createAuthFixture()
    const first = await registerCustomer(deps, CUSTOMER_INPUT)
    const second = await registerCustomer(deps, { ...CUSTOMER_INPUT, phone: '3109998877' })
    expect(first.account.id).not.toBe(second.account.id)
  })

  it.each([
    ['role', { role: 'owner' }],
    ['storeId', { storeId: 'leche-y-miel' }],
    ['role y storeId', { role: 'operator', storeId: 'otra-tienda' }],
  ])('rechaza %s en el registro público y no crea nada (sin escalada)', async (_case, extra) => {
    const { deps, repository, hasher } = createAuthFixture()
    await expect(registerCustomer(deps, { ...CUSTOMER_INPUT, ...extra })).rejects.toBeInstanceOf(ValidationError)
    expect(await repository.findAccountByPhone(CUSTOMER_PHONE)).toBeNull()
    expect(hasher.hashCalls).toBe(0)
  })

  it('rechaza contraseña corta, teléfono inválido y entrada no objeto', async () => {
    const { deps } = createAuthFixture()
    await expect(registerCustomer(deps, { ...CUSTOMER_INPUT, password: 'corta' })).rejects.toBeInstanceOf(ValidationError)
    await expect(registerCustomer(deps, { ...CUSTOMER_INPUT, phone: '12345' })).rejects.toBeInstanceOf(ValidationError)
    await expect(registerCustomer(deps, null)).rejects.toBeInstanceOf(ValidationError)
    await expect(registerCustomer(deps, 'texto')).rejects.toBeInstanceOf(ValidationError)
  })

  it('un teléfono repetido es conflicto sin exponer el dato', async () => {
    const { deps } = createAuthFixture()
    await registerCustomer(deps, CUSTOMER_INPUT)
    const error = await registerCustomer(deps, { ...CUSTOMER_INPUT, phone: '+57 300 123 4567' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AccountConflictError)
    expect((error as Error).message).not.toMatch(/573|300|Ana/)
  })

  it('limita registros por teléfono con reserva previa al hash', async () => {
    const { deps, hasher } = createAuthFixture()
    await registerCustomer(deps, CUSTOMER_INPUT)
    for (let i = 1; i < REGISTER_PHONE_POLICY.limit; i += 1) {
      await expect(registerCustomer(deps, CUSTOMER_INPUT)).rejects.toBeInstanceOf(AccountConflictError)
    }
    const hashesBefore = hasher.hashCalls
    const error = await registerCustomer(deps, CUSTOMER_INPUT).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RateLimitedError)
    expect((error as RateLimitedError).retryAfterSeconds).toBeGreaterThanOrEqual(1)
    expect(hasher.hashCalls).toBe(hashesBefore)
  })

  it('aplica una cota global de registros aunque cambie el teléfono', async () => {
    const { deps } = createAuthFixture()
    for (let i = 0; i < REGISTER_GLOBAL_POLICY.limit; i += 1) {
      await registerCustomer(deps, { ...CUSTOMER_INPUT, phone: `3${(100000000 + i).toString()}` })
    }
    await expect(
      registerCustomer(deps, { ...CUSTOMER_INPUT, phone: '3999999999' }),
    ).rejects.toBeInstanceOf(RateLimitedError)
  })

  it('la ventana se renueva tras vencer', async () => {
    const { deps, clock } = createAuthFixture()
    for (let i = 0; i < REGISTER_PHONE_POLICY.limit; i += 1) {
      await registerCustomer(deps, CUSTOMER_INPUT).catch(() => undefined)
    }
    await expect(registerCustomer(deps, CUSTOMER_INPUT)).rejects.toBeInstanceOf(RateLimitedError)
    clock.advanceSeconds(REGISTER_PHONE_POLICY.windowSeconds + 1)
    await expect(registerCustomer(deps, CUSTOMER_INPUT)).rejects.toBeInstanceOf(AccountConflictError)
  })
})

describe('createStaffAccount', () => {
  it('crea owner/operator con email normalizado y tienda fijada por el servidor', async () => {
    const { deps } = createAuthFixture()
    const account = await createStaffAccount(deps, { ...STAFF_INPUT, email: 'Duena@Maui.TEST' })
    expect(account).toMatchObject({ role: 'owner', email: 'duena@maui.test', storeId: 'leche-y-miel', phone: null })
    expect(account).not.toHaveProperty('passwordHash')
  })

  it('rechaza rol customer, campos extra, contraseña corta y email repetido', async () => {
    const { deps } = createAuthFixture()
    await expect(createStaffAccount(deps, { ...STAFF_INPUT, role: 'customer' } as never)).rejects.toBeInstanceOf(ValidationError)
    await expect(createStaffAccount(deps, { ...STAFF_INPUT, status: 'active' } as never)).rejects.toBeInstanceOf(ValidationError)
    await expect(createStaffAccount(deps, { ...STAFF_INPUT, password: 'corta' })).rejects.toBeInstanceOf(ValidationError)
    await createStaffAccount(deps, STAFF_INPUT)
    await expect(createStaffAccount(deps, STAFF_INPUT)).rejects.toBeInstanceOf(AccountConflictError)
  })
})

describe('login', () => {
  async function seeded() {
    const fixture = createAuthFixture()
    await registerCustomer(fixture.deps, CUSTOMER_INPUT)
    await createStaffAccount(fixture.deps, STAFF_INPUT)
    // Los contadores de hash de los preparativos no cuentan para los asertos.
    fixture.hasher.hashCalls = 0
    return fixture
  }

  it('cliente por teléfono (cualquier formato) y staff por email (sin importar mayúsculas)', async () => {
    const { deps } = await seeded()
    const customer = await login(deps, phoneLogin(CUSTOMER_INPUT.password, '+57 (300) 123-4567'))
    expect(customer.account).toMatchObject({ role: 'customer', phone: CUSTOMER_PHONE })
    const staff = await login(deps, emailLogin(STAFF_INPUT.password, 'DUENA@maui.test'))
    expect(staff.account).toMatchObject({ role: 'owner', email: 'duena@maui.test', storeId: 'leche-y-miel' })
    expect(staff.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
  })

  it('cada login abre una sesión nueva y persistida', async () => {
    const { deps, repository } = await seeded()
    const first = await login(deps, phoneLogin())
    const second = await login(deps, phoneLogin())
    expect(first.token).not.toBe(second.token)
    const claims = await deps.tokens.verify(first.token, deps.clock.now())
    expect(claims && repository.getSession(claims.sessionId)).toMatchObject({ accountId: first.account.id, revokedAt: null })
  })

  it('contraseña errónea y cuenta inexistente dan el mismo error genérico', async () => {
    const { deps, hasher } = await seeded()
    const wrong = await login(deps, phoneLogin('otra-clave-123')).catch((e: unknown) => e)
    const unknown = await login(deps, phoneLogin('otra-clave-123', '3000000000')).catch((e: unknown) => e)
    expect(wrong).toBeInstanceOf(AuthenticationError)
    expect(unknown).toBeInstanceOf(AuthenticationError)
    expect((wrong as Error).message).toBe((unknown as Error).message)
    expect((unknown as AuthenticationError).code).toBe((wrong as AuthenticationError).code)
    expect(hasher.verifyCalls).toBe(1)
    expect(hasher.unknownCalls).toBe(1)
  })

  it('cuenta inexistente ejecuta el hash ficticio (mismo costo) y nunca crea sesión', async () => {
    const { deps, hasher } = await seeded()
    await expect(login(deps, emailLogin('x', 'nadie@maui.test'))).rejects.toBeInstanceOf(AuthenticationError)
    expect(hasher.unknownCalls).toBe(1)
    expect(hasher.verifyCalls).toBe(0)
  })

  it('cuenta desactivada con clave correcta se deniega tras verificar (igual costo)', async () => {
    const { deps, repository, hasher } = await seeded()
    const account = await repository.findAccountByPhone(CUSTOMER_PHONE)
    repository.patchAccount(account?.id as string, { status: 'disabled' })
    await expect(login(deps, phoneLogin())).rejects.toBeInstanceOf(AuthenticationError)
    expect(hasher.verifyCalls).toBe(1)
  })

  it('identidad incoherente (staff sin tienda) se deniega aunque la clave sea correcta', async () => {
    const { deps, repository } = await seeded()
    const staff = await repository.findAccountByEmail(STAFF_INPUT.email)
    repository.patchAccount(staff?.id as string, { storeId: null })
    await expect(login(deps, emailLogin())).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('el método debe coincidir con el rol: un cliente no entra por email', async () => {
    const { deps, repository } = await seeded()
    const customer = await repository.findAccountByPhone(CUSTOMER_PHONE)
    // Aun forzando un email en la cuenta cliente (dato incoherente), el login por email se deniega.
    repository.patchAccount(customer?.id as string, { email: 'ana@maui.test' })
    await expect(login(deps, emailLogin(CUSTOMER_INPUT.password, 'ana@maui.test'))).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('rechaza esquema inválido (rol, método ausente) con ValidationError antes de consumir cupo', async () => {
    const { deps, hasher } = await seeded()
    await expect(login(deps, { email: STAFF_INPUT.email, password: 'x' })).rejects.toBeInstanceOf(ValidationError)
    for (let i = 0; i < LOGIN_ATTEMPT_POLICY.limit + 2; i += 1) {
      await expect(login(deps, { ...phoneLogin(), role: 'owner' })).rejects.toBeInstanceOf(ValidationError)
    }
    expect(hasher.verifyCalls + hasher.unknownCalls).toBe(0)
    // Ninguna petición inválida gastó cupo: el login legítimo sigue disponible.
    await expect(login(deps, phoneLogin())).resolves.toBeDefined()
  })

  describe('límite de intentos por identificador', () => {
    it('reserva ANTES del hash: superada la cota ni siquiera la clave correcta se evalúa', async () => {
      const { deps, hasher } = await seeded()
      for (let i = 0; i < LOGIN_ATTEMPT_POLICY.limit; i += 1) {
        await expect(login(deps, phoneLogin('incorrecta-123'))).rejects.toBeInstanceOf(AuthenticationError)
      }
      const verifiesBefore = hasher.verifyCalls
      const error = await login(deps, phoneLogin()).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(RateLimitedError)
      expect((error as RateLimitedError).retryAfterSeconds).toBeGreaterThanOrEqual(1)
      expect((error as RateLimitedError).retryAfterSeconds).toBeLessThanOrEqual(LOGIN_ATTEMPT_POLICY.windowSeconds)
      expect(hasher.verifyCalls).toBe(verifiesBefore)
    })

    it('intentos concurrentes no superan la cota (reserva atómica)', async () => {
      const { deps, hasher } = await seeded()
      const attempts = LOGIN_ATTEMPT_POLICY.limit + 15
      const results = await Promise.allSettled(
        Array.from({ length: attempts }, () => login(deps, phoneLogin('incorrecta-123'))),
      )
      const denied = results.filter(r => r.status === 'rejected' && r.reason instanceof RateLimitedError)
      const failed = results.filter(r => r.status === 'rejected' && r.reason instanceof AuthenticationError)
      expect(failed).toHaveLength(LOGIN_ATTEMPT_POLICY.limit)
      expect(denied).toHaveLength(15)
      expect(hasher.verifyCalls).toBe(LOGIN_ATTEMPT_POLICY.limit)
    })

    it('el contador es por identificador: otro teléfono o el staff no se ven afectados', async () => {
      const { deps } = await seeded()
      for (let i = 0; i < LOGIN_ATTEMPT_POLICY.limit + 1; i += 1) {
        await login(deps, phoneLogin('incorrecta-123')).catch(() => undefined)
      }
      await expect(login(deps, phoneLogin())).rejects.toBeInstanceOf(RateLimitedError)
      await expect(login(deps, emailLogin())).resolves.toMatchObject({ account: { role: 'owner' } })
    })

    it('un identificador inexistente también se limita (no revela existencia)', async () => {
      const { deps } = await seeded()
      for (let i = 0; i < LOGIN_ATTEMPT_POLICY.limit; i += 1) {
        await expect(login(deps, phoneLogin('x', '3000000000'))).rejects.toBeInstanceOf(AuthenticationError)
      }
      await expect(login(deps, phoneLogin('x', '3000000000'))).rejects.toBeInstanceOf(RateLimitedError)
    })

    it('el login correcto reinicia el contador y la ventana vencida se renueva', async () => {
      const { deps, clock } = await seeded()
      for (let i = 0; i < LOGIN_ATTEMPT_POLICY.limit - 1; i += 1) {
        await login(deps, phoneLogin('incorrecta-123')).catch(() => undefined)
      }
      await expect(login(deps, phoneLogin())).resolves.toBeDefined()
      // Tras el éxito hay cupo completo otra vez.
      for (let i = 0; i < LOGIN_ATTEMPT_POLICY.limit; i += 1) {
        await expect(login(deps, phoneLogin('incorrecta-123'))).rejects.toBeInstanceOf(AuthenticationError)
      }
      await expect(login(deps, phoneLogin('incorrecta-123'))).rejects.toBeInstanceOf(RateLimitedError)
      clock.advanceSeconds(LOGIN_ATTEMPT_POLICY.windowSeconds + 1)
      await expect(login(deps, phoneLogin())).resolves.toBeDefined()
    })
  })

  describe('cota global (identificadores rotados)', () => {
    const { limit, windowSeconds } = LOGIN_GLOBAL_POLICY

    it('rechaza ANTES del hash aunque cada petición use un identificador distinto', async () => {
      const { deps, hasher } = await seeded()
      for (let i = 0; i < limit; i += 1) {
        await expect(login(deps, phoneLogin('x', distinctPhone(i)))).rejects.toBeInstanceOf(AuthenticationError)
      }
      expect(hasher.unknownCalls).toBe(limit)

      const error = await login(deps, phoneLogin('x', distinctPhone(limit))).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(RateLimitedError)
      expect((error as RateLimitedError).retryAfterSeconds).toBeGreaterThanOrEqual(1)
      expect((error as RateLimitedError).retryAfterSeconds).toBeLessThanOrEqual(windowSeconds)
      // Tampoco se evalúa un login legítimo con la cota agotada (cuota compartida).
      await expect(login(deps, phoneLogin())).rejects.toBeInstanceOf(RateLimitedError)
      await expect(login(deps, emailLogin())).rejects.toBeInstanceOf(RateLimitedError)
      expect(hasher.unknownCalls).toBe(limit)
      expect(hasher.verifyCalls).toBe(0)
    })

    it('peticiones concurrentes con identificadores distintos no superan la cota', async () => {
      const { deps, hasher } = await seeded()
      const extra = 20
      const results = await Promise.allSettled(
        Array.from({ length: limit + extra }, (_, i) => login(deps, phoneLogin('x', distinctPhone(i)))),
      )
      expect(results.filter(r => r.status === 'rejected' && r.reason instanceof AuthenticationError)).toHaveLength(limit)
      expect(results.filter(r => r.status === 'rejected' && r.reason instanceof RateLimitedError)).toHaveLength(extra)
      expect(hasher.unknownCalls).toBe(limit)
    })

    it('un login exitoso NO reinicia la cota global', async () => {
      const { deps } = await seeded()
      for (let i = 0; i < limit - 1; i += 1) {
        await expect(login(deps, phoneLogin('x', distinctPhone(i)))).rejects.toBeInstanceOf(AuthenticationError)
      }
      await expect(login(deps, phoneLogin())).resolves.toBeDefined()
      await expect(login(deps, phoneLogin())).rejects.toBeInstanceOf(RateLimitedError)
    })

    it('se evalúa antes que el identificador: una denegación global no gasta su cupo', async () => {
      const { deps, repository } = await seeded()
      for (let i = 0; i < limit; i += 1) {
        await login(deps, phoneLogin('x', distinctPhone(i))).catch(() => undefined)
      }
      await expect(login(deps, phoneLogin())).rejects.toBeInstanceOf(RateLimitedError)
      // Con cota 1, solo es "allowed" si el bucket del cliente no se había consumido.
      const probe = await repository.reserveAttempt(
        { bucket: deps.keys.key('login:phone', CUSTOMER_PHONE), limit: 1, windowSeconds: LOGIN_ATTEMPT_POLICY.windowSeconds },
        deps.clock.nowIso(),
      )
      expect(probe.allowed).toBe(true)
    })

    it('la ventana vencida renueva la cota', async () => {
      const { deps, clock } = await seeded()
      for (let i = 0; i < limit; i += 1) {
        await login(deps, phoneLogin('x', distinctPhone(i))).catch(() => undefined)
      }
      await expect(login(deps, phoneLogin())).rejects.toBeInstanceOf(RateLimitedError)
      clock.advanceSeconds(windowSeconds + 1)
      await expect(login(deps, phoneLogin())).resolves.toBeDefined()
    })
  })
})

describe('authenticateSession', () => {
  async function loggedIn() {
    const fixture = createAuthFixture()
    await createStaffAccount(fixture.deps, STAFF_INPUT)
    const issued = await login(fixture.deps, emailLogin())
    return { ...fixture, issued }
  }

  it('devuelve cuenta, sesión y expiración desde la BD', async () => {
    const { deps, issued } = await loggedIn()
    const context = await authenticateSession(deps, issued.token)
    expect(context.account).toMatchObject({ id: issued.account.id, role: 'owner', storeId: 'leche-y-miel', status: 'active' })
    expect(context.account).not.toHaveProperty('passwordHash')
    expect(context.expiresAt).toBe(issued.expiresAt)
  })

  it('rol y tienda se leen de la BD: un cambio posterior aplica sin reemitir el token', async () => {
    const { deps, repository, issued } = await loggedIn()
    repository.patchAccount(issued.account.id, { role: 'operator', storeId: 'otra-tienda' })
    const context = await authenticateSession(deps, issued.token)
    expect(context.account).toMatchObject({ role: 'operator', storeId: 'otra-tienda' })
  })

  it('una cuenta desactivada pierde acceso inmediatamente', async () => {
    const { deps, repository, issued } = await loggedIn()
    repository.patchAccount(issued.account.id, { status: 'disabled' })
    await expect(authenticateSession(deps, issued.token)).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('una cuenta con identidad incoherente (rol/tienda) se deniega', async () => {
    const { deps, repository, issued } = await loggedIn()
    repository.patchAccount(issued.account.id, { storeId: null })
    await expect(authenticateSession(deps, issued.token)).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('sin token, token vacío o basura se deniega', async () => {
    const { deps } = await loggedIn()
    for (const token of [undefined, null, '', 'basura', 'a.b.c']) {
      await expect(authenticateSession(deps, token)).rejects.toBeInstanceOf(AuthenticationError)
    }
  })

  it('el JWT expira a las 8 horas', async () => {
    const { deps, clock, issued } = await loggedIn()
    clock.advanceSeconds(SESSION_TTL_SECONDS - 1)
    await expect(authenticateSession(deps, issued.token)).resolves.toBeDefined()
    clock.advanceSeconds(1)
    await expect(authenticateSession(deps, issued.token)).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('un token firmado de una sesión inexistente se deniega', async () => {
    const { deps, clock } = await loggedIn()
    const seconds = Math.floor(clock.now().getTime() / 1000)
    const token = await deps.tokens.sign({ accountId: 'acc_x', sessionId: 'ses_inexistente', issuedAt: seconds, expiresAt: seconds + 600 })
    await expect(authenticateSession(deps, token)).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('un token cuyo sub no coincide con la cuenta de la sesión se deniega', async () => {
    const { deps, clock, issued } = await loggedIn()
    const claims = await deps.tokens.verify(issued.token, clock.now())
    const seconds = Math.floor(clock.now().getTime() / 1000)
    const token = await deps.tokens.sign({
      accountId: 'acc_otra_cuenta',
      sessionId: claims?.sessionId as string,
      issuedAt: seconds,
      expiresAt: seconds + 600,
    })
    await expect(authenticateSession(deps, token)).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('la fila de sesión vencida deniega aunque el JWT siga vigente', async () => {
    const { deps, repository, clock } = await loggedIn()
    const account = await repository.findAccountByEmail(STAFF_INPUT.email)
    const seconds = Math.floor(clock.now().getTime() / 1000)
    await repository.createSession({
      id: 'ses_fila_vencida',
      accountId: account?.id as string,
      createdAt: new Date((seconds - 7200) * 1000).toISOString(),
      expiresAt: new Date((seconds - 1) * 1000).toISOString(),
      revokedAt: null,
    })
    const token = await deps.tokens.sign({
      accountId: account?.id as string,
      sessionId: 'ses_fila_vencida',
      issuedAt: seconds,
      expiresAt: seconds + 3600,
    })
    await expect(authenticateSession(deps, token)).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('un JWT que excede la expiración de su sesión persistida se deniega', async () => {
    const { deps, repository, clock } = await loggedIn()
    const account = await repository.findAccountByEmail(STAFF_INPUT.email)
    const seconds = Math.floor(clock.now().getTime() / 1000)
    await repository.createSession({
      id: 'ses_corta',
      accountId: account?.id as string,
      createdAt: clock.nowIso(),
      expiresAt: new Date((seconds + 600) * 1000).toISOString(),
      revokedAt: null,
    })
    const token = await deps.tokens.sign({
      accountId: account?.id as string,
      sessionId: 'ses_corta',
      issuedAt: seconds,
      expiresAt: seconds + 3600,
    })
    await expect(authenticateSession(deps, token)).rejects.toBeInstanceOf(AuthenticationError)
  })
})

describe('logout', () => {
  it('revoca la sesión en el servidor: el mismo token deja de funcionar', async () => {
    const fixture = createAuthFixture()
    await createStaffAccount(fixture.deps, STAFF_INPUT)
    const issued = await login(fixture.deps, emailLogin())
    const claims = await fixture.deps.tokens.verify(issued.token, fixture.clock.now())

    await expect(authenticateSession(fixture.deps, issued.token)).resolves.toBeDefined()
    await logout(fixture.deps, issued.token)

    expect(fixture.repository.getSession(claims?.sessionId as string)?.revokedAt).toBe(fixture.clock.nowIso())
    await expect(authenticateSession(fixture.deps, issued.token)).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('solo revoca la sesión indicada: otras sesiones de la misma cuenta siguen activas', async () => {
    const fixture = createAuthFixture()
    await createStaffAccount(fixture.deps, STAFF_INPUT)
    const first = await login(fixture.deps, emailLogin())
    const second = await login(fixture.deps, emailLogin())
    await logout(fixture.deps, first.token)
    await expect(authenticateSession(fixture.deps, second.token)).resolves.toBeDefined()
  })

  it('es idempotente y conserva la primera marca de revocación', async () => {
    const fixture = createAuthFixture()
    await createStaffAccount(fixture.deps, STAFF_INPUT)
    const issued = await login(fixture.deps, emailLogin())
    const claims = await fixture.deps.tokens.verify(issued.token, fixture.clock.now())
    await logout(fixture.deps, issued.token)
    const firstRevocation = fixture.repository.getSession(claims?.sessionId as string)?.revokedAt
    fixture.clock.advanceSeconds(60)
    await logout(fixture.deps, issued.token)
    expect(fixture.repository.getSession(claims?.sessionId as string)?.revokedAt).toBe(firstRevocation)
  })

  it('sin token o con token inválido no falla ni revela nada', async () => {
    const { deps } = createAuthFixture()
    await expect(logout(deps, undefined)).resolves.toBeUndefined()
    await expect(logout(deps, null)).resolves.toBeUndefined()
    await expect(logout(deps, 'basura')).resolves.toBeUndefined()
  })
})

describe('requireRole', () => {
  it('permite los roles indicados y deniega el resto', async () => {
    const fixture = createAuthFixture()
    await createStaffAccount(fixture.deps, STAFF_INPUT)
    await registerCustomer(fixture.deps, CUSTOMER_INPUT)
    const staff = await authenticateSession(fixture.deps, (await login(fixture.deps, emailLogin())).token)
    const customer = await authenticateSession(fixture.deps, (await login(fixture.deps, phoneLogin())).token)

    expect(requireRole(staff, 'owner', 'operator')).toBe(staff)
    expect(() => requireRole(customer, 'owner', 'operator')).toThrow(AuthorizationError)
    expect(() => requireRole(staff, 'customer')).toThrow(AuthorizationError)
  })
})
