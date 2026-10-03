/// <reference types="node" />
// Smoke E2E REAL (con escrituras) de los servicios de la PWA contra un Preview/test con T-16 integrado.
// NO se ejecuta en `npm test` ni en CI: exige `SMOKE_REAL_FLOW=1` y cuentas por canal privado.
//
//   SMOKE_BASE_URL=https://<preview>.vercel.app SMOKE_AUTH_ORIGIN=https://<develop>.vercel.app SMOKE_REAL_FLOW=1 \
//   SMOKE_CUSTOMER_PHONE=… SMOKE_CUSTOMER_PASSWORD=… \
//   SMOKE_OTHER_CUSTOMER_PHONE=… SMOKE_OTHER_CUSTOMER_PASSWORD=… \
//   npm --prefix MAUI-PWA-customers run smoke:preview
//
// Dos CONTEXTOS de cliente independientes (cookie jar propio cada uno, como dos navegadores): el
// segundo comprueba el aislamiento de datos privados. Las credenciales solo se leen del entorno y
// nunca se imprimen. Productos y cuentas son los del seed T-16 de la BD de test: el smoke los descubre
// (catálogo público) y no inventa datos. Solo contra BD aislada de test; jamás contra Production.
// Cierre real de T-18: este smoke verde + evidencia de la API/Postgres de test (no los tests con mocks).
// El contexto del PERSONAL (admin) se ejercita en el smoke equivalente de maui-admin-front.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { orderConfirmationSchema, authSessionResponseSchema } from '@shared/contracts'
import { createApiClient, type ApiClient } from '../services/http/apiClient'
import { ApiError } from '../services/http/apiError'
import { createRealAuthService } from '../services/realAuthService'
import { createRealCatalogService } from '../services/realCatalogService'
import { createRealOrderService } from '../services/realOrderService'
import { createRealReceiptService } from '../services/realReceiptService'
import { createCheckoutIntents, type IntentStorage, type StoredIntent } from '../services/real/checkoutIntent'

const env = import.meta.env as Record<string, string | undefined>
const baseUrl = (env.SMOKE_BASE_URL ?? '').replace(/\/+$/, '')
const enabled = env.SMOKE_REAL_FLOW === '1'
const authOrigin = env.SMOKE_AUTH_ORIGIN ?? ''
const credentials = {
  phone: env.SMOKE_CUSTOMER_PHONE,
  password: env.SMOKE_CUSTOMER_PASSWORD,
  otherPhone: env.SMOKE_OTHER_CUSTOMER_PHONE,
  otherPassword: env.SMOKE_OTHER_CUSTOMER_PASSWORD,
}
const complete = Object.values(credentials).every((value) => value !== undefined && value !== '')

