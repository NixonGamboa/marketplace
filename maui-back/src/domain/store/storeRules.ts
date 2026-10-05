import {
  minutesOfDay,
  type DeliverySettingsDto,
  type DeliveryType,
  type OrderProcessingDeferralReason,
  type OrderProcessingNoticeDto,
  type StoreAvailabilityDto,
  type StoreSettingsDto,
  type TimeSlot,
} from '../../../../shared/contracts/index.js'
import { StoreRuleError } from './errors.js'
import { localMomentIn, type LocalMoment } from './storeCalendar.js'
import { attendedOpenings, closedReasonOf, enabledSlots, slotsAvailableAt, type NextOpening } from './storeSchedule.js'

type AvailabilitySettings = Pick<
  StoreSettingsDto,
  'timeZone' | 'weeklySchedule' | 'scheduleOverride' | 'delivery' | 'timeSlots'
>

/**
 * Cuándo se procesará un pedido recibido ahora y qué franjas son compatibles con esa fecha.
 * Recepción y atención son independientes: recibir nunca depende del horario (PM-03).
 */
interface ReceptionPlan {
  /** Ausente si el pedido se recibe atendiendo y se procesa de inmediato. */
  processingNotice?: OrderProcessingNoticeDto
  availableTimeSlots: TimeSlot[]
  /** Fecha local a la que corresponden las franjas; ausente si no hay franjas o la fecha es desconocida. */
  timeSlotsDate?: string
}

/**
 * Franjas de la primera fecha con atención en que alguna franja habilitada cabe en el horario de ese día.
 * La fecha de la franja puede ser posterior a la próxima apertura (que sigue fijando cuándo se procesa).
 * Vacío solo si ninguna franja habilitada cabe en ningún día atendido del ciclo semanal.
 */
const slotsOnFirstFittingDate = (
  settings: AvailabilitySettings,
  openings: readonly NextOpening[],
): Pick<ReceptionPlan, 'availableTimeSlots' | 'timeSlotsDate'> => {
  for (const opening of openings) {
    const availableTimeSlots = slotsAvailableAt(settings.timeSlots, opening.opensAt, opening.closesAt)
    if (availableTimeSlots.length > 0) return { availableTimeSlots, timeSlotsDate: opening.date }
  }
  return { availableTimeSlots: [] }
}

/** Sin fecha de reapertura conocida: franjas habilitadas, sin fecha concreta. */
const slotsWithoutDate = (settings: AvailabilitySettings): Pick<ReceptionPlan, 'availableTimeSlots'> =>
  ({ availableTimeSlots: enabledSlots(settings.timeSlots) })

const planReception = (
  settings: AvailabilitySettings,
  deliveryType: DeliveryType,
  local: LocalMoment,
): ReceptionPlan => {
  const day = settings.weeklySchedule[local.weekday]
  const closedReason = closedReasonOf(settings.scheduleOverride, day, local.minutes)
  const cutoffPassed = settings.delivery.cutoff !== null && local.minutes >= minutesOfDay(settings.delivery.cutoff)
  const reason: OrderProcessingDeferralReason | undefined =
    closedReason ?? (deliveryType === 'delivery' && cutoffPassed ? 'delivery_cutoff' : undefined)

  if (reason === undefined) {
    const closesAt = settings.scheduleOverride === 'open' ? null : minutesOfDay(day.close)
    const today = slotsAvailableAt(settings.timeSlots, local.minutes, closesAt)
    if (today.length > 0) return { availableTimeSlots: today, timeSlotsDate: local.date }
    // Atendiendo pero con las franjas habilitadas ya vencidas hoy: no se exige una vencida y se ofrecen
    // las de la próxima fecha con atención (sin aviso: el pedido se procesa ya). Si ninguna franja está
    // habilitada o ninguna cabe en el horario, queda vacío: es configuración, no el horario de hoy.
    const openings = attendedOpenings(settings.weeklySchedule, local, settings.timeZone, false)
    return openings.length === 0 ? slotsWithoutDate(settings) : slotsOnFirstFittingDate(settings, openings)
  }
  // Un cierre manual no tiene fecha de reapertura: no se inventa una hora ni una fecha de franja.
  const openings = reason === 'override_closed'
    ? []
    : attendedOpenings(settings.weeklySchedule, local, settings.timeZone, reason === 'before_opening')
  const [nextOpening] = openings
  if (nextOpening === undefined) return { processingNotice: { kind: 'unscheduled', reason }, ...slotsWithoutDate(settings) }
  // El procesamiento empieza en la próxima apertura; la franja puede caer en una fecha posterior.
  return {
    processingNotice: { kind: 'scheduled', reason, startsAt: nextOpening.startsAt.toISOString() },
    ...slotsOnFirstFittingDate(settings, openings),
  }
}

