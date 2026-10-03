import { sharedCategories, sharedProducts } from '../../../../shared/catalog/index.js'
import type { BucketKeyer } from '../../domain/auth/ports.js'
import { ORDER_CREATE_BUCKET_SCOPE } from '../../domain/orders/orderAccess.js'
import { DomainError } from '../../shared/errors.js'
import { SEED_CUSTOMERS, SEED_ORDERS, SEED_STAFF, SEED_STORE } from './dataset.js'
import { buildSeedManifest, canonicalJson, sha256Hex } from './manifest.js'
import type { FixtureScope, ResetMeasure, SeedEraser, SeedInspector } from './ports.js'
import { assertDatabaseIdentity, type DatabaseTarget } from './resetGuard.js'

export class ResetRejectedError extends DomainError {
  constructor(public readonly reason: 'SCHEMA_MISSING' | 'BLOCKERS' | 'CONFIRMATION_REQUIRED' | 'CONFIRMATION_MISMATCH') {
    super(`Reset de fixtures rechazado: ${reason}`, 'RESET_REJECTED')
    this.name = 'ResetRejectedError'
  }
}

export interface ResetDeps {
  inspector: SeedInspector
  eraser: SeedEraser
  keys: BucketKeyer
  /** Destino ya validado por `assertResetAllowed`. */
  target: DatabaseTarget
}

export interface ResetOptions {
  includeStore?: boolean
  /** Ejecuta el borrado; sin esto es un dry-run. Exige `confirm`. */
  execute?: boolean
  /** Token que devolvió el dry-run del mismo estado y alcance. */
  confirm?: string | undefined
}

export interface ResetResult {
  mode: 'dry-run' | 'executed'
  target: DatabaseTarget
  datasetVersion: string
  contentHash: string
  includeStore: boolean
  measure: ResetMeasure
  /** Confirmación ligada al preflight: destino, versión del dataset, alcance y filas medidas. */
  confirmationToken: string
  /** Solo tras ejecutar: lo que queda del alcance (debe ser 0 en lo borrado). */
  remaining?: ResetMeasure
}

export const fixtureScope = (keys: BucketKeyer, includeStore: boolean): FixtureScope => ({
  storeId: SEED_STORE,
  orderIds: SEED_ORDERS.map(({ id }) => id),
  productIds: sharedProducts.map(({ id }) => id),
  categoryIds: sharedCategories.map(({ id }) => id),
  accounts: [
    ...SEED_STAFF.map(({ id, role, email, storeId }) => ({ id, role: role as string, email, phone: null, storeId })),
    ...SEED_CUSTOMERS.map(({ id, phone }) => ({ id, role: 'customer', email: null, phone: `57${phone}`, storeId: null })),
  ],
  rateLimitBuckets: SEED_CUSTOMERS.map(({ id }) => keys.key(ORDER_CREATE_BUCKET_SCOPE, id)),
  includeStore,
})

const confirmationFor = (target: DatabaseTarget, includeStore: boolean, measure: ResetMeasure): string => {
  const manifest = buildSeedManifest()
  const digest = sha256Hex(canonicalJson({
    purpose: 'maui-reset-fixtures-v1', target, datasetVersion: manifest.datasetVersion,
    contentHash: manifest.contentHash, includeStore, measure,
  }))
  return `reset-${digest.slice(0, 24)}`
}

const measureOrReject = async (deps: ResetDeps, scope: FixtureScope): Promise<ResetMeasure> => {
  assertDatabaseIdentity(deps.target, await deps.inspector.databaseName())
  const schema = await deps.inspector.schemaStatus()
  if (schema.missing.length > 0) throw new ResetRejectedError('SCHEMA_MISSING')
  return deps.eraser.measure(scope)
}

/**
 * Reset de FIXTURES de test: borra solo las filas del dataset (pedidos, catálogo, cuentas, cuotas e
 * historial de esas entidades) y nunca el resto de la base (p. ej. pedidos legacy) ni el ledger de
 * migraciones. Siempre mide primero; sin `execute` es un dry-run. Ejecutar exige la confirmación del
 * dry-run del MISMO estado: si algo cambió entre uno y otro, el token no coincide y no se borra.
 * Las filas ajenas con IDs del dataset bloquean el reset en vez de borrarse.
 */
export const runReset = async (deps: ResetDeps, options: ResetOptions = {}): Promise<ResetResult> => {
  const includeStore = options.includeStore ?? false
  const scope = fixtureScope(deps.keys, includeStore)
  const measure = await measureOrReject(deps, scope)
  const manifest = buildSeedManifest()
  const base = {
    target: deps.target, datasetVersion: manifest.datasetVersion, contentHash: manifest.contentHash,
    includeStore, measure, confirmationToken: confirmationFor(deps.target, includeStore, measure),
  }
  if (!options.execute) return { mode: 'dry-run', ...base }

  if (measure.blockers.length > 0) throw new ResetRejectedError('BLOCKERS')
  if (!options.confirm) throw new ResetRejectedError('CONFIRMATION_REQUIRED')
  if (options.confirm !== base.confirmationToken) throw new ResetRejectedError('CONFIRMATION_MISMATCH')

  await deps.eraser.erase(scope)
  return { mode: 'executed', ...base, remaining: await deps.eraser.measure(scope) }
}
