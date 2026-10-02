import { auditVersion, type AuditWrite } from '../../domain/audit/AuditRepository.js'
import { AuditRepositoryMemory } from './AuditRepositoryMemory.js'
import type { StoreRepository } from '../../domain/store/StoreRepository.js'
import type { StoreSettings } from '../../domain/store/StoreSettings.js'

/** Adapter en memoria con la misma semántica condicional que Postgres. Solo tests/dev local. */
export class StoreRepositoryMemory implements StoreRepository {
  constructor(private readonly audit = new AuditRepositoryMemory()) {}
  private readonly stores = new Map<string, StoreSettings>()

  async findSettings(storeId: string): Promise<StoreSettings | null> {
    const found = this.stores.get(storeId)
    return found ? structuredClone(found) : null
  }

  async insertSettingsIfAbsent(settings: StoreSettings): Promise<boolean> {
    if (this.stores.has(settings.id)) return false
    this.audit.append('store', 'created', settings.id, settings.id, auditVersion(undefined, settings.version, false))
    this.stores.set(settings.id, structuredClone(settings))
    return true
  }

  async updateSettings(settings: StoreSettings, expectedVersion: number, audit?: AuditWrite): Promise<StoreSettings | null> {
    if (this.stores.get(settings.id)?.version !== expectedVersion) return null
    this.audit.append('store', 'updated', settings.id, settings.id, auditVersion(audit, settings.version, true))
    this.stores.set(settings.id, structuredClone(settings))
    return structuredClone(settings)
  }

  hasStore(storeId: string): boolean {
    return this.stores.has(storeId)
  }
}
