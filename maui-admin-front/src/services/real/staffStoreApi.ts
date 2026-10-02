import { storeDtoSchema, updateStoreSettingsRequestSchema, type StoreDto, type UpdateStoreSettingsRequest } from '@shared/contracts'
import type { ApiClient } from '../http/apiClient'
import { validateRequest } from '../http/validateRequest'

/** `/api/store/staff`: lectura owner/operator y PATCH owner. Lo comparten merchant y estado de tienda. */
export const fetchStaffStore = (client: ApiClient, signal?: AbortSignal): Promise<StoreDto> =>
  client.request({ path: '/store/staff', schema: storeDtoSchema, ...(signal ? { signal } : {}) })

/** El PATCH se normaliza con el esquema compartido (teléfono canónico, relleno rechazado) antes de enviarse. */
export const patchStaffStore = async (client: ApiClient, patch: UpdateStoreSettingsRequest): Promise<StoreDto> =>
  client.request({
    method: 'PATCH',
    path: '/store/staff',
    body: validateRequest(updateStoreSettingsRequestSchema, patch),
    schema: storeDtoSchema,
  })
