import { expect, test } from '@playwright/test'
import { calculateOrderTotals } from '../../shared/contracts/index.js'
import { ConfigurationError, nationalPhoneDigits, readCredentials, readDestination } from '../support/env.js'
import { redact } from '../support/redact.js'
import { resultFileName } from '../support/sanitizedReporter.js'
// @ts-expect-error módulo .mjs del launcher, sin declaraciones de tipos
import { parseReady, readyStamp } from '../../scripts/e2e-ready.mjs'

// Sin red ni navegador: validan las guardas del runner antes de tocar un Preview.
const PREVIEW = 'https://maui-git-feature-x-team.vercel.app'
const cloud = { BASE_URL: PREVIEW, E2E_READY_STAMP: 'abc123' }

test.describe('destino', () => {
  test('acepta un Preview https con ready y fija el bypass solo para su hostname', () => {
    const destination = readDestination({ ...cloud, SMOKE_BYPASS_TOKEN: 'token-de-prueba' })
    expect(destination).toMatchObject({
      origin: PREVIEW, hostname: 'maui-git-feature-x-team.vercel.app', loopback: false, authOrigin: PREVIEW, bypassToken: 'token-de-prueba',
    })
  })

  for (const [name, source] of Object.entries({
    'sin URL': {},
    'http fuera de loopback': { ...cloud, BASE_URL: 'http://maui.vercel.app' },
    'credenciales en la URL': { ...cloud, BASE_URL: 'https://user:pass@maui.vercel.app' },
    'ruta o query': { ...cloud, BASE_URL: `${PREVIEW}/admin?x=1` },
    'dominio de terceros': { ...cloud, BASE_URL: 'https://ejemplo.com' },
    'cloud sin ready de root': { BASE_URL: PREVIEW },
    'AUTH_ORIGIN distinto': { ...cloud, AUTH_ORIGIN: 'https://otro.vercel.app' },
    'bypass con loopback': { BASE_URL: 'http://localhost:3000', SMOKE_BYPASS_TOKEN: 'x' },
  })) {
    test(`rechaza ${name}`, () => {
      expect(() => readDestination(source)).toThrow(ConfigurationError)
    })
  }

  test('loopback http no exige ready ni bypass', () => {
    expect(readDestination({ BASE_URL: 'http://localhost:3000' })).toMatchObject({ loopback: true, bypassToken: null })
  })
})

test.describe('credenciales', () => {
  const complete = {
    SMOKE_CUSTOMER_PHONE: '+573001112233', SMOKE_CUSTOMER_PASSWORD: 'clave-cliente-1',
    SMOKE_STAFF_EMAIL: 'staff@ejemplo.invalid', SMOKE_STAFF_PASSWORD: 'clave-staff-1',
  }

  test('el owner por defecto es la cuenta de personal', () => {
    expect(readCredentials(complete).owner).toEqual({ email: 'staff@ejemplo.invalid', password: 'clave-staff-1' })
  })

  test('el error nombra las variables faltantes sin revelar valores', () => {
    const { SMOKE_STAFF_PASSWORD: _omitted, ...incomplete } = complete
    const message = (() => { try { readCredentials(incomplete) } catch (error) { return String(error) } return '' })()
    expect(message).toContain('SMOKE_STAFF_PASSWORD')
    expect(message).not.toContain('clave-cliente-1')
  })

  test('el celular se reduce a los 10 dígitos nacionales', () => {
    expect(nationalPhoneDigits('+57 300 111 2233')).toBe('3001112233')
    expect(nationalPhoneDigits('3001112233')).toBe('3001112233')
  })
})

test.describe('saneado', () => {
  const env = {
    SMOKE_CUSTOMER_PASSWORD: 'clave-cliente-1', SMOKE_BYPASS_TOKEN: 'token-bypass-9', SMOKE_CUSTOMER_PHONE: '+573001112233',
  }
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.firmafirmafirma'

  test('oculta contraseñas, tokens, celulares, JWT, Bearer y cookies', () => {
    const text = `fill("clave-cliente-1") x-vercel-protection-bypass: token-bypass-9 tel 3001112233 ${jwt} Bearer abc.def Cookie: session=${jwt}; a=b`
    const clean = redact(text, env)
    for (const secret of ['clave-cliente-1', 'token-bypass-9', '3001112233', jwt, 'abc.def', 'a=b']) expect(clean).not.toContain(secret)
  })

  test('conserva el texto inocuo', () => {
    expect(redact('Pedido ord-123 listo', env)).toBe('Pedido ord-123 listo')
  })
})

test.describe('ready de root', () => {
  const ready = { previewUrl: `${PREVIEW}/`, sha: 'a'.repeat(40), mode: 'real', env: { AUTH_ORIGIN: PREVIEW } }

  test('extrae origen y SHA del Preview', () => {
    expect(parseReady(JSON.stringify(ready))).toEqual({ origin: PREVIEW, sha: 'a'.repeat(40) })
  })

  for (const [name, patch] of Object.entries({
    'modo demo': { mode: 'demo' },
    'seed no limpio': { seedClean: false },
    'no listo': { ready: false },
    'build demo': { VITE_DEMO_MODE: 'true' },
    'AUTH_ORIGIN ajeno': { env: { AUTH_ORIGIN: 'https://otro.vercel.app' } },
  })) {
    test(`rechaza ${name}`, () => {
      expect(() => parseReady(JSON.stringify({ ...ready, ...patch }))).toThrow()
    })
  }

  test('sin URL, el error lista solo nombres de claves', () => {
    expect(() => parseReady(JSON.stringify({ sha: 'x', secreto: 'valor' }))).toThrow(/claves presentes: sha, secreto/)
  })

  test('la marca cambia con cada publicación', () => {
    expect(readyStamp('a')).not.toBe(readyStamp('b'))
  })
})

test('los contratos compartidos calculan los totales esperados por el smoke', () => {
  const totals = calculateOrderTotals([
    { qty: 1, priceAtMoment: 4_000 },
    { qty: 1, priceAtMoment: 10_000, is_variable_weight: true, kilosRequested: 0.75, kilosReal: 0.9 },
  ], 0)
  expect(totals).toEqual({ estimatedTotal: 11_500, finalTotal: 13_000 })
})

test('el resultado del full va a un archivo propio y no admite rutas', () => {
  expect(resultFileName('e2e-full-result.json')).toBe('e2e-full-result.json')
  expect(resultFileName(undefined)).toBe('e2e-result.json')
  for (const unsafe of ['../x.json', 'a/b.json', 'x.txt', '']) expect(resultFileName(unsafe)).toBe('e2e-result.json')
})
