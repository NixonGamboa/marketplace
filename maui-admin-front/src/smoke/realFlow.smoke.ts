// @vitest-environment jsdom
/// <reference types="node" />
// Smoke E2E REAL (con escrituras) de los adapters del admin contra un Preview/test con T-16 integrado.
// NO se ejecuta en `npm test` ni en CI: exige `SMOKE_REAL_FLOW=1` y credenciales por canal privado.
//
//   SMOKE_BASE_URL=https://<preview>.vercel.app SMOKE_AUTH_ORIGIN=https://<develop>.vercel.app SMOKE_REAL_FLOW=1 \
//   SMOKE_STAFF_EMAIL=… SMOKE_STAFF_PASSWORD=… SMOKE_CUSTOMER_PHONE=… SMOKE_CUSTOMER_PASSWORD=… \
//   npm --prefix maui-admin-front run smoke:preview
//
// Dos contextos independientes (cada uno con su propia cookie de sesión): CLIENTE (crea el pedido) y
// PERSONAL (lo gestiona). Las credenciales solo se leen del entorno y nunca se imprimen. Los productos y
// las cuentas son los del seed T-16 de la BD de test: el smoke los descubre (catálogo público) y no
// inventa datos. Solo se ejecuta contra una BD aislada de test; jamás contra Production.
// Cierre real de T-17: este smoke verde + evidencia de la API/Postgres de test (no los tests con mocks).

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { URL as NodeURL, fileURLToPath } from 'node:url'
import { orderConfirmationSchema, authSessionResponseSchema, publicCatalogResponseSchema, type OrderDto } from '@shared/contracts'
import { createApiClient, type ApiClient } from '../services/http/apiClient'
import { ApiError } from '../services/http/apiError'
import { startOrderPolling } from '../lib/orderPolling'
import { createRealAuditRepository } from '../services/realAuditRepository'
import { createRealOrderRepository } from '../services/realOrderRepository'
import { createRealReceiptService } from '../services/realReceiptService'

const env = import.meta.env as Record<string, string | undefined>
const baseUrl = (env.SMOKE_BASE_URL ?? '').replace(/\/+$/, '')
const enabled = env.SMOKE_REAL_FLOW === '1'
const authOrigin = env.SMOKE_AUTH_ORIGIN ?? ''
const credentials = {
  staffEmail: env.SMOKE_STAFF_EMAIL,
  staffPassword: env.SMOKE_STAFF_PASSWORD,
  customerPhone: env.SMOKE_CUSTOMER_PHONE,
  customerPassword: env.SMOKE_CUSTOMER_PASSWORD,
}
const complete = Object.values(credentials).every((value) => value !== undefined && value !== '')

// Checkpoint local para limpieza del orquestador: sin cuerpos, cuentas ni secretos.
const checkpointUrl = new NodeURL('../../../orquestacion-local/smoke-runtime.json', import.meta.url)
const runtime: { block: string; phase: string; orders: { key: string; orderId?: string }[]; sessionsClosed?: boolean } = {
  block: 'T-17', phase: 'prepared', orders: [],
}
let guardReady = false
const saveCheckpoint = (phase: string) => {
  runtime.phase = phase
  mkdirSync(fileURLToPath(new NodeURL('.', checkpointUrl)), { recursive: true })
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
    client,
    close: async () => {
      if (jar.size > 0) await client.request({ method: 'POST', path: '/auth/logout' })
    },
  }
}

const loginAs = async (client: ApiClient, body: Record<string, string>) =>
  client.request({ method: 'POST', path: '/auth/login', body, schema: authSessionResponseSchema })

const failureOf = async (promise: Promise<unknown>): Promise<ApiError> => {
  const error = await promise.then(() => undefined, (rejected: unknown) => rejected)
  expect(error, 'se esperaba un ApiError').toBeInstanceOf(ApiError)
  return error as ApiError
}

