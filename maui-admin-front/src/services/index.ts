// Punto único de exportación de los repositories.
// El swap a backend real se hace flipping `VITE_DEMO_MODE=false`.

import {
  mockAuditRepository,
  realAuditRepository,
  type AuditRepository,
} from './mockAuditRepository'
import {
  mockOrderRepository,
  realOrderRepository,
  type OrderRepository,
} from './mockOrderRepository'
import {
  mockAuthRepository,
  realAuthRepository,
  type AuthRepository,
} from './mockAuthRepository'
import {
  mockCatalogRepository,
  realCatalogRepository,
  type CatalogRepository,
} from './mockCatalogRepository'
import {
  mockMerchantRepository,
  realMerchantRepository,
  type MerchantRepository,
} from './mockMerchantRepository'
import {
  mockStoreStatusRepository,
  realStoreStatusRepository,
  type StoreStatusRepository,
} from './mockStoreStatusRepository'

const isDemo = (import.meta.env.VITE_DEMO_MODE as string | undefined) !== 'false'

export const orderRepo: OrderRepository           = isDemo ? mockOrderRepository       : realOrderRepository
export const catalogRepo: CatalogRepository       = isDemo ? mockCatalogRepository     : realCatalogRepository
export const authRepo: AuthRepository             = isDemo ? mockAuthRepository        : realAuthRepository
export const merchantRepo: MerchantRepository     = isDemo ? mockMerchantRepository    : realMerchantRepository
export const storeStatusRepo: StoreStatusRepository = isDemo ? mockStoreStatusRepository : realStoreStatusRepository
export const auditRepo: AuditRepository           = isDemo ? mockAuditRepository       : realAuditRepository

export type {
  AuditRepository,
  AuthRepository,
  CatalogRepository,
  MerchantRepository,
  OrderRepository,
  StoreStatusRepository,
}
