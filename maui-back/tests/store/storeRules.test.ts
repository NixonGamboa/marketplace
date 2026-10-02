import { describe, expect, it } from 'vitest'
import type { StoreSettingsDto } from '../../../shared/contracts/index.js'
import { StoreRuleError } from '../../src/domain/store/errors.js'
import { localMomentIn } from '../../src/domain/store/storeCalendar.js'
import {
  assertOrderPlacementAllowed,
  evaluateStoreAvailability,
  quoteShipping,
} from '../../src/domain/store/storeRules.js'
import { STORE_SEED_SETTINGS } from '../../src/usecases/store/storeSeed.js'

/** Hora civil de Bogotá (UTC−5, sin horario de verano). 2026-10-05 es lunes; 2026-10-04, domingo. */
const bogota = (local: string): Date => new Date(`${local}:00-05:00`)

const settings = (overrides: Partial<StoreSettingsDto> = {}): StoreSettingsDto => ({ ...STORE_SEED_SETTINGS, ...overrides })

const ruleOf = (run: () => unknown): string | undefined => {
  try {
    run()
    return undefined
  } catch (error) {
    if (error instanceof StoreRuleError) return error.rule
    throw error
  }
}

describe('calendario America/Bogota', () => {
  it('el día local manda aunque en UTC ya sea el siguiente', () => {
    const instant = new Date('2026-10-06T00:30:00.000Z')
    expect(localMomentIn(instant, 'America/Bogota')).toEqual({ date: '2026-10-05', time: '19:30', minutes: 1170, weekday: 'mon' })
    expect(evaluateStoreAvailability(settings(), instant)).toMatchObject({ weekday: 'mon', isOpen: true })
  })

  it('medianoche local es 00:00 (sin hora 24)', () => {
    expect(localMomentIn(bogota('2026-10-06T00:00'), 'America/Bogota')).toMatchObject({ time: '00:00', weekday: 'tue' })
  })
})

describe('horario semanal y override', () => {
  it.each([
    ['2026-10-05T07:59', false, 'before_opening'],
    ['2026-10-05T08:00', true, undefined],
    ['2026-10-05T19:59', true, undefined],
    ['2026-10-05T20:00', false, 'after_closing'],
    ['2026-10-04T08:59', false, 'before_opening'],
    ['2026-10-04T09:00', true, undefined],
    ['2026-10-04T13:59', true, undefined],
    ['2026-10-04T14:00', false, 'after_closing'],
  ])('%s → abierta=%s', (local, isOpen, closedReason) => {
    const availability = evaluateStoreAvailability(settings(), bogota(local))
    expect(availability.isOpen).toBe(isOpen)
    expect(availability.closedReason).toBe(closedReason)
    expect(availability.acceptsPickup).toBe(isOpen)
  })

  it('día cerrado y overrides manuales', () => {
    const closedSunday = settings({
      weeklySchedule: { ...STORE_SEED_SETTINGS.weeklySchedule, sun: { open: '09:00', close: '14:00', closed: true } },
    })
    expect(evaluateStoreAvailability(closedSunday, bogota('2026-10-04T10:00')).closedReason).toBe('day_closed')

    const closed = evaluateStoreAvailability(settings({ scheduleOverride: 'closed' }), bogota('2026-10-05T10:00'))
    expect(closed).toMatchObject({ isOpen: false, closedReason: 'override_closed', availableTimeSlots: [] })

    const open = evaluateStoreAvailability(settings({ scheduleOverride: 'open' }), bogota('2026-10-05T21:30'))
    expect(open).toMatchObject({ isOpen: true, acceptsPickup: true, acceptsDelivery: false })
  })
})

