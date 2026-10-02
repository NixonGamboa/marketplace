import { describe, expect, it } from 'vitest'
import {
  isTrustedOrigin,
  readSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from '../../src/infra/auth/sessionCookie.js'

const local = { name: 'maui_session', secure: false }
const deployed = { name: '__Host-maui_session', secure: true }
const token = 'aaa.bbb.ccc'

const attributes = (cookie: string) => cookie.split('; ').slice(1)

describe('serializeSessionCookie', () => {
  it('local: HttpOnly, SameSite=Strict, Path=/ y sin Secure ni Domain', () => {
    expect(serializeSessionCookie(local, token, 28800)).toBe(
      'maui_session=aaa.bbb.ccc; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800',
    )
  })

  it('deploy: añade Secure y usa el prefijo __Host- (host-only, Path=/)', () => {
    const cookie = serializeSessionCookie(deployed, token, 28800)
    expect(cookie).toBe('__Host-maui_session=aaa.bbb.ccc; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=28800')
    expect(cookie).not.toMatch(/Domain=/i)
  })
})

describe('serializeClearedSessionCookie', () => {
  it.each([
    ['local', local],
    ['deploy', deployed],
  ])('%s: mismos atributos que al crear, valor vacío y Max-Age=0', (_env, settings) => {
    const created = serializeSessionCookie(settings, token, 28800)
    const cleared = serializeClearedSessionCookie(settings)
    const identity = (attrs: string[]) => attrs.filter(attribute => !/^(Max-Age|Expires)=/.test(attribute))
    expect(cleared.startsWith(`${settings.name}=;`)).toBe(true)
    expect(identity(attributes(cleared))).toEqual(identity(attributes(created)))
    expect(attributes(cleared)).toContain('Max-Age=0')
    expect(attributes(cleared)).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })
})

describe('readSessionToken', () => {
  it('lee el token entre otras cookies', () => {
    expect(readSessionToken(`otra=1; maui_session=${token}; z=2`, 'maui_session')).toBe(token)
  })

  it('devuelve null si falta o la cabecera no existe', () => {
    expect(readSessionToken(undefined, 'maui_session')).toBeNull()
    expect(readSessionToken('otra=1', 'maui_session')).toBeNull()
    expect(readSessionToken('maui_session=', 'maui_session')).toBeNull()
  })

  it('ante cookies duplicadas es ambiguo y se descarta', () => {
    expect(readSessionToken(`maui_session=${token}; maui_session=${token}`, 'maui_session')).toBeNull()
  })

  it('no confunde nombres parecidos ni el prefijo __Host-', () => {
    expect(readSessionToken(`x_maui_session=${token}`, 'maui_session')).toBeNull()
    expect(readSessionToken(`maui_session=${token}`, '__Host-maui_session')).toBeNull()
  })

  it.each(['no-es-jwt', 'a.b', 'a.b.c.d', 'a b.c.d', 'a.b.c%00', `${'a'.repeat(2049)}.b.c`])(
    'descarta valores sin forma de JWT: %#',
    value => {
      expect(readSessionToken(`maui_session=${value}`, 'maui_session')).toBeNull()
    },
  )
})

describe('isTrustedOrigin', () => {
  const expected = 'https://maui.example.com'

  it('solo acepta coincidencia exacta con el origen configurado', () => {
    expect(isTrustedOrigin(expected, expected)).toBe(true)
  })

  it.each([
    ['ausente', undefined],
    ['null', 'null'],
    ['otro host', 'https://evil.example'],
    ['subdominio', 'https://app.maui.example.com'],
    ['prefijo atacante', 'https://maui.example.com.evil.example'],
    ['barra final', 'https://maui.example.com/'],
    ['esquema distinto', 'http://maui.example.com'],
    ['puerto distinto', 'https://maui.example.com:8443'],
    ['mayúsculas', 'https://MAUI.example.com'],
    ['lista', ['https://maui.example.com', 'https://evil.example']],
    ['vacío', ''],
  ])('rechaza origen %s', (_case, header) => {
    expect(isTrustedOrigin(header, expected)).toBe(false)
  })
})
