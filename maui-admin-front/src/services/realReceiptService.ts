import { entityIdSchema, orderDtoSchema } from '@shared/contracts'
import { staffReceiptFrom, type ReceiptResult } from '@shared/receipts'
import { apiClient, type ApiClient } from './http/apiClient'
import { validateRequest } from './http/validateRequest'
import { ORDER_CONTRACT_HEADERS } from './realOrderRepository'

export interface ReceiptService {
  load(orderId: string, signal?: AbortSignal): Promise<ReceiptResult>
}
/** El servidor autoriza el detalle y entrega el contacto; no se consulta el perfil local. */
export const createRealReceiptService = (client: ApiClient = apiClient): ReceiptService => ({
  async load(orderId, signal) {
    const id = validateRequest(entityIdSchema, orderId)
    const order = await client.request({ path: `/orders/${encodeURIComponent(id)}`, headers: ORDER_CONTRACT_HEADERS, schema: orderDtoSchema, signal })
    return staffReceiptFrom(order)
  },
})
export const realReceiptService = createRealReceiptService()
