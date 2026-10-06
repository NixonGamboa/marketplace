import { CONTRACT_VERSION_HEADER, CURRENT_CONTRACT_VERSION, entityIdSchema, orderDtoSchema, storeDtoSchema } from '@shared/contracts'
import { customerReceiptFrom, type ReceiptResult } from '@shared/receipts'
import { apiClient, type ApiClient } from './http/apiClient'
import { validateRequest } from './http/validateRequest'

export interface ReceiptService {
  load(orderId: string, signal?: AbortSignal): Promise<ReceiptResult>
}
/** La lectura autorizada del pedido manda; un fallo del contacto no oculta su seguimiento. */
export const createRealReceiptService = (client: ApiClient = apiClient): ReceiptService => ({
  async load(orderId, signal) {
    const id = validateRequest(entityIdSchema, orderId)
    const order = await client.request({ path: `/orders/${encodeURIComponent(id)}`, headers: { [CONTRACT_VERSION_HEADER]: CURRENT_CONTRACT_VERSION }, schema: orderDtoSchema, signal })
    try {
      const store = await client.request({ path: '/store', schema: storeDtoSchema, signal })
      return customerReceiptFrom(order, store)
    } catch (error) {
      if (signal?.aborted) throw error
      return { ...customerReceiptFrom(order, null), contactUnavailable: 'No se pudo consultar el contacto de la tienda.' }
    }
  },
})
export const realReceiptService = createRealReceiptService()