/**
 * Disponibilidad en el instante `now`, calculada en la zona horaria de la tienda. Intervalos
 * `[apertura, cierre)`: a la hora exacta de cierre ya está cerrada (informativo). Los pedidos se
 * reciben siempre: la recogida se ofrece siempre y el domicilio mientras no esté deshabilitado;
 * el horario y el corte solo determinan cuándo se procesa (`resolveOrderReception`).
 */
export const evaluateStoreAvailability = (settings: AvailabilitySettings, now: Date): StoreAvailabilityDto => {
  const local = localMomentIn(now, settings.timeZone)
  const closedReason = closedReasonOf(settings.scheduleOverride, settings.weeklySchedule[local.weekday], local.minutes)
  const { availableTimeSlots, timeSlotsDate } = planReception(settings, 'pickup', local)

  return {
    evaluatedAt: now.toISOString(),
    localDate: local.date,
    localTime: local.time,
    weekday: local.weekday,
    isOpen: closedReason === undefined,
    ...(closedReason === undefined ? {} : { closedReason }),
    acceptsPickup: true,
    acceptsDelivery: settings.delivery.enabled,
    availableTimeSlots,
    ...(timeSlotsDate === undefined ? {} : { timeSlotsDate }),
  }
}

export interface OrderReceptionRequest {
  deliveryType: DeliveryType
  timeSlot?: TimeSlot | undefined
}

export interface OrderReception {
  availability: StoreAvailabilityDto
  processingNotice?: OrderProcessingNoticeDto
  /** Fecha local de la franja elegida; solo con franja y fecha conocida. La fija el servidor, nunca el cliente. */
  timeSlotDate?: string
}

/**
 * Valida en servidor que el pedido pueda recibirse y fija su aviso de procesamiento. Solo rechaza
 * un domicilio deshabilitado y una franja incompatible con la fecha de procesamiento; cierre,
 * día sin atención, override y corte de domicilio no impiden recibirlo. Lanza `StoreRuleError`.
 */
export const resolveOrderReception = (
  settings: AvailabilitySettings,
  request: OrderReceptionRequest,
  now: Date,
): OrderReception => {
  const availability = evaluateStoreAvailability(settings, now)
  if (request.deliveryType === 'delivery' && !availability.acceptsDelivery) {
    throw new StoreRuleError('DELIVERY_UNAVAILABLE', 'El domicilio no está disponible; puede recoger en tienda')
  }
  const plan = planReception(settings, request.deliveryType, localMomentIn(now, settings.timeZone))
  if (request.timeSlot !== undefined && !plan.availableTimeSlots.includes(request.timeSlot)) {
    throw new StoreRuleError('TIME_SLOT_UNAVAILABLE', 'La franja elegida no está disponible')
  }
  return {
    availability,
    ...(plan.processingNotice === undefined ? {} : { processingNotice: plan.processingNotice }),
    ...(request.timeSlot === undefined || plan.timeSlotsDate === undefined ? {} : { timeSlotDate: plan.timeSlotsDate }),
  }
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
