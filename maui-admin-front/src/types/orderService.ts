// Service-layer types for the Order Service contract.
// Fuente única: `shared/contracts` (esquemas Zod y DTOs, validados también por el backend).
// Este archivo solo expone esos tipos con los nombres de la UI y define la interfaz del
// servicio; se replica byte-a-byte en PWA y admin (ADR-002, scripts/check-types-drift.sh).

import type {
  CreateOrderRequest,
  DeliveryDataDto,
  DeliveryType,
  OrderConfirmationDto,
  OrderDto,
  OrderItemDto,
  OrderStatus,
  SubstitutionPref,
  TimeSlot,
} from '@shared/contracts'

export type { DeliveryType, OrderStatus, SubstitutionPref, TimeSlot }

/**
 * Ítem del carrito / pedido.
 *
 * Productos de **peso variable** (ej. carnes, granos por kg) usan `priceAtMoment`
 * como **precio por kilogramo** (ADR-006). Para esos productos:
 *  - `is_variable_weight = true` y `qty = 1`
 *  - `kilosRequested` = peso solicitado por el cliente al ordenar
 *  - `kilosReal` = peso real pesado en mostrador por el aliado al preparar el
 *    pedido (capturado desde el panel admin). Hasta que el aliado lo registra
 *    queda `undefined`; ese es el valor que se usa para el cobro final.
 * Para productos de peso fijo los tres campos quedan ausentes y `qty` es la
 * cantidad de unidades.
 */
export type CartItem = OrderItemDto

export type DeliveryData = DeliveryDataDto

/**
 * Request de creación. `customerPhone`: celular colombiano canónico (`57` + 10 dígitos);
 * `shippingCost`: envío cotizado al confirmar el checkout, cero para retiro en tienda.
 * No incluye estado, totales ni pesos reales: los asigna el servidor.
 */
export type OrderPayload = CreateOrderRequest

export type OrderConfirmation = OrderConfirmationDto

/**
 * Pedido expuesto al cliente. `customerPhone` va normalizado para `wa.me` / `tel:`
 * (solo dígitos con prefijo de país, ej. `573015550101`); `customerPhone` y `shippingCost`
 * son opcionales para pedidos legacy. `finalTotal` es el total cobrado tras registrar
 * todos los pesos reales de los productos variables; `estimatedTotal` se preserva.
 */
export type Order = OrderDto

export interface OrderService {
  submit(payload: OrderPayload): Promise<OrderConfirmation>
  getById(orderId: string, options?: { signal?: AbortSignal }): Promise<Order>
  list(userId?: string): Promise<Order[]>
}
