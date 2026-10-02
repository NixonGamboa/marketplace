// Smoke de SOLO LECTURA de los servicios reales de la PWA contra un Preview identificado.
//
//   SMOKE_BASE_URL=https://<preview>.vercel.app npm --prefix MAUI-PWA-customers run smoke:preview
//
// Variables opcionales (solo por entorno; nunca se imprimen):
//   SMOKE_VERCEL_BYPASS  secreto de «Protection Bypass for Automation» si el Preview está protegido.
//   SMOKE_CUSTOMER_COOKIE cookie de sesión de cliente (`nombre=valor`) obtenida fuera de banda; habilita la
//                        lectura autenticada de pedidos propios. Sin ella solo se comprueba el rechazo sin sesión.
//
// Solo emite GET: sin registro, login ni creación de pedidos, y sin tocar Production. Con la BD de test sin
// seed (T-16) la tienda pública responde 404 y el catálogo llega vacío: es un resultado válido y se informa
// como «sin seed», no como éxito de datos.

import { describe, expect, it } from 'vitest'
import { createApiClient } from '../services/http/apiClient'
import { ApiError } from '../services/http/apiError'
import { createRealAuthService } from '../services/realAuthService'
import { createRealCatalogService } from '../services/realCatalogService'
import { createRealOrderService } from '../services/realOrderService'
import { createCheckoutIntents } from '../services/real/checkoutIntent'

const env = import.meta.env as Record<string, string | undefined>
const baseUrl = (env.SMOKE_BASE_URL ?? '').replace(/\/+$/, '')
const customerCookie = env.SMOKE_CUSTOMER_COOKIE
const bypass = env.SMOKE_VERCEL_BYPASS

const readOnlyFetch = (cookie?: string): typeof fetch => (input, init) => {
  if ((init?.method ?? 'GET') !== 'GET') throw new Error('El smoke es de solo lectura: solo se permite GET')
  const headers = new Headers(init?.headers)
  if (bypass) headers.set('x-vercel-protection-bypass', bypass)
  if (cookie) headers.set('Cookie', cookie)
  return fetch(new URL(String(input), baseUrl), { ...init, headers })
}

const servicesFor = (cookie?: string) => {
  const client = createApiClient({ baseUrl: '/api', fetchImpl: readOnlyFetch(cookie), timeoutMs: 20_000 })
  const auth = createRealAuthService(client)
  return {
    auth,
    catalog: createRealCatalogService(client),
    // Intenciones en memoria: el smoke nunca escribe en el almacenamiento.
    orders: createRealOrderService(client, auth, createCheckoutIntents({ read: () => null, write: () => undefined, clear: () => undefined })),
  }
}

const failureOf = async (promise: Promise<unknown>): Promise<ApiError> => {
  const error = await promise.then(() => undefined, (rejected: unknown) => rejected)
  expect(error, 'se esperaba un ApiError').toBeInstanceOf(ApiError)
  return error as ApiError
}

describe(`smoke de solo lectura de la PWA en ${baseUrl}`, () => {
  it('health responde JSON del entorno', async () => {
    const response = await readOnlyFetch()('/api/health')
    expect(response.headers.get('content-type')).toContain('application/json')
    expect([200, 503]).toContain(response.status)
    console.info(`health: HTTP ${response.status}`)
  })

  it('catálogo y tienda públicos cumplen el contrato (tienda 404 y catálogo vacío = sin seed)', async () => {
    const { catalog } = servicesFor()
    const store = await catalog.getStore().then(
      (dto) => dto.storeId,
      (error: unknown) => {
        expect(error).toBeInstanceOf(ApiError)
        expect((error as ApiError).kind).toBe('not_found')
        return null
      },
    )
    const { products, categories } = await catalog.getCatalog()
    console.info(`tienda pública: ${store ?? '404 (sin seed)'}; catálogo: ${products.length} productos, ${categories.length} categorías`)
    if (products[0]) expect((await catalog.getProduct(products[0].id)).id).toBe(products[0].id)
  })

  it('sin sesión, auth y pedidos reciben 401 y no devuelven datos', async () => {
    const { auth, orders } = servicesFor()
    expect(await auth.me()).toBeNull()
    expect((await failureOf(orders.listPage())).kind).toBe('unauthenticated')
    expect((await failureOf(orders.getById('inexistente'))).kind).toBe('unauthenticated')
    expect((await failureOf(orders.list())).kind).toBe('unauthenticated')
  })

  it.skipIf(!customerCookie)('con cookie de cliente: historial propio paginado (solo conteos, sin datos personales)', async () => {
    const { auth, orders } = servicesFor(customerCookie)
    const session = await auth.me()
    expect(session, 'la cookie no corresponde a una sesión de cliente vigente').not.toBeNull()
    const page = await orders.listPage({ limit: 5 })
    console.info(`sesión cliente; pedidos en 1ª página: ${page.items.length}; más páginas: ${page.nextCursor !== null}`)
    const first = page.items[0]
    if (first) expect((await orders.getById(first.orderId)).orderId).toBe(first.orderId)
  })
})
