import type { OrdersRepository } from '../domain/orders/OrdersRepository.js'
import { getConfig } from '../shared/config.js'
import { OrdersRepositoryMemory } from './memory/OrdersRepositoryMemory.js'

let cached: { orders: OrdersRepository } | null = null

export const getRepositories = async (): Promise<{ orders: OrdersRepository }> => {
  const config = getConfig()
  if (cached) return cached

  if (config.DB_DRIVER === 'memory') {
    cached = { orders: new OrdersRepositoryMemory() }
    return cached
  }

  const { db } = await import('./postgres/client.js')
  const { OrdersRepositoryPostgres } = await import('./postgres/OrdersRepositoryPostgres.js')

  cached = { orders: new OrdersRepositoryPostgres(db) }
  return cached
}
