// Smoke E2E REAL (con escrituras) de los adapters del admin contra un Preview/test con T-16 integrado.
// NO se ejecuta en `npm test` ni en CI: exige `SMOKE_REAL_FLOW=1` y credenciales por canal privado.
//
//   SMOKE_BASE_URL=https://<preview>.vercel.app SMOKE_REAL_FLOW=1 \
//   SMOKE_STAFF_EMAIL=… SMOKE_STAFF_PASSWORD=… SMOKE_CUSTOMER_PHONE=… SMOKE_CUSTOMER_PASSWORD=… \
//   npm --prefix maui-admin-front run smoke:preview
//
// Dos contextos independientes (cada uno con su propia cookie de sesión): CLIENTE (crea el pedido) y
// PERSONAL (lo gestiona). Las credenciales solo se leen del entorno y nunca se imprimen. Los productos y
// las cuentas son los del seed T-16 de la BD de test: el smoke los descubre (catálogo público) y no
// inventa datos. Solo se ejecuta contra una BD aislada de test; jamás contra Production.
// Cierre real de T-17: este smoke verde + evidencia de la API/Postgres de test (no los tests con mocks).

import { describe, expect, it } from 'vitest'
import { authSessionResponseSchema, publicCatalogResponseSchema, type OrderDto } from '@shared/contracts'
import { createApiClient, type ApiClient } from '../services/http/apiClient'
import { ApiError } from '../services/http/apiError'
import { createRealAuditRepository } from '../services/realAuditRepository'
import { createRealOrderRepository } from '../services/realOrderRepository'
import { createRealReceiptService } from '../services/realReceiptService'

const env = import.meta.env as Record<string, string | undefined>
const baseUrl = (env.SMOKE_BASE_URL ?? '').replace(/\/+$/, '')
const enabled = env.SMOKE_REAL_FLOW === '1'
const credentials = {
  staffEmail: env.SMOKE_STAFF_EMAIL,
  staffPassword: env.SMOKE_STAFF_PASSWORD,
  customerPhone: env.SMOKE_CUSTOMER_PHONE,
  customerPassword: env.SMOKE_CUSTOMER_PASSWORD,
}
const complete = Object.values(credentials).every((value) => value !== undefined && value !== '')

/** Contexto aislado: su cookie jar no se comparte con el otro (equivale a dos navegadores). */
const createContext = (): { client: ApiClient; fetchImpl: typeof fetch } => {
  const jar = new Map<string, string>()
  const fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set('Origin', baseUrl)
    if (env.SMOKE_VERCEL_BYPASS) headers.set('x-vercel-protection-bypass', env.SMOKE_VERCEL_BYPASS)
    if (jar.size > 0) headers.set('Cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '))
    const response = await fetch(new URL(String(input), baseUrl), { ...init, headers })
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
  return { client: createApiClient({ baseUrl: '/api', fetchImpl, timeoutMs: 30_000 }), fetchImpl }
}

const loginAs = async (client: ApiClient, body: Record<string, string>) =>
  client.request({ method: 'POST', path: '/auth/login', body, schema: authSessionResponseSchema })

const failureOf = async (promise: Promise<unknown>): Promise<ApiError> => {
  const error = await promise.then(() => undefined, (rejected: unknown) => rejected)
  expect(error, 'se esperaba un ApiError').toBeInstanceOf(ApiError)
  return error as ApiError
}

describe.skipIf(!enabled || !complete || baseUrl === '')(`flujo real cliente → personal en ${baseUrl}`, () => {
  const customerCtx = createContext()
  const staffCtx = createContext()
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
    expect((await failureOf(staffOrders.setRealWeights(received.orderId, [{ itemId: variable.id, kilos: 0.6 }], 'x', confirmed.version))).kind).not.toBe('unauthenticated')

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

  it('entrega el pedido y, una vez terminal, rechaza cancelarlo', async () => {
    const delivered = await staffOrders.updateStatus(state.orderId!, 'delivered', 'x', state.order!.version)
    expect(delivered.status).toBe('delivered')
    expect((await failureOf(staffOrders.cancel(state.orderId!, 'Motivo de prueba', 'x', delivered.version))).kind).toMatch(/conflict|validation/)
  })
})
