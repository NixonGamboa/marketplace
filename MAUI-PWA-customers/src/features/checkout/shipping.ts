/*
  shipping — cálculo de costo de envío
  ─────────────────────────────────────────────────────────────────────────────
  Capa de aplicación. Pura, sin dependencias de UI ni de stores.
  Consulta la configuración (FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_COST)
  y decide el costo en función del subtotal del carrito.
*/

import { FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_COST } from '@/config/app'

export interface ShippingQuote {
  /** Costo numérico de envío en COP. 0 si es gratis. */
  cost: number
  /** true cuando el subtotal alcanza/supera el umbral de envío gratis. */
  isFree: boolean
  /** Umbral configurado (útil para mensajes "te faltan $X para envío gratis"). */
  freeThreshold: number
}

/**
 * Calcula el envío para un subtotal dado.
 * Regla actual (configurable vía `src/config/app.ts`):
 *   - subtotal >= FREE_SHIPPING_THRESHOLD → gratis (0)
 *   - subtotal <  FREE_SHIPPING_THRESHOLD → STANDARD_SHIPPING_COST
 */
export function calculateShipping(subtotal: number): ShippingQuote {
  const isFree = subtotal >= FREE_SHIPPING_THRESHOLD
  return {
    cost: isFree ? 0 : STANDARD_SHIPPING_COST,
    isFree,
    freeThreshold: FREE_SHIPPING_THRESHOLD,
  }
}
