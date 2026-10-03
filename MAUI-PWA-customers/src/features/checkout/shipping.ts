/*
  shipping — cálculo de costo de envío
  ─────────────────────────────────────────────────────────────────────────────
  Capa de aplicación. Pura, sin dependencias de UI ni de stores.
  Demo: usa la configuración local (FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_COST).
  Real: las reglas son las que publica el servidor en `delivery` de GET /api/store; esto es solo
  una vista previa, el servidor recalcula el envío al crear el pedido y manda su resultado.
*/

import { FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_COST } from '@/config/app'

export interface ShippingRules {
  /** Costo del domicilio (COP). */
  cost: number
  /** Subtotal desde el cual el envío es gratis; `null` = nunca gratis. */
  freeThreshold: number | null
}

export const DEMO_SHIPPING_RULES: ShippingRules = {
  cost: STANDARD_SHIPPING_COST,
  freeThreshold: FREE_SHIPPING_THRESHOLD,
}

export interface ShippingQuote {
  /** Costo numérico de envío en COP. 0 si es gratis. */
  cost: number
  /** true cuando el subtotal alcanza/supera el umbral de envío gratis. */
  isFree: boolean
  /** Umbral configurado (útil para mensajes "te faltan $X para envío gratis"); `null` = nunca gratis. */
  freeThreshold: number | null
}

/**
 * Calcula el envío para un subtotal dado.
 *   - umbral definido y subtotal >= umbral → gratis (0)
 *   - en otro caso → costo configurado
 */
export function calculateShipping(subtotal: number, rules: ShippingRules = DEMO_SHIPPING_RULES): ShippingQuote {
  const isFree = rules.freeThreshold !== null && subtotal >= rules.freeThreshold
  return {
    cost: isFree ? 0 : rules.cost,
    isFree,
    freeThreshold: rules.freeThreshold,
  }
}
