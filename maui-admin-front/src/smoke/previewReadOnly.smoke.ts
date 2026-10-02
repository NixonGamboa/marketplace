// Smoke de SOLO LECTURA de los adapters reales contra un Preview identificado.
//
//   SMOKE_BASE_URL=https://<preview>.vercel.app npm --prefix maui-admin-front run smoke:preview
//
// Variables opcionales (solo por entorno; nunca se imprimen):
//   SMOKE_VERCEL_BYPASS  secreto de «Protection Bypass for Automation» si el Preview está protegido.
//   SMOKE_STAFF_COOKIE   cookie de sesión de personal (`nombre=valor`) obtenida fuera de banda; habilita
//                        las lecturas autenticadas. Sin ella solo se comprueba el rechazo sin sesión.
//
// Solo emite GET: sin login, sin escrituras y sin tocar Production. Con la BD de test sin seed (T-16) la
// tienda pública responde 404 y el catálogo llega vacío: eso es un resultado válido y se informa, no un
// éxito de datos. Transiciones, pesos y auditoría no se ejercitan: no tienen endpoint (T-12/T-13).

import { describe, expect, it } from 'vitest'
import { publicCatalogResponseSchema, storeDtoSchema } from '@shared/contracts'
import { createApiClient } from '../services/http/apiClient'
import { ApiError } from '../services/http/apiError'
import { createRealAuthRepository } from '../services/realAuthRepository'
import { createRealCatalogRepository } from '../services/realCatalogRepository'
import { createRealMerchantRepository } from '../services/realMerchantRepository'
import { createRealOrderRepository } from '../services/realOrderRepository'
import { createRealStoreStatusRepository } from '../services/realStoreStatusRepository'

const env = import.meta.env as Record<string, string | undefined>
const baseUrl = (env.SMOKE_BASE_URL ?? '').replace(/\/+$/, '')
const staffCookie = env.SMOKE_STAFF_COOKIE
const bypass = env.SMOKE_VERCEL_BYPASS

const readOnlyFetch = (cookie?: string): typeof fetch => (input, init) => {
  if ((init?.method ?? 'GET') !== 'GET') throw new Error('El smoke es de solo lectura: solo se permite GET')
  const headers = new Headers(init?.headers)
  if (bypass) headers.set('x-vercel-protection-bypass', bypass)
  if (cookie) headers.set('Cookie', cookie)
  return fetch(new URL(String(input), baseUrl), { ...init, headers })
}

const apiFor = (cookie?: string) => createApiClient({ baseUrl: '/api', fetchImpl: readOnlyFetch(cookie), timeoutMs: 20_000 })

const failureKind = async (promise: Promise<unknown>): Promise<string> => {
  const error = await promise.then(() => undefined, (rejected: unknown) => rejected)
  expect(error, 'se esperaba un ApiError').toBeInstanceOf(ApiError)
  return (error as ApiError).kind
}

describe(`smoke de solo lectura en ${baseUrl}`, () => {
  it('health responde JSON del entorno', async () => {
    const response = await readOnlyFetch()('/api/health')
    expect(response.headers.get('content-type')).toContain('application/json')
    expect([200, 503]).toContain(response.status)
    console.info(`health: HTTP ${response.status}`)
  })

  it('lecturas públicas cumplen el contrato (tienda 404 y catálogo vacío = sin seed)', async () => {
    const client = apiFor()
    const store = await client.request({ path: '/store', schema: storeDtoSchema }).then(
      (dto) => dto.storeId,
      (error: unknown) => {
        expect(error).toBeInstanceOf(ApiError)
        expect((error as ApiError).kind).toBe('not_found')
        return null
      },
    )
    const catalog = await client.request({ path: '/catalog', schema: publicCatalogResponseSchema })
    console.info(`tienda pública: ${store ?? '404 (sin seed)'}; catálogo: ${catalog.products.length} productos, ${catalog.categories.length} categorías`)
  })

  it('sin sesión, cada repository real recibe 401 y no devuelve datos', async () => {
    const client = apiFor()
    expect(await createRealAuthRepository(client).me()).toBeNull()
    expect(await failureKind(createRealCatalogRepository(client).listProducts())).toBe('unauthenticated')
    expect(await failureKind(createRealMerchantRepository(client).get('cualquiera'))).toBe('unauthenticated')
    expect(await failureKind(createRealStoreStatusRepository(client).get())).toBe('unauthenticated')
    expect(await failureKind(createRealOrderRepository(client).listPage())).toBe('unauthenticated')
    expect(await failureKind(createRealOrderRepository(client).getById('inexistente'))).toBe('unauthenticated')
  })

  it.skipIf(!staffCookie)('con cookie de personal: lecturas autenticadas (solo conteos, sin datos personales)', async () => {
    const client = apiFor(staffCookie)
    const session = await createRealAuthRepository(client).me()
    expect(session, 'la cookie no corresponde a una sesión de personal vigente').not.toBeNull()
    const staffCatalog = await createRealCatalogRepository(client).getStaffCatalog()
    const merchant = await createRealMerchantRepository(client).get(session!.user.merchantId)
    const status = await createRealStoreStatusRepository(client).get()
    const orders = createRealOrderRepository(client)
    const page = await orders.listPage({}, { limit: 5 })
    console.info(
      `sesión ${session!.user.role}; catálogo staff: ${staffCatalog.products.length} productos; ` +
        `aliado: ${merchant.merchantId}; override: ${status.override}; pedidos en 1ª página: ${page.items.length}; más páginas: ${page.nextCursor !== null}`,
    )
    const first = page.items[0]
    if (first) expect((await orders.getById(first.orderId)).orderId).toBe(first.orderId)
  })
})
