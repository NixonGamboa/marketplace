import type { DeliveryType, StoreAvailabilityDto, TimeSlot } from '../../../../shared/contracts/index.js'
import type { StoreRepository } from '../../domain/store/StoreRepository.js'
import { assertOrderPlacementAllowed, quoteShipping, type ShippingQuote } from '../../domain/store/storeRules.js'
import type { Clock } from '../../shared/clock.js'
import { getStoreSettings } from './getStore.js'

export interface OrderFulfillmentRequest {
  deliveryType: DeliveryType
  timeSlot?: TimeSlot | undefined
  /**
   * Subtotal de ítems en COP calculado por el servidor con precios del catálogo autoritativo.
   * T-10 lo obtiene al validar los ítems; nunca debe ser el subtotal enviado por el cliente.
   */
  itemsSubtotal: number
}

export interface OrderFulfillment extends ShippingQuote {
  availability: StoreAvailabilityDto
}

/**
 * Reglas de tienda para un pedido, listas para que T-10 las integre en la creación:
 * cierre/corte/franja con el reloj del servidor y envío según modalidad y umbral.
 */
export const evaluateOrderFulfillment = async (
  deps: { store: Pick<StoreRepository, 'findSettings'>; clock: Clock },
  storeId: string,
  request: OrderFulfillmentRequest,
): Promise<OrderFulfillment> => {
  const settings = await getStoreSettings(deps, storeId)
  const availability = assertOrderPlacementAllowed(settings, request, deps.clock.now())
  return { ...quoteShipping(settings.delivery, request.deliveryType, request.itemsSubtotal), availability }
}
