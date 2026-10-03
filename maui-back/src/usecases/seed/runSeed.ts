import { DomainError } from '../../shared/errors.js'
import type { Clock } from '../../shared/clock.js'
import type { OrderActor } from '../../domain/orders/orderAccess.js'
import type { CatalogRepository } from '../../domain/catalog/CatalogRepository.js'
import type { OrdersRepository } from '../../domain/orders/OrdersRepository.js'
import type { StoreRepository } from '../../domain/store/StoreRepository.js'
import type { AuthDeps } from '../auth/deps.js'
import { createCustomerAccount } from '../auth/createCustomerAccount.js'
import { createStaffAccount } from '../auth/createStaffAccount.js'
import { seedCatalogBaseline, type CatalogSeedResult } from '../catalog/seedCatalogBaseline.js'
import { createOrder } from '../orders/createOrder.js'
import { updateOrderItems } from '../orders/updateOrderItems.js'
import { updateOrderStatus } from '../orders/updateOrderStatus.js'
import { initializeStore } from '../store/initializeStore.js'
import {
  SEED_CUSTOMERS,
  SEED_EPOCH,
  SEED_ORDERS,
  SEED_STAFF,
  SEED_STORE,
  expectedStatusAfter,
  orderRequestFor,
  seedCustomerOf,
  seedOrderKey,
  stepInstant,
  type SeedOrderSpec,
  type SeedStaffKey,
} from './dataset.js'
import type { SeedInspector } from './ports.js'
import { SeedPreflightError, inspectSeed, type SeedPreflight } from './preflight.js'

export interface SeedDeps {
  inspector: SeedInspector
  repositories: { store: StoreRepository; catalog: CatalogRepository; orders: OrdersRepository }
  auth: Pick<AuthDeps, 'repository' | 'hasher' | 'ids' | 'keys'>
}

/** Contraseñas de las cuentas de test, solo para crear las que falten. Nunca se registran. */
export interface SeedCredentials {
  owner?: string
  operator?: string
  customer?: string
}

/** Variables de entorno que cargan cada credencial (el CLI las lee; solo se informa el nombre). */
export const SEED_CREDENTIAL_ENV = {
  owner: 'SEED_OWNER_PASSWORD',
  operator: 'SEED_OPERATOR_PASSWORD',
  customer: 'SEED_CUSTOMER_PASSWORD',
} as const

export class SeedCredentialsError extends DomainError {
  constructor(public readonly variables: readonly string[]) {
    super(`Faltan credenciales para crear cuentas de test: ${variables.join(', ')}`, 'SEED_CREDENTIALS_MISSING')
    this.name = 'SeedCredentialsError'
  }
}

export type SeedOrderOutcome = 'created' | 'advanced' | 'unchanged' | 'preserved' | 'diverged'

export interface SeedReport {
  datasetVersion: string
  contentHash: string
  store: 'created' | 'present'
  catalog: CatalogSeedResult
  accounts: { id: string; outcome: 'created' | 'verified' }[]
  orders: { id: string; outcome: SeedOrderOutcome; status: string; version: number }[]
}

const fixedClock = (iso: string): Clock => ({ now: () => new Date(iso), nowIso: () => iso })

const staffActors = new Map<SeedStaffKey, OrderActor>(
  SEED_STAFF.map(spec => [spec.key, { id: spec.id, role: spec.role, storeId: spec.storeId }]),
)

const staffActor = (key: SeedStaffKey): OrderActor => {
  const actor = staffActors.get(key)
  if (!actor) throw new Error(`Actor de seed desconocido: ${key}`)
  return actor
}

const assertCredentials = (toCreate: readonly string[], credentials: SeedCredentials): void => {
  const missing = new Set<string>()
  for (const spec of SEED_STAFF) {
    if (toCreate.includes(spec.id) && !credentials[spec.key]) missing.add(SEED_CREDENTIAL_ENV[spec.key])
  }
  for (const spec of SEED_CUSTOMERS) {
    if (toCreate.includes(spec.id) && !credentials.customer) missing.add(SEED_CREDENTIAL_ENV.customer)
  }
  if (missing.size > 0) throw new SeedCredentialsError([...missing].sort())
}

const ensureAccounts = async (
  auth: SeedDeps['auth'],
  toCreate: readonly string[],
  credentials: SeedCredentials,
): Promise<SeedReport['accounts']> => {
  const clock = fixedClock(SEED_EPOCH)
  const report: SeedReport['accounts'] = []
  for (const spec of SEED_STAFF) {
    if (!toCreate.includes(spec.id)) {
      report.push({ id: spec.id, outcome: 'verified' })
      continue
    }
    await createStaffAccount({ ...auth, clock, ids: { accountId: () => spec.id, sessionId: auth.ids.sessionId } }, {
      role: spec.role, name: spec.name, email: spec.email, storeId: spec.storeId,
      password: credentials[spec.key] ?? '',
    })
    report.push({ id: spec.id, outcome: 'created' })
  }
  for (const spec of SEED_CUSTOMERS) {
    if (!toCreate.includes(spec.id)) {
      report.push({ id: spec.id, outcome: 'verified' })
      continue
    }
    await createCustomerAccount({ ...auth, clock, ids: { accountId: () => spec.id, sessionId: auth.ids.sessionId } }, {
      name: spec.name, phone: spec.phone, password: credentials.customer ?? '',
    })
    report.push({ id: spec.id, outcome: 'created' })
  }
  return report
}

