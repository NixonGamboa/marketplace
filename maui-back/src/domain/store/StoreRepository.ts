import type { AuditWrite } from '../audit/AuditRepository.js'
import type { StoreSettings } from './StoreSettings.js'

export interface StoreRepository {
  findSettings(storeId: string): Promise<StoreSettings | null>
  /** Inicialización idempotente: inserta solo si la tienda no existe y nunca sobrescribe. */
  insertSettingsIfAbsent(settings: StoreSettings): Promise<boolean>
  /** Escribe solo si la versión persistida sigue siendo `expectedVersion`; `null` si cambió o no existe. */
  updateSettings(settings: StoreSettings, expectedVersion: number, audit?: AuditWrite): Promise<StoreSettings | null>
}
