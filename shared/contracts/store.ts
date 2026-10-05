import { z } from 'zod'
import { canonicalMobileSchema, copAmountSchema, entityIdSchema, isoUtcSchema, mobileInputSchema } from './common.js'
import { TIME_SLOT_VALUES } from './orderEnums.js'

/**
 * Configuración pública de la tienda y reglas de entrega (T-08). La consumen PWA y admin;
 * el servidor evalúa horario, corte y franjas con su reloj en `STORE_TIME_ZONE`.
 *
 * Cobertura: solo una nota informativa (`delivery.coverageNote`). NO hay verificación
 * geográfica automática: el GPS es opcional, no hay geocerca ni selector de zona, y una
 * dirección escrita no se geocodifica. La nota se muestra al elegir domicilio.
 */

/** Zona horaria explícita de la tienda; Colombia no tiene horario de verano. */
export const STORE_TIME_ZONE = 'America/Bogota' as const

export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number]

/** `auto` sigue el horario; `open`/`closed` lo ignoran hasta volver a `auto` (igual que el admin). */
export const SCHEDULE_OVERRIDE_VALUES = ['auto', 'open', 'closed'] as const
export type ScheduleOverride = (typeof SCHEDULE_OVERRIDE_VALUES)[number]

/**
 * Número de relleno del demo. La PWA ya lo oculta como inválido; el servidor tampoco lo
 * acepta como contacto: sin número real, `contactPhone` es `null`.
 */
export const PLACEHOLDER_CONTACT_PHONE = '573000000000'

export const STORE_LIMITS = {
  nameMaxLength: 80,
  addressMaxLength: 200,
  coverageNoteMaxLength: 200,
} as const

const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** Fecha civil local `YYYY-MM-DD` en `STORE_TIME_ZONE`. */
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Hora local 24 h `HH:MM` en `STORE_TIME_ZONE`. */
export const localTimeSchema = z.string().regex(LOCAL_TIME_PATTERN, 'Hora en formato HH:MM (00:00–23:59)')

export const minutesOfDay = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}

/** Igual que `DayHours` del admin. `open`/`close` se ignoran si `closed`; no hay horarios nocturnos. */
export const dayHoursSchema = z
  .object({ open: localTimeSchema, close: localTimeSchema, closed: z.boolean() })
  .strict()
  .superRefine((day, ctx) => {
    if (!day.closed && minutesOfDay(day.close) <= minutesOfDay(day.open)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['close'], message: 'El cierre debe ser posterior a la apertura' })
    }
  })

export const weeklyScheduleSchema = z
  .object({
    mon: dayHoursSchema,
    tue: dayHoursSchema,
    wed: dayHoursSchema,
    thu: dayHoursSchema,
    fri: dayHoursSchema,
    sat: dayHoursSchema,
    sun: dayHoursSchema,
  })
  .strict()

/**
 * Franja de entrega/recogida del día. `morning`/`afternoon` tienen ventana `start`–`end`
 * y dejan de ofrecerse al llegar `end` o el cierre; `asap` no tiene ventana.
 */
const windowedSlotSchema = z
  .object({
    id: z.enum(['morning', 'afternoon']),
    enabled: z.boolean(),
    start: localTimeSchema,
    end: localTimeSchema,
  })
  .strict()
  .superRefine((slot, ctx) => {
    if (minutesOfDay(slot.end) <= minutesOfDay(slot.start)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end'], message: 'La franja debe terminar después de empezar' })
    }
  })

const asapSlotSchema = z.object({ id: z.literal('asap'), enabled: z.boolean() }).strict()

export const timeSlotConfigSchema = z.union([windowedSlotSchema, asapSlotSchema])

