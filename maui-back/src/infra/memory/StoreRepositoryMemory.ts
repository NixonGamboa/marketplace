import type { StoreRepository } from '../../domain/store/StoreRepository.js'
import type { StoreSettings } from '../../domain/store/StoreSettings.js'

/** Adapter en memoria con la misma semántica condicional que Postgres. Solo tests/dev local. */
export class StoreRepositoryMemory implements StoreRepository {
  private readonly stores = new Map<string, StoreSettings>()

  async findSettings(storeId: string): Promise<StoreSettings | null> {
    const found = this.stores.get(storeId)
    return found ? structuredClone(found) : null
  }

  async insertSettingsIfAbsent(settings: StoreSettings): Promise<boolean> {
    if (this.stores.has(settings.id)) return false
    this.stores.set(settings.id, structuredClone(settings))
    return true
  }

  async updateSettings(settings: StoreSettings, expectedVersion: number): Promise<StoreSettings | null> {
    if (this.stores.get(settings.id)?.version !== expectedVersion) return null
    this.stores.set(settings.id, structuredClone(settings))
    return structuredClone(settings)
  }

  hasStore(storeId: string): boolean {
    return this.stores.has(storeId)
  }
}
