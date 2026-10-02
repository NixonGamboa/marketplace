import { issuesFromZodError, storeSettingsSchema, type StoreSettingsDto } from '../../../../shared/contracts/index.js'
import type { StoreRepository } from '../../domain/store/StoreRepository.js'
import type { StoreSettings } from '../../domain/store/StoreSettings.js'
import type { Clock } from '../../shared/clock.js'
import { ValidationError } from '../../shared/errors.js'
import { STORE_SEED_ID, STORE_SEED_SETTINGS } from './storeSeed.js'

export interface InitializeStoreDeps {
  store: StoreRepository
  clock: Clock
}

export interface InitializeStoreOptions {
  storeId?: string
  /** Ajustes sobre la semilla (p. ej. contacto real de test). Se validan con el contrato. */
  overrides?: Partial<StoreSettingsDto>
}

/**
 * Inicialización idempotente para el seed de servidor (T-16). Inserta la tienda solo si no
 * existe; si ya existe la devuelve intacta: nunca sobrescribe configuración editada.
 */
export const initializeStore = async (
  deps: InitializeStoreDeps,
  { storeId = STORE_SEED_ID, overrides = {} }: InitializeStoreOptions = {},
): Promise<{ created: boolean; settings: StoreSettings }> => {
  const parsed = storeSettingsSchema.safeParse({ ...STORE_SEED_SETTINGS, ...overrides })
  if (!parsed.success) throw new ValidationError('Invalid store seed', issuesFromZodError(parsed.error))

  const now = deps.clock.nowIso()
  const created = await deps.store.insertSettingsIfAbsent({
    ...parsed.data,
    id: storeId,
    version: 1,
    createdAt: now,
    updatedAt: now,
  })
  const settings = await deps.store.findSettings(storeId)
  if (!settings) throw new Error('Store initialization did not persist')
  return { created, settings }
}
