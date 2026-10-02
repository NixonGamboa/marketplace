import {
  minutesOfDay,
  type DayHoursDto,
  type DeliverySettingsDto,
  type DeliveryType,
  type ScheduleOverride,
  type StoreAvailabilityDto,
  type StoreClosedReason,
  type StoreSettingsDto,
  type TimeSlot,
  type TimeSlotConfigDto,
} from '../../../../shared/contracts/index.js'
import { StoreRuleError } from './errors.js'
import { localMomentIn } from './storeCalendar.js'

type AvailabilitySettings = Pick<
  StoreSettingsDto,
  'timeZone' | 'weeklySchedule' | 'scheduleOverride' | 'delivery' | 'timeSlots'
>

const closedReasonOf = (
  override: ScheduleOverride,
  day: DayHoursDto,
  minutes: number,
): StoreClosedReason | undefined => {
  if (override === 'closed') return 'override_closed'
  if (override === 'open') return undefined
  if (day.closed) return 'day_closed'
  if (minutes < minutesOfDay(day.open)) return 'before_opening'
  if (minutes >= minutesOfDay(day.close)) return 'after_closing'
  return undefined
}

/**
 * Una franja con ventana se ofrece mientras su fin (o el cierre, si llega antes) no haya
 * pasado y empiece antes del cierre. `closesAt` es `null` con apertura manual (`open`).
 */
const isSlotAvailable = (slot: TimeSlotConfigDto, minutes: number, closesAt: number | null): boolean => {
  if (!slot.enabled) return false
  if (slot.id === 'asap') return true
  const end = closesAt === null ? minutesOfDay(slot.end) : Math.min(minutesOfDay(slot.end), closesAt)
  const startsBeforeClose = closesAt === null || minutesOfDay(slot.start) < closesAt
  return startsBeforeClose && minutes < end
}

/**
 * Disponibilidad en el instante `now`, calculada en la zona horaria de la tienda. Intervalos
 * `[apertura, cierre)`: a la hora exacta de cierre ya está cerrada. El corte de domicilio
 * también es exclusivo: a la hora de corte ya no se aceptan domicilios. La recogida solo
 * depende de que la tienda esté abierta.
 */
export const evaluateStoreAvailability = (settings: AvailabilitySettings, now: Date): StoreAvailabilityDto => {
  const local = localMomentIn(now, settings.timeZone)
  const day = settings.weeklySchedule[local.weekday]
  const closedReason = closedReasonOf(settings.scheduleOverride, day, local.minutes)
  const isOpen = closedReason === undefined
  const closesAt = settings.scheduleOverride === 'open' ? null : minutesOfDay(day.close)
  const cutoffPassed = settings.delivery.cutoff !== null && local.minutes >= minutesOfDay(settings.delivery.cutoff)

  return {
    evaluatedAt: now.toISOString(),
    localDate: local.date,
    localTime: local.time,
    weekday: local.weekday,
    isOpen,
    ...(closedReason === undefined ? {} : { closedReason }),
    acceptsPickup: isOpen,
    acceptsDelivery: isOpen && settings.delivery.enabled && !cutoffPassed,
    availableTimeSlots: isOpen
      ? settings.timeSlots.filter((slot) => isSlotAvailable(slot, local.minutes, closesAt)).map((slot) => slot.id)
      : [],
  }
}

export interface OrderPlacementRequest {
  deliveryType: DeliveryType
  timeSlot?: TimeSlot | undefined
}

/**
 * Valida en servidor que la tienda pueda recibir el pedido ahora: abierta, domicilio
 * habilitado y antes del corte, y franja vigente si se eligió. Lanza `StoreRuleError`.
 */
export const assertOrderPlacementAllowed = (
  settings: AvailabilitySettings,
  request: OrderPlacementRequest,
  now: Date,
): StoreAvailabilityDto => {
  const availability = evaluateStoreAvailability(settings, now)
  if (!availability.isOpen) throw new StoreRuleError('STORE_CLOSED', 'La tienda está cerrada en este momento')

  if (request.deliveryType === 'delivery' && !availability.acceptsDelivery) {
    if (!settings.delivery.enabled) {
      throw new StoreRuleError('DELIVERY_UNAVAILABLE', 'El domicilio no está disponible; puede recoger en tienda')
    }
    throw new StoreRuleError(
      'DELIVERY_CUTOFF_PASSED',
      `Los domicilios de hoy se reciben hasta las ${settings.delivery.cutoff ?? 'el cierre'}`,
    )
  }
  if (request.timeSlot !== undefined && !availability.availableTimeSlots.includes(request.timeSlot)) {
    throw new StoreRuleError('TIME_SLOT_UNAVAILABLE', 'La franja elegida ya no está disponible hoy')
  }
  return availability
}

export interface ShippingQuote {
  shippingCost: number
  freeShippingApplied: boolean
}

/**
 * Envío del pedido. Recogida nunca cobra envío. En domicilio es gratis cuando el subtotal de
 * ítems alcanza el umbral. `itemsSubtotal` debe calcularse en el servidor con precios del
 * catálogo (T-10); nunca es el subtotal que envía el cliente.
 */
export const quoteShipping = (
  delivery: Pick<DeliverySettingsDto, 'shippingCost' | 'freeShippingThreshold'>,
  deliveryType: DeliveryType,
  itemsSubtotal: number,
): ShippingQuote => {
  if (!Number.isSafeInteger(itemsSubtotal) || itemsSubtotal < 0) {
    throw new RangeError('El subtotal debe ser un entero COP no negativo')
  }
  if (deliveryType === 'pickup') return { shippingCost: 0, freeShippingApplied: false }
  const free = delivery.freeShippingThreshold !== null && itemsSubtotal >= delivery.freeShippingThreshold
  return { shippingCost: free ? 0 : delivery.shippingCost, freeShippingApplied: free }
}