describe.skipIf(!enabled)('flujo real cliente → personal', () => {
  const customerCtx = createContext()
  const staffCtx = createContext()
  beforeAll(validateDestination)
  afterAll(async () => {
    if (!guardReady) return
    const results = await Promise.allSettled([customerCtx.close(), staffCtx.close()])
    runtime.sessionsClosed = results.every((result) => result.status === 'fulfilled')
    saveCheckpoint('finished')
    expect(runtime.sessionsClosed, 'todas las sesiones propias deben cerrarse').toBe(true)
  })
  const customerOrders = createRealOrderRepository(customerCtx.client)
  const staffOrders = createRealOrderRepository(staffCtx.client)
  const state: { customerId?: string; orderId?: string; order?: OrderDto; fixedId?: string; variableId?: string } = {}

  it('abre las dos sesiones y descubre productos del seed en el catálogo público', async () => {
    const customer = await loginAs(customerCtx.client, { method: 'phone', phone: credentials.customerPhone!, password: credentials.customerPassword! })
    expect(customer.account.role).toBe('customer')
    state.customerId = customer.account.id
    const staff = await loginAs(staffCtx.client, { method: 'email', email: credentials.staffEmail!, password: credentials.staffPassword! })
    expect(['owner', 'operator']).toContain(staff.account.role)

    const catalog = await customerCtx.client.request({ path: '/catalog', schema: publicCatalogResponseSchema })
    const available = catalog.products.filter((product) => product.inStock)
    state.fixedId = available.find((product) => !product.is_variable_weight)?.id
    state.variableId = available.find((product) => product.is_variable_weight)?.id
    expect(state.fixedId, 'el seed debe incluir un producto de peso fijo disponible').toBeDefined()
    expect(state.variableId, 'el seed debe incluir un producto de peso variable disponible').toBeDefined()
  })

  it('el cliente crea un pedido; repetir la misma Idempotency-Key devuelve el mismo pedido', async () => {
    const key = `smoke-t17-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const payload = {
      userId: state.customerId!,
      items: [{ id: state.fixedId!, qty: 1 }, { id: state.variableId!, qty: 1, kilosRequested: 0.5 }],
      substitutionPreference: 'similar' as const,
      deliveryType: 'pickup' as const,
      deliveryData: {},
      customerName: 'Smoke T-17',
      customerPhone: credentials.customerPhone!,
    }
    const first = await customerOrders.submit(payload, key)
    const repeated = await customerOrders.submit(payload, key)
    expect(repeated.orderId).toBe(first.orderId)
    state.orderId = first.orderId
  })

  it('el personal lo encuentra con filtros del servidor y lo lee con versión', async () => {
    const page = await staffOrders.listPage({ status: 'received', q: state.orderId!.slice(0, 12) }, { limit: 20 })
    expect(page.items.some((order) => order.orderId === state.orderId)).toBe(true)
    state.order = await staffOrders.getById(state.orderId!)
    expect(state.order.version).toBeGreaterThanOrEqual(1)
  })

  it('transiciones con versión: confirmar, un 409 con versión vieja y pesos solo en preparación', async () => {
    const received = state.order!
    const confirmed = await staffOrders.updateStatus(received.orderId, 'confirmed', 'ignorado', received.version)
    expect(confirmed.status).toBe('confirmed')
    expect((await failureOf(staffOrders.updateStatus(received.orderId, 'preparing', 'ignorado', received.version))).kind).toBe('conflict')
    // Pesar antes de preparar no está permitido.
    const variable = confirmed.items.find((item) => item.is_variable_weight)!
    expect((await failureOf(staffOrders.setRealWeights(received.orderId, [{ itemId: variable.id, kilos: 0.6 }], 'x', confirmed.version))).kind).toBe('validation')

    const preparing = await staffOrders.updateStatus(received.orderId, 'preparing', 'x', confirmed.version)
    const weighed = await staffOrders.setRealWeights(received.orderId, [{ itemId: variable.id, kilos: 0.6 }], 'x', preparing.version!)
    expect(weighed.items.find((item) => item.id === variable.id)?.kilosReal).toBe(0.6)
    const ready = await staffOrders.updateStatus(received.orderId, 'ready', 'x', weighed.version)
    expect(ready.finalTotal).toBeDefined()
    expect(ready.estimatedTotal).toBe(received.estimatedTotal)
    state.order = ready
  })

  it('el comprobante y la auditoría reflejan el pedido persistido', async () => {
    const receipt = await createRealReceiptService(staffCtx.client).load(state.orderId!)
    expect(receipt.receipt.rows.join('\n')).toContain(state.orderId)
    const audit = await createRealAuditRepository(staffCtx.client).listPage({ entity: 'order', entityId: state.orderId! })
    expect(audit.items.some((event) => event.action === 'status_changed')).toBe(true)
  })

  it('el cliente no ve el panel ni cambia estados; el personal no crea pedidos', async () => {
    expect((await failureOf(customerOrders.updateStatus(state.orderId!, 'delivered', 'x', state.order!.version))).kind).toBe('forbidden')
    const forbidden = await failureOf(staffOrders.submit({
      userId: 'cualquiera', items: [{ id: state.fixedId!, qty: 1 }], substitutionPreference: 'remove',
      deliveryType: 'pickup', deliveryData: {}, customerName: 'No', customerPhone: credentials.customerPhone!,
    }, `smoke-t17-staff-${Date.now()}-abcdef`))
    expect(forbidden.kind).toBe('forbidden')
  })

  it('el polling del cliente observa la entrega de otro dispositivo, versión y total final', async () => {
    let expectedStatus = 'ready'
    let resolveStatus: (order: OrderDto) => void = () => undefined
    let rejectStatus: (failure: unknown) => void = () => undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const waitForStatus = (status: string) => {
      expectedStatus = status
      return new Promise<OrderDto>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('El polling no observó el estado esperado')), 15_000)
        resolveStatus = (order) => { clearTimeout(timer); resolve(order) }
        rejectStatus = (failure) => { clearTimeout(timer); reject(failure) }
      })
    }
    const ready = waitForStatus('ready')
    const poll = startOrderPolling(async (signal) => {
      const order = await customerOrders.getById(state.orderId!, { signal })
      if (!signal.aborted && order.status === expectedStatus) resolveStatus(order)
    }, (failure) => rejectStatus(failure), 1_000)
    try {
      await ready
      const observed = waitForStatus('delivered')
      void observed.catch(() => undefined) // Se maneja también si el PATCH falla antes de esperar el sondeo.
      const delivered = await staffOrders.updateStatus(state.orderId!, 'delivered', 'x', state.order!.version)
      const fromOtherDevice = await observed
      expect(fromOtherDevice.orderId).toBe(delivered.orderId)
      expect(fromOtherDevice.version).toBe(delivered.version)
      expect(fromOtherDevice.finalTotal).toBe(delivered.finalTotal)
      expect(fromOtherDevice.estimatedTotal).toBe(state.order!.estimatedTotal)
      expect((await failureOf(staffOrders.cancel(state.orderId!, 'Motivo de prueba', 'x', delivered.version))).kind).toMatch(/conflict|validation/)
    } finally { clearTimeout(timer); poll.stop() }
  })
})
