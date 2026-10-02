import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { AuthConfigurationError, loadAuthConfig } from '../../src/infra/auth/config.js'

const secret = () => randomBytes(32).toString('base64')

const env = (overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  APP_ENV: 'local',
  AUTH_JWT_SECRET: secret(),
  AUTH_ORIGIN: 'http://localhost:5173',
  ...overrides,
})

const issuesOf = (environment: NodeJS.ProcessEnv): readonly string[] => {
  try {
    loadAuthConfig(environment)
  } catch (error) {
    if (error instanceof AuthConfigurationError) return error.issues
    throw error
  }
  return []
}

describe('loadAuthConfig · entorno', () => {
  it('local: origen loopback, cookie sin Secure y sin prefijo __Host-', () => {
    const config = loadAuthConfig(env())
    expect(config).toMatchObject({
      appEnv: 'local',
      origin: 'http://localhost:5173',
      issuer: 'http://localhost:5173',
      audience: 'maui-local',
      cookie: { name: 'maui_session', secure: false },
    })
    expect(config.secret.length).toBe(32)
  })

  it.each(['test', 'production'] as const)('%s: HTTPS, cookie Secure con prefijo __Host-', appEnv => {
    const config = loadAuthConfig(env({ APP_ENV: appEnv, AUTH_ORIGIN: 'https://maui.example.com' }))
    expect(config.cookie).toEqual({ name: '__Host-maui_session', secure: true })
    expect(config.audience).toBe(`maui-${appEnv}`)
  })

  it('no hay fallback: sin secreto, sin origen o sin APP_ENV falla', () => {
    expect(issuesOf(env({ AUTH_JWT_SECRET: undefined }))).toEqual(['AUTH_JWT_SECRET'])
    expect(issuesOf(env({ AUTH_ORIGIN: undefined }))).toEqual(['AUTH_ORIGIN'])
    expect(issuesOf(env({ APP_ENV: undefined }))).toEqual(['APP_ENV'])
    expect(issuesOf(env({ APP_ENV: 'staging' }))).toEqual(['APP_ENV'])
    expect(issuesOf(env({ AUTH_JWT_SECRET: '' }))).toEqual(['AUTH_JWT_SECRET'])
  })

  it('un entorno vacío falla sin depender de la configuración global', () => {
    expect(() => loadAuthConfig({})).toThrow(AuthConfigurationError)
  })
})

describe('loadAuthConfig · secreto JWT', () => {
  it('exige base64 de al menos 32 bytes', () => {
    expect(issuesOf(env({ AUTH_JWT_SECRET: randomBytes(31).toString('base64') }))).toEqual(['AUTH_JWT_SECRET_TOO_SHORT'])
    expect(issuesOf(env({ AUTH_JWT_SECRET: randomBytes(32).toString('base64') }))).toEqual([])
    expect(issuesOf(env({ AUTH_JWT_SECRET: randomBytes(64).toString('base64') }))).toEqual([])
  })

  it.each([
    ['texto libre', 'esto no es base64 ni de lejos!!'],
    ['base64url (guion/subrayado)', `${'ab-_'.repeat(11)}`],
    ['relleno incorrecto', `${secret().replace(/=+$/, '')}==`],
    ['con espacios', ` ${secret()}`],
  ])('rechaza %s', (_case, value) => {
    expect(issuesOf(env({ AUTH_JWT_SECRET: value }))).toEqual(['AUTH_JWT_SECRET_NOT_BASE64'])
  })

  it('rechaza un secreto de baja entropía (bytes repetidos)', () => {
    expect(issuesOf(env({ AUTH_JWT_SECRET: Buffer.alloc(32).toString('base64') }))).toEqual(['AUTH_JWT_SECRET_LOW_ENTROPY'])
    expect(issuesOf(env({ AUTH_JWT_SECRET: Buffer.alloc(48, 'ab').toString('base64') }))).toEqual(['AUTH_JWT_SECRET_LOW_ENTROPY'])
  })

  it('los diagnósticos nunca contienen valores del entorno', () => {
    const leaked = 'valor-secreto-no-base64!!'
    let thrown: unknown
    try {
      loadAuthConfig(env({ AUTH_JWT_SECRET: leaked }))
    } catch (error) {
      thrown = error
    }
    expect(JSON.stringify(thrown)).not.toContain(leaked)
    expect(String((thrown as Error).message)).not.toContain(leaked)
  })
})

describe('loadAuthConfig · AUTH_ORIGIN', () => {
  it.each(['http://localhost:5173', 'http://127.0.0.1:3000', 'http://[::1]:3000', 'https://localhost:5173'])(
    'local acepta loopback %s',
    origin => {
      expect(issuesOf(env({ AUTH_ORIGIN: origin }))).toEqual([])
    },
  )

  it.each(['ftp://localhost', 'ws://localhost', 'wss://localhost:5173', 'ftp://127.0.0.1:2121'])(
    'local rechaza protocolos distintos de http/https: %s',
    origin => {
      expect(issuesOf(env({ AUTH_ORIGIN: origin }))).toEqual(['AUTH_ORIGIN_LOCAL_REQUIRES_HTTP'])
    },
  )

  it.each(['ws://maui.example.com', 'wss://maui.example.com'])('fuera de local %s también exige HTTPS', origin => {
    expect(issuesOf(env({ APP_ENV: 'production', AUTH_ORIGIN: origin }))).toEqual(['AUTH_ORIGIN_REQUIRES_HTTPS'])
  })

  it('local rechaza hosts que no son loopback', () => {
    expect(issuesOf(env({ AUTH_ORIGIN: 'https://maui.example.com' }))).toEqual(['AUTH_ORIGIN_LOCAL_REQUIRES_LOOPBACK'])
    expect(issuesOf(env({ AUTH_ORIGIN: 'http://192.168.1.10:5173' }))).toEqual(['AUTH_ORIGIN_LOCAL_REQUIRES_LOOPBACK'])
  })

  it.each(['test', 'production'])('%s exige HTTPS', appEnv => {
    expect(issuesOf(env({ APP_ENV: appEnv, AUTH_ORIGIN: 'http://maui.example.com' }))).toEqual(['AUTH_ORIGIN_REQUIRES_HTTPS'])
    expect(issuesOf(env({ APP_ENV: appEnv, AUTH_ORIGIN: 'ftp://maui.example.com' }))).toEqual(['AUTH_ORIGIN_REQUIRES_HTTPS'])
  })

  it.each(['test', 'production'])('%s rechaza loopback', appEnv => {
    expect(issuesOf(env({ APP_ENV: appEnv, AUTH_ORIGIN: 'https://localhost:5173' }))).toEqual(['AUTH_ORIGIN_LOOPBACK_NOT_ALLOWED'])
  })

  it.each([
    ['barra final', 'https://maui.example.com/'],
    ['con path', 'https://maui.example.com/app'],
    ['con query', 'https://maui.example.com?x=1'],
    ['con credenciales', 'https://user:pass@maui.example.com'],
    ['puerto por defecto explícito', 'https://maui.example.com:443'],
    ['host en mayúsculas', 'https://MAUI.example.com'],
    ['sin esquema', 'maui.example.com'],
    ['comodín', '*'],
    ['lista de orígenes', 'https://a.example.com,https://b.example.com'],
  ])('rechaza origen no canónico: %s', (_case, origin) => {
    expect(issuesOf(env({ APP_ENV: 'production', AUTH_ORIGIN: origin }))).toEqual(['AUTH_ORIGIN_INVALID'])
  })
})
