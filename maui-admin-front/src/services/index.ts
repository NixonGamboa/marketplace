// Punto único de exportación de los repositories.
// `VITE_DEMO_MODE=false` selecciona los repositories reales (API same-origin con cookie de sesión).
// En modo real no hay respaldo local: un fallo del servidor se informa, nunca se degrada a los mocks.

import type { Session } from '@/types/auth'
import { mockAuditRepository, type AuditRepository } from './mockAuditRepository'
import { demoOrderPageSource, realOrderPageSource, type OrderPageSource } from './orderPageSource'
import { mockOrderRepository, type OrderRepository } from './mockOrderRepository'
import { mockAuthRepository, type AuthRepository } from './mockAuthRepository'
import { mockCatalogRepository, type CatalogRepository } from './mockCatalogRepository'
import { mockMerchantRepository, type MerchantRepository } from './mockMerchantRepository'
import { mockStoreStatusRepository, type StoreStatusRepository } from './mockStoreStatusRepository'
import { realAuditRepository, type RealAuditRepository } from './realAuditRepository'
import { realAuthRepository } from './realAuthRepository'
import { realCatalogRepository } from './realCatalogRepository'
import { realMerchantRepository } from './realMerchantRepository'
import { realOrderRepository, type RealOrderRepository } from './realOrderRepository'
import { realStoreStatusRepository } from './realStoreStatusRepository'

const isDemo = (import.meta.env.VITE_DEMO_MODE as string | undefined) !== 'false'

/** `true` salvo `VITE_DEMO_MODE=false`: las pantallas lo usan para ocultar lo exclusivo del demo. */
export const isDemoMode: boolean = isDemo

export const orderRepo: OrderRepository           = isDemo ? mockOrderRepository       : realOrderRepository
export const catalogRepo: CatalogRepository       = isDemo ? mockCatalogRepository     : realCatalogRepository
export const authRepo: AuthRepository             = isDemo ? mockAuthRepository        : realAuthRepository
/** Sesión vigente al abrir el panel: el demo la lee del almacenamiento local; el real la consulta al servidor. */
export const restoreSession = (signal?: AbortSignal): Promise<Session | null> =>
  isDemo ? Promise.resolve(mockAuthRepository.getSession()) : realAuthRepository.me(signal ? { signal } : undefined)
export const merchantRepo: MerchantRepository     = isDemo ? mockMerchantRepository    : realMerchantRepository
export const storeStatusRepo: StoreStatusRepository = isDemo ? mockStoreStatusRepository : realStoreStatusRepository
export const orderPages: OrderPageSource         = isDemo ? demoOrderPageSource(mockOrderRepository) : realOrderPageSource(realOrderRepository)

/** Log local del demo. En modo real la auditoría vive en el servidor: usar `serverAuditRepo`. */
export const auditRepo: AuditRepository           = mockAuditRepository
/** Auditoría persistente del servidor (solo owner); la UI real nunca escribe eventos. */
export const serverAuditRepo: RealAuditRepository = realAuditRepository
/** Operaciones exclusivas del servidor (cambio de ítems con versión); solo se usan cuando `!isDemoMode`. */
export const serverOrderRepo: RealOrderRepository = realOrderRepository

export type {
  AuditRepository,
  AuthRepository,
  CatalogRepository,
  MerchantRepository,
  OrderRepository,
  StoreStatusRepository,
}
