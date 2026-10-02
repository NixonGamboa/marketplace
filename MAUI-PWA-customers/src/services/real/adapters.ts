// Adaptaciones puras entre los DTO compartidos y los tipos de la UI de la PWA.
// Sin red ni estado; no inventan datos que el servidor no entrega.

import type { AuthSessionResponse, CreateOrderRequest } from '@shared/contracts'
import type { User } from '@/types/auth'
import type { OrderPayload } from '@/types/orderService'

export interface CustomerSession {
  user: User
  expiresAt: string
}

/** Sesión de cliente; `null` si la cuenta es de personal (no pertenece a la PWA). */
export const customerSessionFrom = (response: AuthSessionResponse): CustomerSession | null => {
  const { account } = response
  if (account.role !== 'customer') return null
  return {
    user: { id: account.id, name: account.name, phone: account.phone, isAuthenticated: true },
    expiresAt: response.expiresAt,
  }
}

/**
 * Cuerpo de creación: solo lo que el cliente decide. Precio, nombre, unidad, forma de peso y envío
 * los fija el servidor con el catálogo y las reglas de la tienda; los campos LEGACY del carrito
 * (`priceAtMoment`, `name`, `is_variable_weight`, `shippingCost`) no se envían.
 */
export const createOrderRequestFrom = (payload: OrderPayload): CreateOrderRequest => ({
  userId: payload.userId,
  items: payload.items.map((item) => ({
    id: item.id,
    qty: item.qty,
    ...(item.kilosRequested !== undefined ? { kilosRequested: item.kilosRequested } : {}),
  })),
  substitutionPreference: payload.substitutionPreference,
  deliveryType: payload.deliveryType,
  deliveryData: payload.deliveryData,
  customerName: payload.customerName,
  customerPhone: payload.customerPhone,
})
