import { randomBytes } from 'node:crypto'
import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { SESSION_TTL_SECONDS } from '../../src/domain/auth/policy.js'
import { JoseSessionTokenService } from '../../src/infra/auth/JoseSessionTokenService.js'
import { TEST_AUDIENCE, TEST_ISSUER, TEST_SECRET } from './fixtures.js'

const NOW = new Date('2026-10-01T12:00:00.000Z')
const nowSeconds = Math.floor(NOW.getTime() / 1000)
const claims = {
  accountId: 'acc_cuenta',
  sessionId: 'ses_sesion',
  issuedAt: nowSeconds,
  expiresAt: nowSeconds + SESSION_TTL_SECONDS,
}

const service = new JoseSessionTokenService({ secret: TEST_SECRET, issuer: TEST_ISSUER, audience: TEST_AUDIENCE })

interface ForeignOptions {
  alg?: string
  typ?: string
  issuer?: string
  audience?: string
  secret?: Uint8Array
  omit?: 'iss' | 'aud' | 'sub' | 'jti' | 'iat' | 'exp'
  iat?: number
  exp?: number
}

/** Token firmado "por fuera" del servicio, para probar que verify rechaza variantes. */
function foreignToken(options: ForeignOptions = {}): Promise<string> {
  const { omit } = options
  let jwt = new SignJWT({}).setProtectedHeader({ alg: options.alg ?? 'HS256', typ: options.typ ?? 'JWT' })
  if (omit !== 'iss') jwt = jwt.setIssuer(options.issuer ?? TEST_ISSUER)
  if (omit !== 'aud') jwt = jwt.setAudience(options.audience ?? TEST_AUDIENCE)
  if (omit !== 'sub') jwt = jwt.setSubject(claims.accountId)
  if (omit !== 'jti') jwt = jwt.setJti(claims.sessionId)
  if (omit !== 'iat') jwt = jwt.setIssuedAt(options.iat ?? claims.issuedAt)
  if (omit !== 'exp') jwt = jwt.setExpirationTime(options.exp ?? claims.expiresAt)
  return jwt.sign(options.secret ?? TEST_SECRET)
}

/**
 * Firma el payload TAL CUAL (sin los setters de jose, que normalizan fechas) para poder
 * emitir iat/exp fraccionarios o inseguros que un emisor externo sí podría producir.
 */
