import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { match } from 'path-to-regexp'
import { vi } from 'vitest'
import type { Repositories } from '../../src/infra/factory.js'
import { HTTP_ORIGIN, HTTP_SECRET, authRequest, cookiePair, headerOf, mockResponse, statusOf } from '../auth/httpFixture.js'
import { initializeOrderCatalog } from '../orders/creationFixture.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from './pgliteNeon.js'

export const STORE = 'leche-y-miel'
export const FOREIGN_STORE = 'otra-tienda'

const API_ROOT = new URL('../../../api/', import.meta.url)
const handlers: Record<string, () => Promise<{ default: (req: VercelRequest, res: VercelResponse) => Promise<void> | void }>> = {
  'audit': () => import('../../../api/audit.js'),
  'auth/login': () => import('../../../api/auth/login.js'),
  'auth/logout': () => import('../../../api/auth/logout.js'),
  'auth/register': () => import('../../../api/auth/register.js'),
  'auth/session': () => import('../../../api/auth/session.js'),
  'catalog': () => import('../../../api/catalog.js'),
  'health': () => import('../../../api/health.js'),
  'not-found': () => import('../../../api/not-found.js'),
  'orders/index': () => import('../../../api/orders/index.js'),
  'orders/[id]': () => import('../../../api/orders/[id].js'),
  'orders/[id]/status': () => import('../../../api/orders/[id]/status.js'),
  'store': () => import('../../../api/store.js'),
}

const { rewrites } = JSON.parse(readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8')) as {
  rewrites: { source: string; destination: string }[]
}
const compiledRewrites = rewrites.map(route => ({ ...route, matcher: match<Record<string, string>>(route.source, { decode: decodeURIComponent, strict: true }) }))

/**
 * Ruta de un fetch de las apps (`/api/...`) hasta su Function, con el mismo orden que Vercel:
 * primero el filesystem de `api/` y luego los `rewrites` de `vercel.json`, de modo que el path que
 * construyen los adapters, el rewrite y el handler se comprueban juntos.
 */
export function resolveApiRoute(path: string): { handler: string; query: Record<string, string> } {
  const url = new URL(path, HTTP_ORIGIN)
  const query: Record<string, string> = Object.fromEntries(url.searchParams)
  const relative = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '')
  if (url.pathname.startsWith('/api/') && !url.pathname.endsWith('/')) {
    if (existsSync(new URL(`${relative}.ts`, API_ROOT))) return { handler: relative, query }
    if (existsSync(new URL(`${relative}/index.ts`, API_ROOT))) return { handler: `${relative}/index`, query }
  }
  for (const route of compiledRewrites) {
    const matched = route.matcher(url.pathname)
    if (!matched) continue
    const [destinationPath = '', destinationQuery = ''] = route.destination.split('?')
    const params = Object.fromEntries(new URLSearchParams(destinationQuery.replace(/:(\w+)/g, (_, name: string) => encodeURIComponent(matched.params[name] ?? ''))))
    const handler = destinationPath.replace(/^\/api\//, '')
    return { handler, query: { ...query, ...params, ...(handler.includes('[id]') ? { id: matched.params.id ?? '' } : {}) } }
  }
  throw new Error(`Sin Function para ${path}`)
}

export interface WireResponse {
  status: number
  /** Cuerpo tal como lo recibe `response.json()` en el navegador: tras serializar a JSON. */
  body: unknown
  header(name: string): string | undefined
  cookie?: string
}

export interface FetchInit {
  cookie?: string | undefined
  body?: unknown
  headers?: Record<string, string> | undefined
}

export interface Actor {
  id: string
  cookie: string
}

export interface HttpWorld {
  embedded: EmbeddedPostgres
  repositories: Repositories
  actors: Record<'customer' | 'other' | 'owner' | 'operator' | 'foreign', Actor>
  fetch(method: string, path: string, init?: FetchInit): Promise<WireResponse>
  /** `POST /api/orders` como cliente real, con clave de idempotencia (aleatoria si no se indica). */
  placeOrder(actor: Actor, body?: Record<string, unknown>, key?: string): Promise<WireResponse>
  close(): Promise<void>
}

