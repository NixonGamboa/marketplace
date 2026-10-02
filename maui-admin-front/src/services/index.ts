// Punto único de exportación de los repositories.
// `VITE_DEMO_MODE=false` selecciona los repositories reales (API same-origin con cookie de sesión).
// En modo real, las capacidades sin endpoint (transiciones, pesos, cancelación, auditoría) fallan
// con `CapabilityUnavailableError`; nunca se degradan a los mocks.

import { mockAuditRepository, type AuditRepository } from './mockAuditRepository'
import { mockOrderRepository, type OrderRepository } from './mockOrderRepository'
import { mockAuthRepository, type AuthRepository } from './mockAuthRepository'
import { mockCatalogRepository, type CatalogRepository } from './mockCatalogRepository'
import { mockMerchantRepository, type MerchantRepository } from './mockMerchantRepository'
import { mockStoreStatusRepository, type StoreStatusRepository } from './mockStoreStatusRepository'
import { realAuditRepository } from './realAuditRepository'
import { realAuthRepository } from './realAuthRepository'
import { realCatalogRepository } from './realCatalogRepository'
import { realMerchantRepository } from './realMerchantRepository'
import { realOrderRepository } from './realOrderRepository'
import { realStoreStatusRepository } from './realStoreStatusRepository'

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