// Checkpoint local para limpieza del orquestador: sin cuerpos, cuentas ni secretos.
const checkpointUrl = new URL('../../../orquestacion-local/smoke-runtime.json', import.meta.url)
const runtime: { block: string; phase: string; orders: { key: string; orderId?: string }[]; sessionsClosed?: boolean } = {
  block: 'T-18', phase: 'prepared', orders: [],
}
let guardReady = false
const saveCheckpoint = (phase: string) => {
  runtime.phase = phase
  mkdirSync(fileURLToPath(new URL('.', checkpointUrl)), { recursive: true })
  writeFileSync(fileURLToPath(checkpointUrl), JSON.stringify(runtime, null, 2))
}
const cleanHttpsOrigin = (value: string, label: string) => {
  let url: URL
  try { url = new URL(value) } catch { throw new Error(label + ' requiere un origen HTTPS') }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(label + ' requiere un origen HTTPS limpio, sin ruta ni credenciales')
  }
  return url.origin
}
const validateDestination = async () => {
  if (!complete) throw new Error('El smoke habilitado requiere todas sus credenciales')
  cleanHttpsOrigin(baseUrl, 'SMOKE_BASE_URL')
  cleanHttpsOrigin(authOrigin, 'SMOKE_AUTH_ORIGIN')
  const headers = new Headers()
  if (env.SMOKE_VERCEL_BYPASS) headers.set('x-vercel-protection-bypass', env.SMOKE_VERCEL_BYPASS)
  const response = await fetch(new URL('/api/health', baseUrl), { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error('El destino no acredita salud de test')
  const health: unknown = await response.json()
  expect(health).toMatchObject({ status: 'ok', environment: 'test', database: 'connected' })
  if (existsSync(fileURLToPath(checkpointUrl))) {
    const previous: unknown = JSON.parse(readFileSync(fileURLToPath(checkpointUrl), 'utf8'))
    if (typeof previous !== 'object' || previous === null || !('block' in previous) || previous.block !== runtime.block ||
      !('orders' in previous) || !Array.isArray(previous.orders)) throw new Error('Checkpoint local inválido')
    for (const record of previous.orders as unknown[]) {
      if (typeof record !== 'object' || record === null || !('key' in record) || typeof record.key !== 'string' ||
        ('orderId' in record && typeof record.orderId !== 'string')) throw new Error('Checkpoint local inválido')
      runtime.orders.push({ key: record.key, ...('orderId' in record ? { orderId: record.orderId as string } : {}) })
    }
  }
  saveCheckpoint('validated')
  guardReady = true
}

/** Contexto aislado: su cookie jar no se comparte con el otro (equivale a dos navegadores). */
const createContext = () => {
  const jar = new Map<string, string>()
  let loseNextOrderResponse = false
  const submittedKeys: string[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set('Origin', authOrigin)
    if (env.SMOKE_VERCEL_BYPASS) headers.set('x-vercel-protection-bypass', env.SMOKE_VERCEL_BYPASS)
    if (jar.size > 0) headers.set('Cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '))
    const url = new URL(String(input), baseUrl)
    const createsOrder = init?.method === 'POST' && url.pathname === '/api/orders'
    const key = createsOrder ? headers.get('Idempotency-Key') : null
    if (createsOrder) {
      if (!key) throw new Error('Crear un pedido requiere Idempotency-Key')
      submittedKeys.push(key)
      if (!runtime.orders.some((order) => order.key === key)) runtime.orders.push({ key })
      saveCheckpoint('creating')
    }
    const response = await fetch(url, { ...init, headers, redirect: 'error' })
    if (createsOrder && (response.status === 201 || response.status === 200)) {
      const confirmation = orderConfirmationSchema.parse(await response.clone().json())
      const record = runtime.orders.find((order) => order.key === key && order.orderId === undefined)
      if (record) record.orderId = confirmation.orderId
      else if (!runtime.orders.some((order) => order.key === key && order.orderId === confirmation.orderId)) {
        runtime.orders.push({ key: key!, orderId: confirmation.orderId })
      }
      saveCheckpoint('created')
      if (loseNextOrderResponse) {
        loseNextOrderResponse = false
        await response.arrayBuffer()
        // La API y Postgres ya confirmaron; solo se pierde la entrega al cliente.
        throw new Error('Respuesta de creación perdida por el transporte del smoke')
      }
    }
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';')
      const separator = pair.indexOf('=')
      const name = pair.slice(0, separator).trim()
      const value = pair.slice(separator + 1).trim()
      if (value === '' || /max-age=0/i.test(cookie)) jar.delete(name)
      else jar.set(name, value)
    }
    return response
  }
  const client = createApiClient({ baseUrl: '/api', fetchImpl, timeoutMs: 30_000 })
  return {
    client, submittedKeys,
    loseNextOrderResponse: () => { loseNextOrderResponse = true },
    close: async () => {
      if (jar.size > 0) await client.request({ method: 'POST', path: '/auth/logout' })
    },
  }
}

const memoryIntents = (): IntentStorage => {
  let value: StoredIntent | null = null
  return { read: () => value, write: (intent) => { value = intent }, clear: () => { value = null } }
}

const servicesFor = (client: ApiClient) => {
  const auth = createRealAuthService(client)
  return {
    client,
    auth,
    catalog: createRealCatalogService(client),
    orders: createRealOrderService(client, auth, createCheckoutIntents(memoryIntents())),
    receipt: createRealReceiptService(client),
  }
}

const failureOf = async (promise: Promise<unknown>): Promise<ApiError> => {
  const error = await promise.then(() => undefined, (rejected: unknown) => rejected)
  expect(error, 'se esperaba un ApiError').toBeInstanceOf(ApiError)
  return error as ApiError
}

