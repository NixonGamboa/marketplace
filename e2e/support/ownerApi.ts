/**
 * Cliente API del owner de fixtures para preparar el escenario: comprobar el destino, abrir la tienda
 * si hace falta (con restauración garantizada) y leer auditoría. Usa el mismo servidor y la misma
 * autenticación por cookie que las apps; no hay atajos ni mocks.
 */
import { expect, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test'
import { authSessionResponseSchema, auditListResponseSchema, storeDtoSchema, type StoreDto } from '../../shared/contracts/index.js'
import { apiHeaders } from './actors.js'
import type { Credentials, Destination } from './env.js'
import { readPreviousRuntime, saveRuntime, type RuntimeRecord } from './runtime.js'

type Playwright = PlaywrightWorkerArgs['playwright']

export interface OwnerApi {
  request: APIRequestContext
  storeId: string
  readStaffStore(): Promise<StoreDto>
  /** Abre la tienda solo si no recibe pedidos; devuelve la restauración (idempotente). */
  ensureStoreOpen(runtime: RuntimeRecord): Promise<() => Promise<void>>
  orderAudit(orderId: string): Promise<{ action: string }[]>
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
  const patchOverride = async (scheduleOverride: 'auto' | 'open' | 'closed') => {
    const response = await request.patch('/api/store/staff', { data: { scheduleOverride } })
    expect(response.status(), `PATCH /api/store/staff scheduleOverride=${scheduleOverride}`).toBe(200)
    return storeDtoSchema.parse(await response.json())
  }

  return {
    request,
    storeId: (await readStaffStore()).storeId,
    readStaffStore,
    async ensureStoreOpen(runtime) {
      const previous = readPreviousRuntime()?.override
      let store = await readStaffStore()
      // Una corrida anterior interrumpida pudo dejar el override propio aplicado: se devuelve antes de seguir.
      if (previous && !previous.restored && store.scheduleOverride === previous.applied) {
        store = await patchOverride(previous.original as 'auto' | 'open' | 'closed')
      }
      if (store.availability.isOpen && store.availability.acceptsPickup) return async () => undefined
      runtime.override = { original: store.scheduleOverride, applied: 'open', restored: false }
      saveRuntime(runtime, 'store-override')
      const opened = await patchOverride('open')
      expect(opened.availability.isOpen, 'la tienda debe quedar abierta tras el override').toBe(true)
      return async () => {
        if (!runtime.override || runtime.override.restored) return
        await patchOverride(runtime.override.original as 'auto' | 'open' | 'closed')
        runtime.override.restored = true
        saveRuntime(runtime, 'store-restored')
      }
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
