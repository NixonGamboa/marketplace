import { randomBytes } from 'node:crypto'
import { AuthRepositoryPostgres } from '../../src/infra/postgres/AuthRepositoryPostgres.js'
import { CatalogRepositoryPostgres } from '../../src/infra/postgres/CatalogRepositoryPostgres.js'
import { OrdersRepositoryPostgres } from '../../src/infra/postgres/OrdersRepositoryPostgres.js'
import { SeedStorePostgres } from '../../src/infra/postgres/SeedStorePostgres.js'
import { StoreRepositoryPostgres } from '../../src/infra/postgres/StoreRepositoryPostgres.js'
import { HmacBucketKeyer, RandomAuthIds } from '../../src/infra/auth/randomIds.js'
import { ScryptPasswordHasher } from '../../src/infra/auth/ScryptPasswordHasher.js'
import type { SeedCredentials, SeedDeps } from '../../src/usecases/seed/runSeed.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from '../integration/pgliteNeon.js'

/** Contraseñas de fixture generadas por ejecución: ningún secreto fijo en el repositorio. */
export const testCredentials = (): Required<SeedCredentials> => ({
  owner: `po-${randomBytes(9).toString('base64url')}`,
  operator: `op-${randomBytes(9).toString('base64url')}`,
  customer: `cu-${randomBytes(9).toString('base64url')}`,
})

export interface SeedWorld {
  embedded: EmbeddedPostgres
  deps: SeedDeps
  store: SeedStorePostgres
  keys: HmacBucketKeyer
  hasher: ScryptPasswordHasher
  close(): Promise<void>
}

/** PostgreSQL embebido con todas las migraciones y los adapters de producción. */
export async function startSeedWorld(): Promise<SeedWorld> {
  const embedded = await startEmbeddedPostgres()
  const { db } = embedded
  const keys = new HmacBucketKeyer(randomBytes(32))
  const hasher = new ScryptPasswordHasher()
  const store = new SeedStorePostgres(db)
  return {
    embedded,
    store,
    keys,
    hasher,
    deps: {
      inspector: store,
      repositories: {
        store: new StoreRepositoryPostgres(db),
        catalog: new CatalogRepositoryPostgres(db),
        orders: new OrdersRepositoryPostgres(db),
      },
      auth: { repository: new AuthRepositoryPostgres(db), hasher, ids: new RandomAuthIds(), keys },
    },
    close: () => embedded.close(),
  }
}

export const countRows = async (world: SeedWorld, table: string): Promise<number> =>
  Number((await world.embedded.pg.query<{ n: string }>(`select count(*)::text as n from ${table}`)).rows[0]?.n)

/** Volcado canónico del estado sembrado, sin material aleatorio (hashes, IDs/fechas de audit). */
export async function dumpSeededState(world: SeedWorld): Promise<Record<string, unknown[]>> {
  const query = async (text: string): Promise<unknown[]> => (await world.embedded.pg.query(text)).rows
  return {
    stores: await query('select * from stores order by id'),
    categories: await query('select * from catalog_categories order by id'),
    products: await query('select * from catalog_products order by id'),
    accounts: await query('select id, role, name, phone, email, store_id, status, created_at, updated_at from auth_accounts order by id'),
    orders: await query('select * from orders order by id'),
    claims: await query('select customer_id, store_id, key_hash, fingerprint, order_id, snapshot from order_creations order by order_id'),
    audit: await query(`select store_id, entity, entity_id, action, actor_kind, actor_id, metadata from audit_events
      order by entity, entity_id, (metadata->>'version')::int nulls first, action`),
  }
}
