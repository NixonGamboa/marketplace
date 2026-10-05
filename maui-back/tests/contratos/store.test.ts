import { describe, expect, it } from 'vitest'
import {
  contactPhoneInputSchema,
  orderProcessingNoticeSchema,
  storeSettingsSchema,
  timeSlotsSchema,
  updateStoreSettingsRequestSchema,
} from '../../../shared/contracts/index.js'
import { STORE_SEED_SETTINGS } from '../../src/usecases/store/storeSeed.js'

describe('contrato de configuración de tienda', () => {
  it('la semilla cumple el contrato, sin contacto ficticio y con la nota de cobertura', () => {
    const parsed = storeSettingsSchema.parse(STORE_SEED_SETTINGS)
    expect(parsed.contactPhone).toBeNull()
    expect(parsed.timeZone).toBe('America/Bogota')
    expect(parsed.delivery).toMatchObject({ shippingCost: 3000, freeShippingThreshold: 30000 })
    expect(parsed.delivery.coverageNote).toBe('Solo hay cobertura en el casco urbano de Dolores')
    expect(parsed.weeklySchedule.sun).toEqual({ open: '09:00', close: '14:00', closed: false })
  })

  it('contacto: normaliza celular colombiano y rechaza el número de relleno', () => {
    expect(contactPhoneInputSchema.parse('+57 310 123 4567')).toBe('573101234567')
    expect(contactPhoneInputSchema.safeParse('573000000000').success).toBe(false)
    expect(contactPhoneInputSchema.safeParse('+57 300 000 0000').success).toBe(false)
    expect(contactPhoneInputSchema.safeParse('6012345678').success).toBe(false)
  })

  it('horario: HH:MM válido y cierre posterior a la apertura', () => {
    const schedule = STORE_SEED_SETTINGS.weeklySchedule
    const withMonday = (mon: unknown) => storeSettingsSchema.safeParse({ ...STORE_SEED_SETTINGS, weeklySchedule: { ...schedule, mon } })
    expect(withMonday({ open: '20:00', close: '08:00', closed: false }).success).toBe(false)
    expect(withMonday({ open: '8:00', close: '20:00', closed: false }).success).toBe(false)
    expect(withMonday({ open: '08:00', close: '24:00', closed: false }).success).toBe(false)
    expect(withMonday({ open: '00:00', close: '00:00', closed: true }).success).toBe(true)
  })

  it('franjas: exactamente morning/afternoon/asap, ventanas crecientes', () => {
    const slots = STORE_SEED_SETTINGS.timeSlots
    expect(timeSlotsSchema.safeParse(slots).success).toBe(true)
    expect(timeSlotsSchema.safeParse(slots.slice(0, 2)).success).toBe(false)
    expect(timeSlotsSchema.safeParse([slots[0], slots[0], slots[2]]).success).toBe(false)
    expect(timeSlotsSchema.safeParse([{ id: 'morning', enabled: true, start: '12:00', end: '08:00' }, slots[1], slots[2]]).success).toBe(false)
    expect(timeSlotsSchema.safeParse([slots[0], slots[1], { id: 'asap', enabled: true, start: '08:00' }]).success).toBe(false)
  })

  it.each([
    ['envío negativo', { shippingCost: -1 }],
    ['envío decimal', { shippingCost: 3000.5 }],
    ['umbral cero', { freeShippingThreshold: 0 }],
    ['corte inválido', { cutoff: '25:00' }],
    ['moneda ajena', { currency: 'USD' }],
  ])('rechaza %s', (_label, delivery) => {
    expect(updateStoreSettingsRequestSchema.safeParse({ delivery }).success).toBe(false)
  })

  it('el body no edita tienda, zona horaria ni fechas', () => {
    for (const field of ['storeId', 'timeZone', 'updatedAt', 'version', 'availability']) {
      expect(updateStoreSettingsRequestSchema.safeParse({ [field]: 'x' }).success, field).toBe(false)
    }
    expect(updateStoreSettingsRequestSchema.safeParse({}).success).toBe(false)
    expect(updateStoreSettingsRequestSchema.safeParse({ delivery: {} }).success).toBe(false)
  })
})

describe('contrato del aviso de procesamiento (PM-03)', () => {
  const scheduled = { kind: 'scheduled', reason: 'after_closing', startsAt: '2026-10-06T13:00:00.000Z' }

  it('acepta programado con instante UTC y sin hora, con motivo de cierre o de corte', () => {
    expect(orderProcessingNoticeSchema.parse(scheduled)).toEqual(scheduled)
    expect(orderProcessingNoticeSchema.parse({ kind: 'scheduled', reason: 'delivery_cutoff', startsAt: '2026-10-06T13:00:00Z' })).toMatchObject({ kind: 'scheduled' })
    expect(orderProcessingNoticeSchema.parse({ kind: 'unscheduled', reason: 'override_closed' })).toEqual({ kind: 'unscheduled', reason: 'override_closed' })
  })

  it('no admite programado sin hora, sin hora con hora inventada, motivos ajenos ni campos extra', () => {
    expect(orderProcessingNoticeSchema.safeParse({ kind: 'scheduled', reason: 'after_closing' }).success).toBe(false)
    expect(orderProcessingNoticeSchema.safeParse({ kind: 'unscheduled', reason: 'override_closed', startsAt: scheduled.startsAt }).success).toBe(false)
    expect(orderProcessingNoticeSchema.safeParse({ ...scheduled, reason: 'vacation' }).success).toBe(false)
    expect(orderProcessingNoticeSchema.safeParse({ ...scheduled, startsAt: 'mañana a las 8' }).success).toBe(false)
    expect(orderProcessingNoticeSchema.safeParse({ ...scheduled, deliveryAt: scheduled.startsAt }).success).toBe(false)
  })
})