function rawPayloadToken(overrides: Record<string, unknown>): Promise<string> {
  return new SignJWT({
    iss: TEST_ISSUER,
    aud: TEST_AUDIENCE,
    sub: claims.accountId,
    jti: claims.sessionId,
    iat: claims.issuedAt,
    exp: claims.expiresAt,
    ...overrides,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .sign(TEST_SECRET)
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

describe('JoseSessionTokenService', () => {
  it('firma HS256 y verifica los claims de cuenta y sesión', async () => {
    const token = await service.sign(claims)
    const header = JSON.parse(Buffer.from(token.split('.')[0] as string, 'base64url').toString()) as Record<string, unknown>
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(await service.verify(token, NOW)).toEqual(claims)
  })

  it('el payload solo lleva claims de identidad: sin rol, tienda ni datos personales', async () => {
    const token = await service.sign(claims)
    const payload = JSON.parse(Buffer.from(token.split('.')[1] as string, 'base64url').toString()) as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'jti', 'sub'])
    expect(payload).toMatchObject({ iss: TEST_ISSUER, aud: TEST_AUDIENCE, sub: 'acc_cuenta', jti: 'ses_sesion' })
  })

  it('rechaza un token expirado y acepta justo antes de expirar', async () => {
    const token = await service.sign(claims)
    expect(await service.verify(token, new Date((claims.expiresAt - 1) * 1000))).not.toBeNull()
    expect(await service.verify(token, new Date(claims.expiresAt * 1000))).toBeNull()
    expect(await service.verify(token, new Date((claims.expiresAt + 3600) * 1000))).toBeNull()
  })

  it('rechaza un payload alterado conservando la firma', async () => {
    const [header, payload, signature] = (await service.sign(claims)).split('.') as [string, string, string]
    const forged = { ...JSON.parse(Buffer.from(payload, 'base64url').toString()), sub: 'acc_otra' }
    expect(await service.verify(`${header}.${encode(forged)}.${signature}`, NOW)).toBeNull()
  })

  it('rechaza una firma hecha con otro secreto', async () => {
    expect(await service.verify(await foreignToken({ secret: randomBytes(32) }), NOW)).toBeNull()
  })

  it('rechaza otro issuer o audience', async () => {
    expect(await service.verify(await foreignToken({ issuer: 'https://otro.example' }), NOW)).toBeNull()
    expect(await service.verify(await foreignToken({ audience: 'maui-production' }), NOW)).toBeNull()
  })

  it.each(['HS384', 'HS512'])('rechaza algoritmo %s aunque use el mismo secreto', async alg => {
    expect(await service.verify(await foreignToken({ alg }), NOW)).toBeNull()
  })

  it('rechaza alg=none (token sin firma)', async () => {
    const payload = {
      iss: TEST_ISSUER,
      aud: TEST_AUDIENCE,
      sub: claims.accountId,
      jti: claims.sessionId,
      iat: claims.issuedAt,
      exp: claims.expiresAt,
    }
    expect(await service.verify(`${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`, NOW)).toBeNull()
  })

  it.each(['iss', 'aud', 'sub', 'jti', 'iat', 'exp'] as const)('rechaza un token sin el claim %s', async omit => {
    expect(await service.verify(await foreignToken({ omit }), NOW)).toBeNull()
  })

  it('rechaza typ distinto de JWT', async () => {
    expect(await service.verify(await foreignToken({ typ: 'at+jwt' }), NOW)).toBeNull()
  })

  it('rechaza iat en el futuro y vida mayor a la política', async () => {
    expect(await service.verify(await foreignToken({ iat: nowSeconds + 3600, exp: nowSeconds + 7200 }), NOW)).toBeNull()
    expect(await service.verify(await foreignToken({ exp: claims.issuedAt + SESSION_TTL_SECONDS + 1 }), NOW)).toBeNull()
  })

  it('el control del helper es válido: iat/exp enteros dentro de política se aceptan', async () => {
    expect(await service.verify(await rawPayloadToken({}), NOW)).toEqual(claims)
  })

  it.each([
    ['exp fraccionario', { exp: claims.expiresAt + 0.5 }],
    ['iat fraccionario', { iat: claims.issuedAt - 0.5 }],
    ['iat y exp fraccionarios coherentes con la vida máxima', { iat: claims.issuedAt + 0.25, exp: claims.issuedAt + 0.25 + 3600 }],
    ['exp inseguro (> 2^53)', { exp: 2 ** 53 + 2 }],
    ['iat inseguro (> 2^53)', { iat: 2 ** 53 + 2 }],
  ])('rechaza %s', async (_case, overrides) => {
    expect(await service.verify(await rawPayloadToken(overrides), NOW)).toBeNull()
  })

  it.each([
    ['exp como texto', { exp: String(claims.expiresAt) }],
    ['iat como texto', { iat: String(claims.issuedAt) }],
  ])('rechaza %s', async (_case, overrides) => {
    expect(await service.verify(await rawPayloadToken(overrides), NOW)).toBeNull()
  })

  it('rechaza ids que no cumplen el patrón de entidad', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(TEST_ISSUER)
      .setAudience(TEST_AUDIENCE)
      .setSubject('con espacios')
      .setJti(claims.sessionId)
      .setIssuedAt(claims.issuedAt)
      .setExpirationTime(claims.expiresAt)
      .sign(TEST_SECRET)
    expect(await service.verify(token, NOW)).toBeNull()
  })

  it.each(['', 'basura', 'a.b.c', `${'a'.repeat(2049)}`])('rechaza entrada no JWT %#', async value => {
    expect(await service.verify(value, NOW)).toBeNull()
  })
})
