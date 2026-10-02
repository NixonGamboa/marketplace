import type { CatalogRepository } from '../domain/catalog/CatalogRepository.js'
import type { OrdersRepository } from '../domain/orders/OrdersRepository.js'
import type { StoreRepository } from '../domain/store/StoreRepository.js'
import { getConfig } from '../shared/config.js'
import { CatalogRepositoryMemory } from './memory/CatalogRepositoryMemory.js'
import { OrdersRepositoryMemory } from './memory/OrdersRepositoryMemory.js'
import { StoreRepositoryMemory } from './memory/StoreRepositoryMemory.js'

export interface Repositories {
  orders: OrdersRepository
  catalog: CatalogRepository
  store: StoreRepository
}

let cached: Repositories | null = null

export const getRepositories = async (): Promise<Repositories> => {
  const config = getConfig()
  if (cached) return cached

  if (config.DB_DRIVER === 'memory') {
    const store = new StoreRepositoryMemory()
    cached = {
      orders: new OrdersRepositoryMemory(),
      catalog: new CatalogRepositoryMemory((storeId) => store.hasStore(storeId)),
      store,
    }
    return cached
  }

  const { db } = await import('./postgres/client.js')
  const { OrdersRepositoryPostgres } = await import('./postgres/OrdersRepositoryPostgres.js')
  const { CatalogRepositoryPostgres } = await import('./postgres/CatalogRepositoryPostgres.js')
  const { StoreRepositoryPostgres } = await import('./postgres/StoreRepositoryPostgres.js')

  cached = {
    orders: new OrdersRepositoryPostgres(db),
    catalog: new CatalogRepositoryPostgres(db),
    store: new StoreRepositoryPostgres(db),
  }
  return cached
}
