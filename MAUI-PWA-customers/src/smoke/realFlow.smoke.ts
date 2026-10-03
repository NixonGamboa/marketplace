// Smoke E2E REAL (con escrituras) de los servicios de la PWA contra un Preview/test con T-16 integrado.
// NO se ejecuta en `npm test` ni en CI: exige `SMOKE_REAL_FLOW=1` y cuentas por canal privado.
//
//   SMOKE_BASE_URL=https://<preview>.vercel.app SMOKE_REAL_FLOW=1 \
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

import { describe, expect, it } from 'vitest'
import { authSessionResponseSchema } from '@shared/contracts'
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
const credentials = {
  phone: env.SMOKE_CUSTOMER_PHONE,
  password: env.SMOKE_CUSTOMER_PASSWORD,
  otherPhone: env.SMOKE_OTHER_CUSTOMER_PHONE,
  otherPassword: env.SMOKE_OTHER_CUSTOMER_PASSWORD,
}
const complete = Object.values(credentials).every((value) => value !== undefined && value !== '')

/** Contexto aislado: su cookie jar no se comparte con el otro (equivale a dos navegadores). */
const createContext = (): ApiClient => {
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
  return createApiClient({ baseUrl: '/api', fetchImpl, timeoutMs: 30_000 })
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

describe.skipIf(!enabled || !complete || baseUrl === '')(`flujo real de cliente en ${baseUrl}`, () => {
  const mine = servicesFor(createContext())
  const other = servicesFor(createContext())
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

  it('crea el pedido con identidad y teléfono reales; reintentar con la misma intención no lo duplica', async () => {
    const store = await mine.catalog.getStore()
    const slot = store.availability.availableTimeSlots[0]
    expect(slot, 'debe haber una franja disponible hoy').toBeDefined()
    const payload = {
      userId: state.userId!,
      items: [
        { id: state.productId!, qty: 1, priceAtMoment: 1, name: 'ignorado' },
        { id: state.variableId!, qty: 1, priceAtMoment: 1, is_variable_weight: true, kilosRequested: 0.5 },
      ],
      substitutionPreference: 'similar' as const,
      deliveryType: 'pickup' as const,
      deliveryData: { timeSlot: slot! },
      customerName: 'Smoke T-18',
      customerPhone: credentials.phone!,
      shippingCost: 0,
    }
    const first = await mine.orders.submit(payload)
    const repeated = await mine.orders.submit(payload)
    expect(repeated.orderId).toBe(first.orderId)
    expect(first.status).toBe('received')
    state.orderId = first.orderId
  })

  it('el historial filtra y pagina en el servidor (q, status, from, to)', async () => {
    const byId = await mine.orders.listPage({ q: state.orderId!.slice(0, 12), limit: 5 })
    expect(byId.items.some((order) => order.orderId === state.orderId)).toBe(true)

    const received = await mine.orders.listPage({ status: 'received', limit: 100 })
    expect(received.items.every((order) => order.status === 'received')).toBe(true)

    const today = new Date().toISOString().slice(0, 10)
    const day = await mine.orders.listPage({ from: today, to: today, limit: 100 })
    expect(day.items.some((order) => order.orderId === state.orderId)).toBe(true)

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
    const anonymous = servicesFor(createContext())
    expect((await failureOf(anonymous.orders.listPage())).kind).toBe('unauthenticated')
    await mine.auth.logout()
    expect((await failureOf(mine.orders.getById(state.orderId!))).kind).toBe('unauthenticated')
    const raw = await createContext().request({ path: '/auth/session', schema: authSessionResponseSchema }).then(() => 'ok', (e: unknown) => (e as ApiError).kind)
    expect(raw).toBe('unauthenticated')
  })
})
