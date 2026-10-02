import { apiClient, type ApiClient } from './http/apiClient'
import { ApiError } from './http/apiError'
import { merchantFromStore, merchantPatchFrom } from './real/adapters'
import { fetchStaffStore, patchStaffStore } from './real/staffStoreApi'
import type { MerchantRepository } from './mockMerchantRepository'

/** Aliado = tienda de la sesión (`merchantId` es el `storeId`); el actor sale de la cookie, no de `by`. */
export const createRealMerchantRepository = (client: ApiClient = apiClient): MerchantRepository => ({
  async get(merchantId) {
    const merchant = merchantFromStore(await fetchStaffStore(client))
    if (merchant.merchantId !== merchantId) {
      throw new ApiError({ kind: 'not_found', status: 404, message: 'El aliado no corresponde a tu sesión.' })
    }
    return merchant
  },

  async update(config) {
    return merchantFromStore(await patchStaffStore(client, merchantPatchFrom(config)))
  },
})

export const realMerchantRepository: MerchantRepository = createRealMerchantRepository()