export const pickupOrderBody = (actor: Actor, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  userId: actor.id, customerName: 'Ana Prueba', customerPhone: '3001234567',
  deliveryType: 'pickup', deliveryData: {}, substitutionPreference: 'similar',
  items: [{ id: 'prod_leche', qty: 2 }, { id: 'prod_carne', qty: 1, kilosRequested: 1 }],
  ...overrides,
})

/**
 * Mundo HTTP compartido: handlers reales, sesiones scrypt/JWT reales, rewrites de `vercel.json` y
 * PostgreSQL embebido con todas las migraciones sobre el transporte Neon redirigido. Las cuentas
 * (cliente, segundo cliente, owner, operator y owner de otra tienda) se crean por los casos de uso
 * de producción. No contacta Neon ni Vercel.
 */
export async function startHttpWorld(): Promise<HttpWorld> {
  vi.resetModules()
  for (const [key, value] of Object.entries({
    APP_ENV: 'local', NODE_ENV: 'test', DB_DRIVER: 'postgres',
    DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture', AUTH_JWT_SECRET: HTTP_SECRET, AUTH_ORIGIN: HTTP_ORIGIN,
  })) vi.stubEnv(key, value)
  vi.stubEnv('VERCEL_ENV', undefined)
  const embedded = await startEmbeddedPostgres()
  const { getRepositories } = await import('../../src/infra/factory.js')
  const { getAuthRuntime } = await import('../../src/infra/auth/factory.js')
  const repositories = await getRepositories()
  const { deps } = await getAuthRuntime()
  await initializeOrderCatalog({ ...repositories, clock: deps.clock })

  const fetch: HttpWorld['fetch'] = async (method, path, init = {}) => {
    const { handler, query } = resolveApiRoute(path)
    const load = handlers[handler]
    if (!load) throw new Error(`Handler sin cargar en la prueba: ${handler}`)
    const { default: run } = await load()
    const mutation = method !== 'GET' && method !== 'HEAD'
    const body = init.body === undefined ? undefined : JSON.parse(JSON.stringify(init.body)) as unknown
    const req = Object.assign(authRequest({
      method, body,
      headers: { cookie: init.cookie, origin: mutation ? HTTP_ORIGIN : undefined, ...(body === undefined ? { 'content-type': undefined } : {}), ...init.headers },
    }), { query })
    const res = mockResponse()
    await run(req, res as unknown as VercelResponse)
    const json = res.json.mock.calls[0]?.[0]
    const setCookie = headerOf(res, 'Set-Cookie')
    return {
      status: statusOf(res),
      body: json === undefined ? null : JSON.parse(JSON.stringify(json)) as unknown,
      header: name => headerOf(res, name),
      ...(setCookie && !setCookie.includes('Max-Age=0') ? { cookie: cookiePair(res) } : {}),
    }
  }

  const actors = {} as HttpWorld['actors']
  const registerCustomer = async (name: string, phone: string): Promise<Actor> => {
    const response = await fetch('POST', '/api/auth/register', { body: { name, phone, password: 'clave-cliente-segura' } })
    if (response.status !== 201 || !response.cookie) throw new Error(`Registro de fixture falló: ${response.status}`)
    return { id: (response.body as { account: { id: string } }).account.id, cookie: response.cookie }
  }
  actors.customer = await registerCustomer('Cliente', '3001234567')
  actors.other = await registerCustomer('Otro cliente', '3009876543')
  const { createStaffAccount } = await import('../../src/usecases/auth/createStaffAccount.js')
  for (const role of ['owner', 'operator', 'foreign'] as const) {
    const email = `${role}@contratos.test`, password = 'clave-personal-segura'
    const account = await createStaffAccount(deps, {
      name: 'Persona', role: role === 'operator' ? 'operator' : 'owner', storeId: role === 'foreign' ? FOREIGN_STORE : STORE, email, password,
    })
    const login = await fetch('POST', '/api/auth/login', { body: { method: 'email', email, password } })
    if (login.status !== 200 || !login.cookie) throw new Error(`Login de fixture falló: ${login.status}`)
    actors[role] = { id: account.id, cookie: login.cookie }
  }

  return {
    embedded, repositories, actors, fetch,
    placeOrder: (actor, body = {}, key = randomUUID()) => fetch('POST', '/api/orders', {
      cookie: actor.cookie, body: pickupOrderBody(actor, body), headers: { 'idempotency-key': key },
    }),
    async close() {
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      await embedded.close()
    },
  }
}
