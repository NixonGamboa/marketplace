import { apiClient, type ApiClient } from './http/apiClient'
import { storeStatusFrom } from './real/adapters'
import { CapabilityUnavailableError } from './real/capabilityUnavailable'
import { fetchStaffStore, patchStaffStore } from './real/staffStoreApi'
import type { StoreStatusRepository } from './mockStoreStatusRepository'

export const createRealStoreStatusRepository = (client: ApiClient = apiClient): StoreStatusRepository => ({
  async get() {
    return storeStatusFrom(await fetchStaffStore(client))
  },

  async setOverride(override) {
    return storeStatusFrom(await patchStaffStore(client, { scheduleOverride: override }))
  },

  async setSchedule(schedule) {
    return storeStatusFrom(await patchStaffStore(client, { weeklySchedule: schedule }))
  },

  /** La apertura la calcula el servidor con su reloj (America/Bogota); no se evalúa otra hora en el cliente. */
  async isOpenNow(now) {
    if (now !== undefined) throw new CapabilityUnavailableError('Evaluar la apertura en una hora distinta a la actual')
    return (await fetchStaffStore(client)).availability.isOpen
  },
})

export const realStoreStatusRepository: StoreStatusRepository = createRealStoreStatusRepository()
