import type { StoreRepository } from '../../domain/store/StoreRepository.js'
import type { StoreSettings } from '../../domain/store/StoreSettings.js'
import { staffStoreOf, type StoreActor } from '../../domain/store/storeAccess.js'
import { NotFoundError } from '../../shared/errors.js'

export interface StoreReadDeps {
  store: Pick<StoreRepository, 'findSettings'>
}

/** Configuración de la tienda pública (fijada por el servidor). Sin inicializar: 404, sin valores por defecto. */
export const getStoreSettings = async (deps: StoreReadDeps, storeId: string): Promise<StoreSettings> => {
  const settings = await deps.store.findSettings(storeId)
  if (!settings) throw new NotFoundError('Store', storeId)
  return settings
}

/** Configuración de la tienda del personal autenticado (owner u operator). */
export const getStaffStoreSettings = async (deps: StoreReadDeps, actor: StoreActor): Promise<StoreSettings> =>
  getStoreSettings(deps, staffStoreOf(actor))