describe('corte de domicilio y franjas', () => {
  it('domicilio se acepta hasta antes del corte 17:00; recogida sigue hasta el cierre', () => {
    expect(evaluateStoreAvailability(settings(), bogota('2026-10-05T16:59')).acceptsDelivery).toBe(true)
    const atCutoff = evaluateStoreAvailability(settings(), bogota('2026-10-05T17:00'))
    expect(atCutoff).toMatchObject({ isOpen: true, acceptsPickup: true, acceptsDelivery: false })
    expect(ruleOf(() => assertOrderPlacementAllowed(settings(), { deliveryType: 'delivery' }, bogota('2026-10-05T17:00')))).toBe('DELIVERY_CUTOFF_PASSED')
    expect(ruleOf(() => assertOrderPlacementAllowed(settings(), { deliveryType: 'pickup' }, bogota('2026-10-05T17:00')))).toBeUndefined()
  })

  it('sin corte, el domicilio sigue el cierre; desactivado, se ofrece recogida', () => {
    const noCutoff = settings({ delivery: { ...STORE_SEED_SETTINGS.delivery, cutoff: null } })
    expect(evaluateStoreAvailability(noCutoff, bogota('2026-10-05T19:30')).acceptsDelivery).toBe(true)

    const disabled = settings({ delivery: { ...STORE_SEED_SETTINGS.delivery, enabled: false } })
    expect(ruleOf(() => assertOrderPlacementAllowed(disabled, { deliveryType: 'delivery' }, bogota('2026-10-05T10:00')))).toBe('DELIVERY_UNAVAILABLE')
    expect(ruleOf(() => assertOrderPlacementAllowed(disabled, { deliveryType: 'pickup' }, bogota('2026-10-05T10:00')))).toBeUndefined()
  })

  it.each([
    ['2026-10-05T08:00', ['morning', 'afternoon', 'asap']],
    ['2026-10-05T11:59', ['morning', 'afternoon', 'asap']],
    ['2026-10-05T12:00', ['afternoon', 'asap']],
    ['2026-10-05T17:00', ['asap']],
    ['2026-10-04T13:30', ['afternoon', 'asap']],
  ])('%s → franjas %j', (local, slots) => {
    expect(evaluateStoreAvailability(settings(), bogota(local)).availableTimeSlots).toEqual(slots)
  })

  it('una franja que empieza después del cierre no se ofrece', () => {
    const lateAfternoon = settings({
      timeSlots: [
        { id: 'morning', enabled: true, start: '08:00', end: '12:00' },
        { id: 'afternoon', enabled: true, start: '14:00', end: '17:00' },
        { id: 'asap', enabled: false },
      ],
    })
    // Domingo cierra a las 14:00: la tarde no existe ese día.
    expect(evaluateStoreAvailability(lateAfternoon, bogota('2026-10-04T10:00')).availableTimeSlots).toEqual(['morning'])
  })

  it('franja pasada o deshabilitada se rechaza en servidor; tienda cerrada primero', () => {
    const at = bogota('2026-10-05T12:30')
    expect(ruleOf(() => assertOrderPlacementAllowed(settings(), { deliveryType: 'pickup', timeSlot: 'morning' }, at))).toBe('TIME_SLOT_UNAVAILABLE')
    expect(ruleOf(() => assertOrderPlacementAllowed(settings(), { deliveryType: 'pickup', timeSlot: 'afternoon' }, at))).toBeUndefined()
    const noAsap = settings({ timeSlots: [STORE_SEED_SETTINGS.timeSlots[0]!, STORE_SEED_SETTINGS.timeSlots[1]!, { id: 'asap', enabled: false }] })
    expect(ruleOf(() => assertOrderPlacementAllowed(noAsap, { deliveryType: 'delivery', timeSlot: 'asap' }, at))).toBe('TIME_SLOT_UNAVAILABLE')
    expect(ruleOf(() => assertOrderPlacementAllowed(settings(), { deliveryType: 'pickup' }, bogota('2026-10-05T20:00')))).toBe('STORE_CLOSED')
  })
})

describe('envío', () => {
  const delivery = STORE_SEED_SETTINGS.delivery

  it('domicilio cobra 3000 bajo el umbral y es gratis desde 30000', () => {
    expect(quoteShipping(delivery, 'delivery', 29_999)).toEqual({ shippingCost: 3000, freeShippingApplied: false })
    expect(quoteShipping(delivery, 'delivery', 30_000)).toEqual({ shippingCost: 0, freeShippingApplied: true })
    expect(quoteShipping(delivery, 'delivery', 0)).toEqual({ shippingCost: 3000, freeShippingApplied: false })
  })

  it('recogida nunca cobra envío; sin umbral nunca es gratis', () => {
    expect(quoteShipping(delivery, 'pickup', 1000)).toEqual({ shippingCost: 0, freeShippingApplied: false })
    expect(quoteShipping({ ...delivery, freeShippingThreshold: null }, 'delivery', 10_000_000).shippingCost).toBe(3000)
  })

  it.each([-1, 100.5, Number.NaN])('rechaza subtotal inválido %s', (subtotal) => {
    expect(() => quoteShipping(delivery, 'delivery', subtotal)).toThrow(RangeError)
  })
})
