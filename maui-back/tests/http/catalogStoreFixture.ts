import type { VercelRequest, VercelResponse } from '@vercel/node'
import { expect } from 'vitest'
import { createStaffAccount } from '../../src/usecases/auth/createStaffAccount.js'
import { authRequest, bodyOf, cookiePair, mockResponse, statusOf, type MockResponse } from '../auth/httpFixture.js'

/**
 * Mundo HTTP compartido por las pruebas de `api/catalog.ts` y `api/store.ts`. Usa los handlers
 * reales, scrypt/JWT reales y el adapter que decida `DB_DRIVER` (memory o Postgres embebido).
 * Debe llamarse después de fijar el entorno y de `vi.resetModules()`.
 */
const handlers = {
  register: () => import('../../../api/auth/register.js'),
  login: () => import('../../../api/auth/login.js'),
  catalog: () => import('../../../api/catalog.js'),
  store: () => import('../../../api/store.js'),
}

export async function call(name: keyof typeof handlers, req: VercelRequest): Promise<MockResponse> {
  const { default: handler } = await handlers[name]()
  const res = mockResponse()
  await handler(req, res as unknown as VercelResponse)
  return res
}

export interface OperationRequest {
  method?: string
  /** Query que fija el rewrite de `vercel.json` (`op`, `id`). */
  query?: Record<string, string | string[]>
  cookie?: string | undefined
  body?: unknown
  headers?: Record<string, string | undefined>
}

export const operationRequest = ({ method = 'GET', query = {}, cookie, body, headers }: OperationRequest = {}): VercelRequest => {
  const read = method === 'GET' || method === 'DELETE'
  const req = authRequest({
    method,
    body,
    headers: { cookie, ...(read && body === undefined ? { 'content-type': undefined } : {}), ...headers },
  })
  return Object.assign(req, { query })
}

export interface Actor {
  id: string
  cookie: string
}

export interface World {
  customer: Actor
  owner: Actor
  operator: Actor
  foreignOwner: Actor
}

async function registerCustomer(): Promise<Actor> {
  const res = await call('register', authRequest({ body: { name: 'Ana Pérez', phone: '300 123 4567', password: 'clave-cliente-segura' } }))
  expect(statusOf(res)).toBe(201)
  return { id: (bodyOf(res) as { account: { id: string } }).account.id, cookie: cookiePair(res) }
}

async function staff(role: 'owner' | 'operator', email: string, storeId: string): Promise<Actor> {
  const { getAuthRuntime } = await import('../../src/infra/auth/factory.js')
  const { deps } = await getAuthRuntime()
  const password = 'clave-staff-segura-1'
  const account = await createStaffAccount(deps, { role, name: 'Personal Maui', email, storeId, password })
  const res = await call('login', authRequest({ body: { method: 'email', email, password } }))
  expect(statusOf(res)).toBe(200)
  return { id: account.id, cookie: cookiePair(res) }
}

/** Cuentas reales y tienda/catálogo inicializados con los casos de uso del seed de servidor. */
export async function setupWorld(): Promise<World> {
  const { getRepositories } = await import('../../src/infra/factory.js')
  const { initializeStore } = await import('../../src/usecases/store/initializeStore.js')
  const { seedCatalogBaseline } = await import('../../src/usecases/catalog/seedCatalogBaseline.js')
  const { systemClock } = await import('../../src/shared/clock.js')
  const { store, catalog } = await getRepositories()
  await initializeStore({ store, clock: systemClock })
  await seedCatalogBaseline({ catalog, clock: systemClock }, 'leche-y-miel')

  return {
    customer: await registerCustomer(),
    owner: await staff('owner', 'duena@maui.test', 'leche-y-miel'),
    operator: await staff('operator', 'operador@maui.test', 'leche-y-miel'),
    foreignOwner: await staff('owner', 'ajena@otra.test', 'otra-tienda'),
  }
}