/** Exactamente una entrada por franja del contrato de pedidos (`TIME_SLOT_VALUES`). */
export const timeSlotsSchema = z
  .array(timeSlotConfigSchema)
  .length(TIME_SLOT_VALUES.length)
  .superRefine((slots, ctx) => {
    const ids = new Set(slots.map((slot) => slot.id))
    if (ids.size !== slots.length || TIME_SLOT_VALUES.some((id) => !ids.has(id))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Se requiere una franja por cada valor: ${TIME_SLOT_VALUES.join(', ')}` })
    }
  })

const contactPhoneOutputSchema = canonicalMobileSchema.refine(
  (phone) => phone !== PLACEHOLDER_CONTACT_PHONE,
  'El número de relleno no es un contacto válido',
)

/** Entrada legible (`+57 310 …`) normalizada a canónico; rechaza el número de relleno. */
export const contactPhoneInputSchema = z.string().max(32).pipe(mobileInputSchema).pipe(contactPhoneOutputSchema)

const coverageNoteSchema = z.string().trim().min(1).max(STORE_LIMITS.coverageNoteMaxLength)

/** Envío solo aplica a domicilio; recogida nunca cobra envío. */
export const deliverySettingsSchema = z
  .object({
    /** Domicilio disponible (la recogida depende solo del horario). */
    enabled: z.boolean(),
    shippingCost: copAmountSchema,
    /** Subtotal de ítems (COP) desde el cual el envío es 0; `null` = nunca gratis. */
    freeShippingThreshold: copAmountSchema.min(1).nullable(),
    /** Hora local tras la cual no se aceptan domicilios del día; `null` = hasta el cierre. */
    cutoff: localTimeSchema.nullable(),
    coverageNote: coverageNoteSchema.nullable(),
  })
  .strict()

const storeNameSchema = z.string().trim().min(2).max(STORE_LIMITS.nameMaxLength)
const storeAddressSchema = z.string().trim().min(1).max(STORE_LIMITS.addressMaxLength)

/** Configuración persistida editable por el owner. */
export const storeSettingsSchema = z
  .object({
    name: storeNameSchema,
    /** WhatsApp/teléfono canónico (`57` + móvil) apto para `wa.me`; `null` si no está configurado. */
    contactPhone: contactPhoneOutputSchema.nullable(),
    address: storeAddressSchema,
    timeZone: z.literal(STORE_TIME_ZONE),
    weeklySchedule: weeklyScheduleSchema,
    scheduleOverride: z.enum(SCHEDULE_OVERRIDE_VALUES),
    delivery: deliverySettingsSchema,
    timeSlots: timeSlotsSchema,
  })
  .strict()

/**
 * PATCH /api/store/staff (solo owner). Parcial; `delivery` también es parcial. Horario y
 * franjas se reemplazan completos. `timeZone`, `storeId` y fechas no son editables.
 */
export const updateStoreSettingsRequestSchema = z
  .object({
    name: storeNameSchema.optional(),
    contactPhone: contactPhoneInputSchema.nullable().optional(),
    address: storeAddressSchema.optional(),
    weeklySchedule: weeklyScheduleSchema.optional(),
    scheduleOverride: z.enum(SCHEDULE_OVERRIDE_VALUES).optional(),
    delivery: deliverySettingsSchema
      .partial()
      .strict()
      .refine((patch) => Object.keys(patch).length > 0, 'Se requiere al menos un campo')
      .optional(),
    timeSlots: timeSlotsSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Se requiere al menos un campo')

/** Motivo por el que la tienda no está atendiendo ahora (el horario es operativo; no bloquea pedidos). */
export const STORE_CLOSED_REASONS = ['override_closed', 'day_closed', 'before_opening', 'after_closing'] as const
export type StoreClosedReason = (typeof STORE_CLOSED_REASONS)[number]

/**
 * Por qué un pedido recibido no se procesa de inmediato: la tienda no atiende (`StoreClosedReason`)
 * o es un domicilio posterior a la hora de corte del día (`delivery_cutoff`).
 */
export const ORDER_PROCESSING_DEFERRAL_REASONS = [...STORE_CLOSED_REASONS, 'delivery_cutoff'] as const
export type OrderProcessingDeferralReason = (typeof ORDER_PROCESSING_DEFERRAL_REASONS)[number]

/**
 * Aviso de procesamiento fijado por el servidor al persistir un pedido recibido fuera de atención;
 * ausente si se recibió atendiendo. Indica cuándo el equipo empieza a procesarlo, nunca cuándo se
 * entrega o se puede recoger. Es un snapshot inmutable: cambios posteriores del horario no lo alteran.
 *  - `scheduled`: próxima apertura (`startsAt`, ISO UTC) calculada con el horario en `STORE_TIME_ZONE`.
 *  - `unscheduled`: sin hora conocida (cierre manual sin reapertura o horario sin días de atención).
 */
export const orderProcessingNoticeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scheduled'), reason: z.enum(ORDER_PROCESSING_DEFERRAL_REASONS), startsAt: isoUtcSchema }).strict(),
  z.object({ kind: z.literal('unscheduled'), reason: z.enum(ORDER_PROCESSING_DEFERRAL_REASONS) }).strict(),
])

/**
 * Estado calculado en el servidor en el instante `evaluatedAt`; no se persiste. `isOpen` es
 * informativo (atención del personal): no condiciona `acceptsPickup`/`acceptsDelivery`, que indican
 * si la modalidad se ofrece. Recogida siempre se recibe; domicilio solo si no está deshabilitado.
 */
export const storeAvailabilitySchema = z
  .object({
    evaluatedAt: isoUtcSchema,
    /** Fecha y hora locales en `STORE_TIME_ZONE`. */
    localDate: localDateSchema,
    localTime: localTimeSchema,
    weekday: z.enum(WEEKDAY_KEYS),
    isOpen: z.boolean(),
    closedReason: z.enum(STORE_CLOSED_REASONS).optional(),
    acceptsPickup: z.boolean(),
    acceptsDelivery: z.boolean(),
    /**
     * Franjas habilitadas compatibles con un pedido de recogida hecho ahora: las vigentes hoy si las hay;
     * si no (tienda sin atender o franjas de hoy vencidas), las de la próxima fecha con atención, sin
     * exigir una franja vencida. Vacío solo si ninguna franja habilitada es compatible con el horario.
     */
    availableTimeSlots: z.array(z.enum(TIME_SLOT_VALUES)),
    /**
     * Fecha local (`YYYY-MM-DD`) a la que corresponden `availableTimeSlots`: `localDate` si hay franjas
     * vigentes hoy o la del próximo día con atención si no. Ausente si no hay franjas o la reapertura es
     * desconocida (cierre manual u horario sin días de atención). Es una referencia de la franja, no una
     * promesa de entrega o recogida.
     */
    timeSlotsDate: localDateSchema.optional(),
  })
  .strict()

/** GET /api/store (público) y GET /api/store/staff. */
export const storeDtoSchema = z
  .object({
    storeId: entityIdSchema,
    ...storeSettingsSchema.shape,
    availability: storeAvailabilitySchema,
    updatedAt: isoUtcSchema,
  })
  .strict()

export type DayHoursDto = z.infer<typeof dayHoursSchema>
export type WeeklyScheduleDto = z.infer<typeof weeklyScheduleSchema>
export type TimeSlotConfigDto = z.infer<typeof timeSlotConfigSchema>
export type DeliverySettingsDto = z.infer<typeof deliverySettingsSchema>
export type StoreSettingsDto = z.infer<typeof storeSettingsSchema>
export type UpdateStoreSettingsRequest = z.infer<typeof updateStoreSettingsRequestSchema>
export type OrderProcessingNoticeDto = z.infer<typeof orderProcessingNoticeSchema>
export type StoreAvailabilityDto = z.infer<typeof storeAvailabilitySchema>
export type StoreDto = z.infer<typeof storeDtoSchema>
