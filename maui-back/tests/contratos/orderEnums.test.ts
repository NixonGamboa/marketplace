import { describe, expect, it } from 'vitest'
import {
  ORDER_STATUS_VALUES,
  OrderStatus,
  allowedNextStatuses,
  canTransition,
} from '../../../shared/contracts/index.js'

describe('estados comunes', () => {
  it('incluye confirmed, in_delivery y cancelled', () => {
    expect(ORDER_STATUS_VALUES).toEqual([
      'received',
      'confirmed',
      'preparing',
      'ready',
      'in_delivery',
      'delivered',
      'cancelled',
    ])
    expect(Object.values(OrderStatus).sort()).toEqual([...ORDER_STATUS_VALUES].sort())
  })
})

describe('máquina de transiciones por modalidad', () => {
  it('flujo feliz de retiro', () => {
    const path = ['received', 'confirmed', 'preparing', 'ready', 'delivered'] as const
    path.slice(1).forEach((next, i) => {
      expect(canTransition(path[i]!, next, 'pickup')).toBe(true)
    })
  })

  it('domicilio puede pasar por in_delivery desde ready; retiro no', () => {
    expect(canTransition('ready', 'in_delivery', 'delivery')).toBe(true)
    expect(canTransition('ready', 'in_delivery', 'pickup')).toBe(false)
    expect(canTransition('in_delivery', 'delivered', 'delivery')).toBe(true)
  })

  it('no se salta pasos ni se retrocede', () => {
    expect(canTransition('received', 'preparing', 'pickup')).toBe(false)
    expect(canTransition('received', 'delivered', 'delivery')).toBe(false)
    expect(canTransition('preparing', 'confirmed', 'pickup')).toBe(false)
  })

  it('cancelar hasta ready; nunca desde in_delivery ni estados finales', () => {
    for (const from of ['received', 'confirmed', 'preparing', 'ready'] as const) {
      expect(canTransition(from, 'cancelled', 'delivery')).toBe(true)
    }
    expect(canTransition('in_delivery', 'cancelled', 'delivery')).toBe(false)
    expect(allowedNextStatuses('delivered', 'delivery')).toEqual([])
    expect(allowedNextStatuses('cancelled', 'pickup')).toEqual([])
  })
})