describe.skipIf(!enabled)('flujo real de cliente', () => {
  const mineCtx = createContext()
  const otherCtx = createContext()
  const mine = servicesFor(mineCtx.client)
  const other = servicesFor(otherCtx.client)
  beforeAll(validateDestination)
  afterAll(async () => {
    if (!guardReady) return
    const results = await Promise.allSettled([mineCtx.close(), otherCtx.close()])
    runtime.sessionsClosed = results.every((result) => result.status === 'fulfilled')
    saveCheckpoint('finished')
    expect(runtime.sessionsClosed, 'todas las sesiones propias deben cerrarse').toBe(true)
  })
  const state: { userId?: string; productId?: string; variableId?: string; orderId?: string } = {}

  it('inicia sesión en los dos contextos con cuentas distintas y lee el catálogo y la tienda reales', async () => {
    const first = await mine.auth.login(credentials.phone!, credentials.password!)
    const second = await other.auth.login(credentials.otherPhone!, credentials.otherPassword!)
    expect(first.user.id).not.toBe(second.user.id)
    state.userId = first.user.id

    const catalog = await mine.catalog.getCatalog()
    const available = catalog.products.filter((product) => product.inStock)
    state.productId = available.find((product) => !product.is_variable_weight)?.id
    state.variableId = available.find((product) => product.is_variable_weight)?.id
    expect(state.productId, 'el seed debe incluir un producto de peso fijo disponible').toBeDefined()
    expect(state.variableId, 'el seed debe incluir un producto de peso variable disponible').toBeDefined()

    const store = await mine.catalog.getStore()
    expect(store.delivery.coverageNote ?? '').toBeDefined()
    expect(store.availability.isOpen, 'la tienda de test debe estar abierta para crear el pedido').toBe(true)
  })

  it('doble envío concurrente y pérdida de respuesta real conservan la intención sin duplicar', async () => {
    const payload = {
      userId: state.userId!,
      items: [
        { id: state.productId!, qty: 1, priceAtMoment: 1, name: 'ignorado' },
        { id: state.variableId!, qty: 1, priceAtMoment: 1, is_variable_weight: true, kilosRequested: 0.5 },
      ],
      substitutionPreference: 'similar' as const,
      deliveryType: 'pickup' as const,
      deliveryData: {},
      customerName: 'Smoke T-18',
      customerPhone: credentials.phone!,
      shippingCost: 0,
    }
    const before = mineCtx.submittedKeys.length
    mineCtx.loseNextOrderResponse()
    const attempts = await Promise.allSettled([mine.orders.submit(payload), mine.orders.submit(payload)])
    expect(attempts.every((result) => result.status === 'rejected' && result.reason instanceof ApiError && result.reason.kind === 'network')).toBe(true)
    expect(mineCtx.submittedKeys.length - before, 'el doble clic solo envía una creación').toBe(1)
    const lostKey = mineCtx.submittedKeys[before]!
    const persistedId = runtime.orders.find((order) => order.key === lostKey)?.orderId
    expect(persistedId, 'la respuesta perdida ya confirmó la escritura real').toBeDefined()
    const [repeated, concurrent] = await Promise.all([mine.orders.submit(payload), mine.orders.submit(payload)])
    expect(concurrent.orderId).toBe(repeated.orderId)
    expect(mineCtx.submittedKeys.length - before).toBe(2)
    expect(mineCtx.submittedKeys[before + 1]).toBe(lostKey)
    expect(repeated.orderId).toBe(persistedId)
    expect(repeated.status).toBe('received')
    state.orderId = repeated.orderId
    const page = await mine.orders.listPage({ q: repeated.orderId, limit: 100 })
    expect(page.items.filter((order) => order.orderId === repeated.orderId)).toHaveLength(1)
  })

  it('el historial filtra y pagina en el servidor (q, status, from, to)', async () => {
    const byId = await mine.orders.listPage({ q: state.orderId!.slice(0, 12), limit: 5 })
    expect(byId.items.some((order) => order.orderId === state.orderId)).toBe(true)

    const received = await mine.orders.listPage({ status: 'received', limit: 100 })
    expect(received.items.every((order) => order.status === 'received')).toBe(true)

    const persisted = await mine.orders.getById(state.orderId!)
    const createdAt = Date.parse(persisted.createdAt)
    const from = new Date(createdAt - 1_000).toISOString()
    const to = new Date(createdAt + 1_000).toISOString()
    const window = await mine.orders.listPage({ q: state.orderId!, from, to, limit: 100 })
    expect(window.items.some((order) => order.orderId === state.orderId)).toBe(true)
    // El contrato incluye from y excluye to: el instante de creación como to queda fuera.
    const beforeCreation = await mine.orders.listPage({
      q: state.orderId!, from, to: new Date(createdAt).toISOString(), limit: 100,
    })
    expect(beforeCreation.items.some((order) => order.orderId === state.orderId)).toBe(false)

    const pagedA = await mine.orders.listPage({ limit: 1 })
    if (pagedA.nextCursor !== null) {
      const pagedB = await mine.orders.listPage({ limit: 1, cursor: pagedA.nextCursor })
      expect(pagedB.items[0]?.orderId).not.toBe(pagedA.items[0]?.orderId)
    }
  })

  it('seguimiento y comprobante salen del servidor persistente con el contacto de la tienda', async () => {
    const order = await mine.orders.getById(state.orderId!)
    expect(order.userId).toBe(state.userId)
    expect(order.customerPhone).toBe(credentials.phone!.replace(/\D/g, '').replace(/^(?!57)/, '57'))
    const receipt = await mine.receipt.load(state.orderId!)
    expect(receipt.receipt.rows.join('\n')).toContain(state.orderId)
  })

  it('aislamiento: el otro cliente no ve el pedido ni en su historial ni por ID', async () => {
    expect((await failureOf(other.orders.getById(state.orderId!))).kind).toBe('not_found')
    const history = await other.orders.listPage({ q: state.orderId!.slice(0, 12), limit: 50 })
    expect(history.items.some((order) => order.orderId === state.orderId)).toBe(false)
  })

  it('sin sesión no hay datos privados y el logout invalida la cookie', async () => {
    const anonymous = servicesFor(createContext().client)
    expect((await failureOf(anonymous.orders.listPage())).kind).toBe('unauthenticated')
    await mine.auth.logout()
    expect((await failureOf(mine.orders.getById(state.orderId!))).kind).toBe('unauthenticated')
    const raw = await createContext().client.request({ path: '/auth/session', schema: authSessionResponseSchema }).then(() => 'ok', (e: unknown) => (e as ApiError).kind)
    expect(raw).toBe('unauthenticated')
  })
})
