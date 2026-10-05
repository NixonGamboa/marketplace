import { describe, expect, it } from 'vitest'
import type { StoreSettingsDto } from '../../../shared/contracts/index.js'
import { StoreRuleError } from '../../src/domain/store/errors.js'
import { addCalendarDays, instantFromLocal, localMomentIn } from '../../src/domain/store/storeCalendar.js'
import {
  evaluateStoreAvailability,
  quoteShipping,
  resolveOrderReception,
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

describe('conversión de hora local a instante', () => {
  it('Bogotá es UTC−5: 08:00 local son las 13:00 UTC y el día siguiente cruza el mes', () => {
    expect(instantFromLocal('2026-10-06', '08:00', 'America/Bogota').toISOString()).toBe('2026-10-06T13:00:00.000Z')
    expect(instantFromLocal('2026-10-06', '23:30', 'America/Bogota').toISOString()).toBe('2026-10-07T04:30:00.000Z')
    expect(addCalendarDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01')
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
    // El horario es informativo: la recogida se recibe siempre.
    expect(availability.acceptsPickup).toBe(true)
  })

  it('día cerrado y overrides manuales', () => {
    const closedSunday = settings({
      weeklySchedule: { ...STORE_SEED_SETTINGS.weeklySchedule, sun: { open: '09:00', close: '14:00', closed: true } },
    })
    expect(evaluateStoreAvailability(closedSunday, bogota('2026-10-04T10:00')).closedReason).toBe('day_closed')

    const closed = evaluateStoreAvailability(settings({ scheduleOverride: 'closed' }), bogota('2026-10-05T10:00'))
    expect(closed).toMatchObject({ isOpen: false, closedReason: 'override_closed', acceptsPickup: true, acceptsDelivery: true })
    // Sin fecha de reapertura se ofrecen las franjas habilitadas, sin exigir una de hoy.
    expect(closed.availableTimeSlots).toEqual(['morning', 'afternoon', 'asap'])

    const open = evaluateStoreAvailability(settings({ scheduleOverride: 'open' }), bogota('2026-10-05T21:30'))
    expect(open).toMatchObject({ isOpen: true, acceptsPickup: true, acceptsDelivery: true })
  })
})

describe('corte de domicilio y franjas', () => {
  it('el corte 17:00 no impide recibir domicilios: solo aplaza su procesamiento al siguiente día con atención', () => {
    const before = resolveOrderReception(settings(), { deliveryType: 'delivery' }, bogota('2026-10-05T16:59'))
    expect(before.processingNotice).toBeUndefined()
    expect(before.availability.acceptsDelivery).toBe(true)

    const atCutoff = resolveOrderReception(settings(), { deliveryType: 'delivery' }, bogota('2026-10-05T17:00'))
    expect(atCutoff.availability).toMatchObject({ isOpen: true, acceptsPickup: true, acceptsDelivery: true })
    expect(atCutoff.processingNotice).toEqual({
      kind: 'scheduled', reason: 'delivery_cutoff', startsAt: '2026-10-06T13:00:00.000Z',
    })
    // La recogida sí se procesa ya: la tienda sigue abierta.
    expect(resolveOrderReception(settings(), { deliveryType: 'pickup' }, bogota('2026-10-05T17:00')).processingNotice).toBeUndefined()
  })

  it('sin corte el domicilio se procesa hasta el cierre; desactivado se rechaza y la recogida sigue', () => {
    const noCutoff = settings({ delivery: { ...STORE_SEED_SETTINGS.delivery, cutoff: null } })
    expect(resolveOrderReception(noCutoff, { deliveryType: 'delivery' }, bogota('2026-10-05T19:30')).processingNotice).toBeUndefined()

    const disabled = settings({ delivery: { ...STORE_SEED_SETTINGS.delivery, enabled: false } })
    expect(evaluateStoreAvailability(disabled, bogota('2026-10-05T10:00'))).toMatchObject({ acceptsDelivery: false, acceptsPickup: true })
    expect(ruleOf(() => resolveOrderReception(disabled, { deliveryType: 'delivery' }, bogota('2026-10-05T10:00')))).toBe('DELIVERY_UNAVAILABLE')
    // Deshabilitado manda también fuera de horario.
    expect(ruleOf(() => resolveOrderReception(disabled, { deliveryType: 'delivery' }, bogota('2026-10-05T21:00')))).toBe('DELIVERY_UNAVAILABLE')
    expect(ruleOf(() => resolveOrderReception(disabled, { deliveryType: 'pickup' }, bogota('2026-10-05T21:00')))).toBeUndefined()
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

  it('franja vencida hoy o deshabilitada se rechaza en servidor mientras la tienda atiende', () => {
    const at = bogota('2026-10-05T12:30')
    expect(ruleOf(() => resolveOrderReception(settings(), { deliveryType: 'pickup', timeSlot: 'morning' }, at))).toBe('TIME_SLOT_UNAVAILABLE')
    expect(ruleOf(() => resolveOrderReception(settings(), { deliveryType: 'pickup', timeSlot: 'afternoon' }, at))).toBeUndefined()
    const noAsap = settings({ timeSlots: [STORE_SEED_SETTINGS.timeSlots[0]!, STORE_SEED_SETTINGS.timeSlots[1]!, { id: 'asap', enabled: false }] })
    expect(ruleOf(() => resolveOrderReception(noAsap, { deliveryType: 'delivery', timeSlot: 'asap' }, at))).toBe('TIME_SLOT_UNAVAILABLE')
  })
})

describe('recepción permanente: próxima apertura en America/Bogota', () => {
  const closedOn = (...days: (keyof typeof STORE_SEED_SETTINGS.weeklySchedule)[]): StoreSettingsDto => settings({
    weeklySchedule: {
      ...STORE_SEED_SETTINGS.weeklySchedule,
      ...Object.fromEntries(days.map((day) => [day, { ...STORE_SEED_SETTINGS.weeklySchedule[day], closed: true }])),
    },
  })
  const noticeAt = (config: StoreSettingsDto, local: string, deliveryType: 'pickup' | 'delivery' = 'pickup') =>
    resolveOrderReception(config, { deliveryType }, bogota(local)).processingNotice

  it('abierta: se recibe y procesa de inmediato, sin aviso', () => {
    expect(noticeAt(settings(), '2026-10-05T10:00')).toBeUndefined()
    expect(noticeAt(settings({ scheduleOverride: 'open' }), '2026-10-05T23:00')).toBeUndefined()
  })

  it('antes de abrir: el procesamiento empieza hoy a la hora de apertura', () => {
    expect(noticeAt(settings(), '2026-10-05T07:15')).toEqual({
      kind: 'scheduled', reason: 'before_opening', startsAt: '2026-10-05T13:00:00.000Z',
    })
    // Domingo abre a las 09:00.
    expect(noticeAt(settings(), '2026-10-04T06:00')).toEqual({
      kind: 'scheduled', reason: 'before_opening', startsAt: '2026-10-04T14:00:00.000Z',
    })
  })

  it('después del cierre: empieza el siguiente día con atención, con su propia hora de apertura', () => {
    // Lunes 20:00 → martes 08:00.
    expect(noticeAt(settings(), '2026-10-05T20:00')).toEqual({
      kind: 'scheduled', reason: 'after_closing', startsAt: '2026-10-06T13:00:00.000Z',
    })
    // Sábado 21:00 → domingo 09:00 (horario de domingo).
    expect(noticeAt(settings(), '2026-10-03T21:00')).toEqual({
      kind: 'scheduled', reason: 'after_closing', startsAt: '2026-10-04T14:00:00.000Z',
    })
    // Domingo 14:00 → lunes 08:00 (cruza semana).
    expect(noticeAt(settings(), '2026-10-04T14:00')).toEqual({
      kind: 'scheduled', reason: 'after_closing', startsAt: '2026-10-05T13:00:00.000Z',
    })
  })

  it('día sin atención: salta los días cerrados consecutivos hasta el siguiente con atención', () => {
    expect(noticeAt(closedOn('mon', 'tue', 'wed'), '2026-10-05T10:00')).toEqual({
      kind: 'scheduled', reason: 'day_closed', startsAt: '2026-10-08T13:00:00.000Z',
    })
    // Después del cierre del domingo con el lunes cerrado.
    expect(noticeAt(closedOn('mon'), '2026-10-04T15:00')).toEqual({
      kind: 'scheduled', reason: 'after_closing', startsAt: '2026-10-06T13:00:00.000Z',
    })
  })

  it('el día local manda cerca de medianoche UTC', () => {
    // 23:30 del lunes en Bogotá ya es martes en UTC: sigue siendo el horario del lunes.
    expect(noticeAt(settings(), '2026-10-05T23:30')).toEqual({
      kind: 'scheduled', reason: 'after_closing', startsAt: '2026-10-06T13:00:00.000Z',
    })
  })

  it('override cerrado u horario sin días de atención: aviso sin hora inventada', () => {
    expect(noticeAt(settings({ scheduleOverride: 'closed' }), '2026-10-05T10:00')).toEqual({ kind: 'unscheduled', reason: 'override_closed' })
    // Aunque el horario abriría mañana, el cierre manual no tiene fecha de reapertura.
    expect(noticeAt(settings({ scheduleOverride: 'closed' }), '2026-10-05T21:00')).toEqual({ kind: 'unscheduled', reason: 'override_closed' })
    const nobody = closedOn('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
    expect(noticeAt(nobody, '2026-10-05T10:00')).toEqual({ kind: 'unscheduled', reason: 'day_closed' })
  })

  it('domicilio posterior al corte: la próxima apertura puede ser el mismo día de la semana siguiente', () => {
    const onlyMonday = closedOn('tue', 'wed', 'thu', 'fri', 'sat', 'sun')
    expect(noticeAt(onlyMonday, '2026-10-05T17:30', 'delivery')).toEqual({
      kind: 'scheduled', reason: 'delivery_cutoff', startsAt: '2026-10-12T13:00:00.000Z',
    })
  })

  it('franjas compatibles con la fecha de procesamiento, sin exigir una vencida hoy', () => {
    const slotsAt = (config: StoreSettingsDto, local: string) => evaluateStoreAvailability(config, bogota(local)).availableTimeSlots
    // Cerrada 20:00: la mañana de mañana es válida aunque hoy la mañana ya venció.
    expect(slotsAt(settings(), '2026-10-05T20:00')).toEqual(['morning', 'afternoon', 'asap'])
    expect(resolveOrderReception(settings(), { deliveryType: 'pickup', timeSlot: 'morning' }, bogota('2026-10-05T20:00')).processingNotice).toBeDefined()
    // Antes de abrir hoy: franjas de hoy evaluadas a la apertura.
    expect(slotsAt(settings(), '2026-10-05T06:00')).toEqual(['morning', 'afternoon', 'asap'])
    // Una franja que termina antes de abrir el día de procesamiento no se ofrece.
    const earlySlot = settings({
      timeSlots: [
        { id: 'morning', enabled: true, start: '06:00', end: '08:00' },
        { id: 'afternoon', enabled: true, start: '12:00', end: '17:00' },
        { id: 'asap', enabled: false },
      ],
    })
    expect(slotsAt(earlySlot, '2026-10-05T20:00')).toEqual(['afternoon'])
    expect(ruleOf(() => resolveOrderReception(earlySlot, { deliveryType: 'pickup', timeSlot: 'morning' }, bogota('2026-10-05T20:00')))).toBe('TIME_SLOT_UNAVAILABLE')
    // Franjas deshabilitadas nunca se ofrecen, ni con cierre manual.
    const onlyMorning = settings({
      scheduleOverride: 'closed',
      timeSlots: [STORE_SEED_SETTINGS.timeSlots[0]!, { id: 'afternoon', enabled: false, start: '12:00', end: '17:00' }, { id: 'asap', enabled: false }],
    })
    expect(slotsAt(onlyMorning, '2026-10-05T10:00')).toEqual(['morning'])
  })

  it('la fecha de las franjas acompaña a las franjas: hoy, próxima apertura o desconocida', () => {
    const dateAt = (config: StoreSettingsDto, local: string) => evaluateStoreAvailability(config, bogota(local)).timeSlotsDate
    expect(dateAt(settings(), '2026-10-05T10:00')).toBe('2026-10-05')
    expect(dateAt(settings(), '2026-10-05T06:00')).toBe('2026-10-05') // antes de abrir: hoy
    expect(dateAt(settings(), '2026-10-05T20:00')).toBe('2026-10-06') // tras el cierre: mañana
    expect(dateAt(settings(), '2026-10-03T21:00')).toBe('2026-10-04') // sábado noche: domingo
    expect(dateAt(closedOn('mon', 'tue', 'wed'), '2026-10-05T10:00')).toBe('2026-10-08') // salta días cerrados
    expect(dateAt(settings({ scheduleOverride: 'closed' }), '2026-10-05T10:00')).toBeUndefined() // reapertura desconocida
    expect(dateAt(closedOn('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'), '2026-10-05T10:00')).toBeUndefined()
  })

  it('un domicilio con franja posterior al corte usa la fecha de procesamiento', () => {
    const reception = resolveOrderReception(settings(), { deliveryType: 'delivery', timeSlot: 'morning' }, bogota('2026-10-05T17:30'))
    expect(reception.processingNotice).toMatchObject({ reason: 'delivery_cutoff' })
  })
})

describe('atendiendo, pero sin franjas vigentes hoy', () => {
  const day = { open: '08:00', close: '18:00', closed: false }
  const onlyMorning = (overrides: Partial<StoreSettingsDto> = {}): StoreSettingsDto => settings({
    weeklySchedule: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day },
    delivery: { ...STORE_SEED_SETTINGS.delivery, enabled: false },
    timeSlots: [
      { id: 'morning', enabled: true, start: '08:00', end: '12:00' },
      { id: 'afternoon', enabled: false, start: '12:00', end: '17:00' },
      { id: 'asap', enabled: false },
    ],
    ...overrides,
  })
  const afternoon = bogota('2026-10-05T14:00')

  it('franja habilitada vencida hoy: se ofrece la de la próxima fecha con atención y se recibe sin aviso', () => {
    const availability = evaluateStoreAvailability(onlyMorning(), afternoon)
    expect(availability).toMatchObject({
      isOpen: true, acceptsPickup: true, acceptsDelivery: false, availableTimeSlots: ['morning'], timeSlotsDate: '2026-10-06',
    })
    const reception = resolveOrderReception(onlyMorning(), { deliveryType: 'pickup', timeSlot: 'morning' }, afternoon)
    expect(reception.processingNotice).toBeUndefined() // la tienda atiende: se procesa ya, sin «descansando»
    // Sin franja también se recibe: la franja es opcional en el servidor.
    expect(resolveOrderReception(onlyMorning(), { deliveryType: 'pickup' }, afternoon).processingNotice).toBeUndefined()
  })

  it('conserva las restricciones ajenas: domicilio deshabilitado y franja deshabilitada se rechazan', () => {
    expect(ruleOf(() => resolveOrderReception(onlyMorning(), { deliveryType: 'delivery' }, afternoon))).toBe('DELIVERY_UNAVAILABLE')
    expect(ruleOf(() => resolveOrderReception(onlyMorning(), { deliveryType: 'pickup', timeSlot: 'afternoon' }, afternoon))).toBe('TIME_SLOT_UNAVAILABLE')
    expect(ruleOf(() => resolveOrderReception(onlyMorning(), { deliveryType: 'pickup', timeSlot: 'asap' }, afternoon))).toBe('TIME_SLOT_UNAVAILABLE')
  })

  it('con la franja aún vigente se ofrece la de hoy', () => {
    expect(evaluateStoreAvailability(onlyMorning(), bogota('2026-10-05T10:00'))).toMatchObject({ availableTimeSlots: ['morning'], timeSlotsDate: '2026-10-05' })
  })

  it('apertura manual (sin cierre) también pasa a la próxima fecha con atención', () => {
    expect(evaluateStoreAvailability(onlyMorning({ scheduleOverride: 'open' }), bogota('2026-10-05T21:00')))
      .toMatchObject({ isOpen: true, availableTimeSlots: ['morning'], timeSlotsDate: '2026-10-06' })
  })

  it('configuración sin ninguna franja habilitada: vacío y sin fecha (restricción ajena al horario)', () => {
    const none = onlyMorning({ timeSlots: [
      { id: 'morning', enabled: false, start: '08:00', end: '12:00' },
      { id: 'afternoon', enabled: false, start: '12:00', end: '17:00' },
      { id: 'asap', enabled: false },
    ] })
    const availability = evaluateStoreAvailability(none, afternoon)
    expect(availability.availableTimeSlots).toEqual([])
    expect(availability.timeSlotsDate).toBeUndefined()
    expect(ruleOf(() => resolveOrderReception(none, { deliveryType: 'pickup' }, afternoon))).toBeUndefined()
    expect(ruleOf(() => resolveOrderReception(none, { deliveryType: 'pickup', timeSlot: 'morning' }, afternoon))).toBe('TIME_SLOT_UNAVAILABLE')
  })

  it('franja habilitada que nunca cabe en el horario: vacío sin fecha, distinguible por la configuración', () => {
    const neverFits = onlyMorning({ timeSlots: [
      { id: 'morning', enabled: true, start: '06:00', end: '08:00' },
      { id: 'afternoon', enabled: false, start: '12:00', end: '17:00' },
      { id: 'asap', enabled: false },
    ] })
    expect(evaluateStoreAvailability(neverFits, afternoon)).toMatchObject({ availableTimeSlots: [] })
    expect(evaluateStoreAvailability(neverFits, afternoon).timeSlotsDate).toBeUndefined()
  })
})

describe('fecha de la franja: ciclo semanal completo y fecha autoritativa', () => {
  const full = { open: '08:00', close: '18:00', closed: false }
  const closed = { open: '08:00', close: '18:00', closed: true }
  // Lunes 08–18; martes abre 14:00 (la franja de la mañana no cabe); miércoles 08–18; resto cerrado.
  const lateTuesday = (overrides: Partial<StoreSettingsDto> = {}): StoreSettingsDto => settings({
    weeklySchedule: { mon: full, tue: { open: '14:00', close: '18:00', closed: false }, wed: full, thu: closed, fri: closed, sat: closed, sun: closed },
    delivery: { ...STORE_SEED_SETTINGS.delivery, enabled: false },
    timeSlots: [
      { id: 'morning', enabled: true, start: '08:00', end: '12:00' },
      { id: 'afternoon', enabled: false, start: '12:00', end: '17:00' },
      { id: 'asap', enabled: false },
    ],
    ...overrides,
  })

  it('abierta con la franja vencida y la próxima jornada sin franja compatible: busca la primera fecha que sí cabe', () => {
    const at = bogota('2026-10-05T14:00')
    expect(evaluateStoreAvailability(lateTuesday(), at)).toMatchObject({
      isOpen: true, availableTimeSlots: ['morning'], timeSlotsDate: '2026-10-07',
    })
    const reception = resolveOrderReception(lateTuesday(), { deliveryType: 'pickup', timeSlot: 'morning' }, at)
    expect(reception.processingNotice).toBeUndefined() // abierta: se procesa ya
    expect(reception.timeSlotDate).toBe('2026-10-07')
  })

  it('tras el cierre: el procesamiento sigue en la próxima apertura y la franja cae en una fecha posterior', () => {
    const reception = resolveOrderReception(lateTuesday(), { deliveryType: 'pickup', timeSlot: 'morning' }, bogota('2026-10-05T19:00'))
    expect(reception.processingNotice).toEqual({ kind: 'scheduled', reason: 'after_closing', startsAt: '2026-10-06T19:00:00.000Z' }) // martes 14:00
    expect(reception.timeSlotDate).toBe('2026-10-07') // miércoles: la franja no se arrastra a la fecha de procesamiento
  })

  it('antes de abrir y con franja vigente a la apertura: la fecha de la franja es hoy', () => {
    const reception = resolveOrderReception(lateTuesday(), { deliveryType: 'pickup', timeSlot: 'morning' }, bogota('2026-10-05T06:00'))
    expect(reception.processingNotice).toEqual({ kind: 'scheduled', reason: 'before_opening', startsAt: '2026-10-05T13:00:00.000Z' })
    expect(reception.timeSlotDate).toBe('2026-10-05')
  })

  it('con la franja vigente hoy, la fecha es hoy', () => {
    expect(resolveOrderReception(lateTuesday(), { deliveryType: 'pickup', timeSlot: 'morning' }, bogota('2026-10-05T10:00')).timeSlotDate).toBe('2026-10-05')
  })

  it('sin franja elegida no hay fecha de franja', () => {
    expect(resolveOrderReception(lateTuesday(), { deliveryType: 'pickup' }, bogota('2026-10-05T14:00')).timeSlotDate).toBeUndefined()
  })

  it('una franja habilitada que no cabe en ningún día atendido del ciclo: vacío, sin fecha y la franja se rechaza', () => {
    const neverFits = lateTuesday({
      weeklySchedule: { mon: { open: '13:00', close: '18:00', closed: false }, tue: { open: '14:00', close: '18:00', closed: false }, wed: { open: '13:00', close: '18:00', closed: false }, thu: closed, fri: closed, sat: closed, sun: closed },
    })
    const at = bogota('2026-10-05T14:00')
    const availability = evaluateStoreAvailability(neverFits, at)
    expect(availability.availableTimeSlots).toEqual([])
    expect(availability.timeSlotsDate).toBeUndefined()
    expect(ruleOf(() => resolveOrderReception(neverFits, { deliveryType: 'pickup', timeSlot: 'morning' }, at))).toBe('TIME_SLOT_UNAVAILABLE')
  })

  it('franjas deshabilitadas no se ofrecen en ninguna fecha del ciclo', () => {
    const noMorning = lateTuesday({ timeSlots: [
      { id: 'morning', enabled: false, start: '08:00', end: '12:00' },
      { id: 'afternoon', enabled: false, start: '12:00', end: '17:00' },
      { id: 'asap', enabled: false },
    ] })
    expect(evaluateStoreAvailability(noMorning, bogota('2026-10-05T14:00'))).toMatchObject({ availableTimeSlots: [] })
    expect(evaluateStoreAvailability(noMorning, bogota('2026-10-05T14:00')).timeSlotsDate).toBeUndefined()
  })

  it('cierre manual: no se inventa fecha de franja aunque el horario semanal tenga una compatible', () => {
    const reception = resolveOrderReception(lateTuesday({ scheduleOverride: 'closed' }), { deliveryType: 'pickup', timeSlot: 'morning' }, bogota('2026-10-05T14:00'))
    expect(reception.processingNotice).toEqual({ kind: 'unscheduled', reason: 'override_closed' })
    expect(reception.timeSlotDate).toBeUndefined()
    expect(reception.availability.timeSlotsDate).toBeUndefined()
    expect(reception.availability.availableTimeSlots).toEqual(['morning'])
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
