import type { AuditRepository } from '../domain/audit/AuditRepository.js'
import { AuditRepositoryMemory } from './memory/AuditRepositoryMemory.js'
import type { CatalogRepository } from '../domain/catalog/CatalogRepository.js'
import type { OrdersRepository } from '../domain/orders/OrdersRepository.js'
import type { StoreRepository } from '../domain/store/StoreRepository.js'
import { getConfig } from '../shared/config.js'
import { CatalogRepositoryMemory } from './memory/CatalogRepositoryMemory.js'
import { OrdersRepositoryMemory } from './memory/OrdersRepositoryMemory.js'
import { StoreRepositoryMemory } from './memory/StoreRepositoryMemory.js'

export interface Repositories {
  audit: AuditRepository
  orders: OrdersRepository
  catalog: CatalogRepository
  store: StoreRepository
}

let cached: Repositories | null = null

export const getRepositories = async (): Promise<Repositories> => {
  const config = getConfig()
  if (cached) return cached

  if (config.DB_DRIVER === 'memory') {
    const audit = new AuditRepositoryMemory()
    const store = new StoreRepositoryMemory(audit)
    cached = {
      audit,
      orders: new OrdersRepositoryMemory(audit),
      catalog: new CatalogRepositoryMemory((storeId) => store.hasStore(storeId), audit),
      store,
    }
    return cached
  }

  const { AuditRepositoryPostgres } = await import('./postgres/AuditRepositoryPostgres.js')
  const { db } = await import('./postgres/client.js')
  const { OrdersRepositoryPostgres } = await import('./postgres/OrdersRepositoryPostgres.js')
  const { CatalogRepositoryPostgres } = await import('./postgres/CatalogRepositoryPostgres.js')
  const { StoreRepositoryPostgres } = await import('./postgres/StoreRepositoryPostgres.js')

  cached = {
    audit: new AuditRepositoryPostgres(db),
    orders: new OrdersRepositoryPostgres(db),
    catalog: new CatalogRepositoryPostgres(db),
    store: new StoreRepositoryPostgres(db),
  }
  return cached
}