/**
 * Crea el pedido (si falta) por `createOrder` y aplica los pasos pendientes por los casos de uso
 * de T-12, con relojes fijos y las cuentas server como actores. Una repetición reanuda desde la
 * versión persistida: un pedido ya avanzado o editado por el personal no se toca.
 */
const ensureOrder = async (
  deps: SeedDeps,
  spec: SeedOrderSpec,
  create: boolean,
): Promise<SeedReport['orders'][number]> => {
  const { orders, catalog, store } = deps.repositories
  const customer = seedCustomerOf(spec.customer)
  if (create) {
    await createOrder(
      { orders, catalog, store, keys: deps.auth.keys, clock: fixedClock(spec.createdAt), newOrderId: () => spec.id },
      { id: customer.id, role: 'customer', storeId: null },
      orderRequestFor(spec, customer.id),
      { storeId: SEED_STORE },
      seedOrderKey(spec),
    )
  }
  let current = await orders.findById(spec.id)
  if (!current) throw new Error(`El pedido ${spec.id} no quedó persistido`)
  const startedAt = current.version - 1
  const report = (outcome: SeedOrderOutcome): SeedReport['orders'][number] =>
    ({ id: spec.id, outcome, status: current?.status ?? 'unknown', version: current?.version ?? 0 })

  if (startedAt > spec.steps.length || current.status !== expectedStatusAfter(spec, startedAt)) return report('preserved')
  if (startedAt === spec.steps.length) return report(create ? 'created' : 'unchanged')

  try {
    for (let index = startedAt; index < spec.steps.length; index += 1) {
      const step = spec.steps[index]
      if (!step || !current) break
      const changeDeps = { orders, catalog, clock: fixedClock(stepInstant(spec, index)) }
      const actor = staffActor(step.actor)
      current = step.action.kind === 'status'
        ? await updateOrderStatus(changeDeps, actor, spec.id, {
          status: step.action.status, expectedVersion: current.version,
          ...(step.action.reason !== undefined ? { reason: step.action.reason } : {}),
        })
        : await updateOrderItems(changeDeps, actor, spec.id, { expectedVersion: current.version, changes: step.action.changes })
    }
  } catch (error) {
    // Un pedido recién creado debe completar su guion: ahí un rechazo es un defecto, no una edición.
    if (create || !(error instanceof DomainError)) throw error
    return report('diverged')
  }
  return report(create ? 'created' : 'advanced')
}

/**
 * Seed de servidor de test (T-16): tienda, catálogo, cuentas y pedidos por los casos de uso reales.
 * Primero el preflight de solo lectura (aborta sin escribir ante colisiones o esquema ausente) y,
 * después, escrituras idempotentes que nunca sobrescriben ediciones: tienda y catálogo `IfAbsent`,
 * cuentas existentes solo verificadas (sin reset de contraseña ni cambio de rol), pedidos por
 * claim de idempotencia. Se puede repetir o reanudar tras una interrupción.
 */
export const runSeed = async (
  deps: SeedDeps,
  credentials: SeedCredentials = {},
): Promise<{ preflight: SeedPreflight; report: SeedReport }> => {
  const preflight = await inspectSeed(deps.inspector)
  if (preflight.conflicts.length > 0) throw new SeedPreflightError(preflight.conflicts)
  assertCredentials(preflight.plan.accountsToCreate, credentials)

  const seedClock = fixedClock(SEED_EPOCH)
  const { created } = await initializeStore({ store: deps.repositories.store, clock: seedClock }, { storeId: SEED_STORE })
  const catalog = await seedCatalogBaseline({ catalog: deps.repositories.catalog, clock: seedClock }, SEED_STORE)
  const accounts = await ensureAccounts(deps.auth, preflight.plan.accountsToCreate, credentials)

  const orders: SeedReport['orders'] = []
  for (const spec of SEED_ORDERS) {
    orders.push(await ensureOrder(deps, spec, preflight.plan.ordersToCreate.includes(spec.id)))
  }
  return {
    preflight,
    report: {
      datasetVersion: preflight.datasetVersion,
      contentHash: preflight.contentHash,
      store: created ? 'created' : 'present',
      catalog,
      accounts,
      orders,
    },
  }
}
