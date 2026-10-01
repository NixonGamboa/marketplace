/**
 * Fórmula de totales de un pedido (enteros COP). Sin runtime ni Zod.
 *
 * - Ítem unitario:      `priceAtMoment × qty`.
 * - Ítem de peso variable: `priceAtMoment` es precio por kg (ADR-006) y la línea es
 *   `round(precioKg × kilos)` redondeada **por línea**, half-up al peso entero.
 *   Se calcula en gramos enteros (`kilos` admite hasta 3 decimales) para evitar
 *   errores de coma flotante: `floor((precioKg × gramos + 500) / 1000)`.
 * - `estimatedTotal` = Σ líneas con `kilosRequested` + `shippingCost` (se preserva tal cual).
 * - `finalTotal`     = Σ líneas con `kilosReal` + `shippingCost`; solo existe cuando todos
 *   los ítems de peso variable ya tienen `kilosReal`. Nunca se deriva de kilos solicitados.
 */

export interface PricedItem {
  qty: number
  priceAtMoment: number
  is_variable_weight?: boolean | undefined
  kilosRequested?: number | undefined
  kilosReal?: number | undefined
}

export interface OrderTotals {
  estimatedTotal: number
  finalTotal?: number | undefined
}

const GRAMS_PER_KILO = 1000

/** Verdadero si `kilos` es finito y se expresa en gramos enteros (máx. 3 decimales). */
export const isGramPrecision = (kilos: number): boolean =>
  Number.isFinite(kilos) &&
  Math.abs(kilos * GRAMS_PER_KILO - Math.round(kilos * GRAMS_PER_KILO)) < 1e-9

export const variableWeightLineTotal = (pricePerKg: number, kilos: number): number => {
  const grams = Math.round(kilos * GRAMS_PER_KILO)
  return Math.floor((pricePerKg * grams + GRAMS_PER_KILO / 2) / GRAMS_PER_KILO)
}

export const itemEstimatedTotal = (item: PricedItem): number => {
  if (!item.is_variable_weight) return item.priceAtMoment * item.qty
  if (item.kilosRequested === undefined) {
    throw new RangeError('Un ítem de peso variable requiere kilosRequested')
  }
  return variableWeightLineTotal(item.priceAtMoment, item.kilosRequested)
}

/** `undefined` mientras falte el peso real de un ítem de peso variable. */
export const itemFinalTotal = (item: PricedItem): number | undefined => {
  if (!item.is_variable_weight) return item.priceAtMoment * item.qty
  return item.kilosReal === undefined
    ? undefined
    : variableWeightLineTotal(item.priceAtMoment, item.kilosReal)
}

export const calculateOrderTotals = (
  items: readonly PricedItem[],
  shippingCost: number,
): OrderTotals => {
  const estimatedItems = items.reduce((sum, item) => sum + itemEstimatedTotal(item), 0)
  const finalLines = items.map(itemFinalTotal)
  const hasAllFinalLines = finalLines.every((line) => line !== undefined)
  const finalItems = finalLines.reduce<number>((sum, line) => sum + (line ?? 0), 0)

  return {
    estimatedTotal: estimatedItems + shippingCost,
    finalTotal: hasAllFinalLines ? finalItems + shippingCost : undefined,
  }
}
