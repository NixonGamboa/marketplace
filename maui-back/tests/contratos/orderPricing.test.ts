import { describe, expect, it } from 'vitest'
import {
  calculateOrderTotals,
  isGramPrecision,
  itemEstimatedTotal,
  itemFinalTotal,
  variableWeightLineTotal,
} from '../../../shared/contracts/index.js'

describe('fórmula por kg y redondeo COP', () => {
  it.each([
    [22000, 1.5, 33000],
    [32000, 0.75, 24000],
    [4500, 0.333, 1499], // 1498.5 → half-up
    [9999, 0.001, 10], // 9.999 → 10
    [3333, 0.3, 1000], // 999.9 → 1000 sin deriva de coma flotante
    [1, 0.499, 0],
    [1, 0.5, 1],
    [20000, 1.005, 20100], // 1.005 * 1000 = 1004.9999… → 1005 g
  ])('precio/kg %i × %f kg = %i', (price, kilos, expected) => {
    expect(variableWeightLineTotal(price, kilos)).toBe(expected)
    expect(Number.isInteger(variableWeightLineTotal(price, kilos))).toBe(true)
  })

  it('precisión de gramos', () => {
    for (const ok of [0.001, 0.75, 1, 1.005, 12.345]) expect(isGramPrecision(ok)).toBe(true)
    for (const bad of [0.0005, 1.0001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isGramPrecision(bad)).toBe(false)
    }
  })

  it('ítems unitarios multiplican qty × precio', () => {
    expect(itemEstimatedTotal({ qty: 3, priceAtMoment: 4500 })).toBe(13500)
    expect(itemFinalTotal({ qty: 3, priceAtMoment: 4500 })).toBe(13500)
  })

  it('peso variable sin kilosRequested es un error de programación', () => {
    expect(() => itemEstimatedTotal({ qty: 1, priceAtMoment: 1000, is_variable_weight: true })).toThrow(RangeError)
  })
})

describe('totales estimado/final/envío', () => {
  const unit = { qty: 2, priceAtMoment: 4500 }
  const carne = { qty: 1, priceAtMoment: 22000, is_variable_weight: true, kilosRequested: 1.5 }

  it('estimado = ítems con peso solicitado + envío', () => {
    expect(calculateOrderTotals([unit, carne], 3000).estimatedTotal).toBe(9000 + 33000 + 3000)
  })

  it('sin peso real no hay total final (no se inventa desde kilos solicitados)', () => {
    expect(calculateOrderTotals([unit, carne], 3000).finalTotal).toBeUndefined()
  })

  it('con peso real el final se recalcula y el estimado se preserva', () => {
    const weighed = { ...carne, kilosReal: 1.62 }
    const totals = calculateOrderTotals([unit, weighed], 3000)
    expect(totals.estimatedTotal).toBe(45000)
    expect(totals.finalTotal).toBe(9000 + 35640 + 3000)
  })

  it('falta un solo peso real → sin final', () => {
    const other = { ...carne, kilosReal: undefined }
    expect(calculateOrderTotals([{ ...carne, kilosReal: 1.4 }, other], 0).finalTotal).toBeUndefined()
  })

  it('solo ítems unitarios: el final iguala al estimado', () => {
    expect(calculateOrderTotals([unit], 0)).toEqual({ estimatedTotal: 9000, finalTotal: 9000 })
  })
})
