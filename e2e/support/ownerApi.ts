/**
 * Cliente API del owner de fixtures para preparar el escenario: comprobar el destino, devolver el
 * override que dejó una corrida interrumpida y leer auditoría. Usa el mismo servidor y la misma
 * autenticación por cookie que las apps; no hay atajos ni mocks. La tienda nunca se abre para pedir:
 * recibir pedidos no depende del horario (PM-03).
 */
import { expect, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test'
import {
  authSessionResponseSchema, auditListResponseSchema, staffCatalogResponseSchema, staffProductDtoSchema, storeDtoSchema,
  type AuditEvent, type StaffProductDto, type StoreDto, type UpdateProductRequest, type UpdateStoreSettingsRequest,
} from '../../shared/contracts/index.js'
import { apiHeaders } from './actors.js'
import type { Credentials, Destination } from './env.js'
import type { FixtureApi } from './fixtures.js'
import { saveRuntime, type RuntimeRecord } from './runtime.js'

type Playwright = PlaywrightWorkerArgs['playwright']

export interface OwnerApi extends FixtureApi {
  request: APIRequestContext
  storeId: string
  /** Devuelve el override que una corrida anterior interrumpida dejó aplicado; no cambia el horario por su cuenta. */
  restoreInterruptedOverride(runtime: RuntimeRecord): Promise<void>
  orderAudit(orderId: string): Promise<AuditEvent[]>
  close(): Promise<void>
}

export async function checkHealth(playwright: Playwright, dest: Destination): Promise<Record<string, unknown>> {
  const request = await playwright.request.newContext({ baseURL: dest.origin, extraHTTPHeaders: apiHeaders(dest) })
  try {
    const response = await request.get('/api/health', { timeout: 30_000 })
    expect(response.status(), 'GET /api/health (¿falta el bypass del Preview protegido?)').toBe(200)
    return await response.json() as Record<string, unknown>
  } finally {
    await request.dispose()
  }
}

export async function openOwnerApi(playwright: Playwright, dest: Destination, credentials: Credentials): Promise<OwnerApi> {
  const request = await playwright.request.newContext({ baseURL: dest.origin, extraHTTPHeaders: apiHeaders(dest) })
  const login = await request.post('/api/auth/login', {
    data: { method: 'email', email: credentials.owner.email, password: credentials.owner.password },
  })
  expect(login.status(), 'login del owner por API').toBe(200)
  const session = authSessionResponseSchema.parse(await login.json())
  expect(session.account.role, 'la cuenta usada para abrir la tienda debe ser owner (define SMOKE_OWNER_*)').toBe('owner')

  const readStaffStore = async () => {
    const response = await request.get('/api/store/staff')
    expect(response.status(), 'GET /api/store/staff').toBe(200)
    return storeDtoSchema.parse(await response.json())
  }
  const readStaffProduct = async (id: string): Promise<StaffProductDto> => {
    const response = await request.get('/api/catalog/staff')
    expect(response.status(), 'GET /api/catalog/staff').toBe(200)
    const product = staffCatalogResponseSchema.parse(await response.json()).products.find((candidate) => candidate.id === id)
    expect(product, `producto de personal ${id} presente en el catálogo`).toBeDefined()
    return product!
  }
  const patchStore = async (patch: UpdateStoreSettingsRequest): Promise<StoreDto> => {
    const response = await request.patch('/api/store/staff', { data: patch })
    expect(response.status(), 'PATCH /api/store/staff').toBe(200)
    return storeDtoSchema.parse(await response.json())
  }
  const patchProduct = async (id: string, patch: UpdateProductRequest): Promise<StaffProductDto> => {
    const response = await request.patch(`/api/catalog/products/${encodeURIComponent(id)}`, { data: patch })
    expect(response.status(), 'PATCH del producto de personal').toBe(200)
    return staffProductDtoSchema.parse(await response.json())
  }
  const patchOverride = async (scheduleOverride: 'auto' | 'open' | 'closed') => {
    const response = await request.patch('/api/store/staff', { data: { scheduleOverride } })
    expect(response.status(), `PATCH /api/store/staff scheduleOverride=${scheduleOverride}`).toBe(200)
    return storeDtoSchema.parse(await response.json())
  }

  return {
    actorId: session.account.id,
    request,
    storeId: (await readStaffStore()).storeId,
    readStaffStore,
    readStaffProduct,
    patchStore,
    patchProduct,
    async restoreInterruptedOverride(runtime) {
      const previous = runtime.override
      if (!previous || previous.restored || (await readStaffStore()).scheduleOverride !== previous.applied) return
      await patchOverride(previous.original as 'auto' | 'open' | 'closed')
      previous.restored = true
      saveRuntime(runtime, 'store-restored')
    },
    async orderAudit(orderId) {
      const response = await request.get(`/api/audit?entity=order&entityId=${encodeURIComponent(orderId)}&limit=50`)
      expect(response.status(), 'GET /api/audit del pedido').toBe(200)
      return auditListResponseSchema.parse(await response.json()).items
    },
    async close() {
      try { await request.post('/api/auth/logout') } finally { await request.dispose() }
    },
  }
}
