/*
  Reglas de la tienda para el checkout (T-18).
  Demo: constantes locales de `config/app`. Real: GET /api/store (horario, domicilio, corte, franjas,
  costo de envío y nota de cobertura). El servidor vuelve a validarlo todo al crear el pedido; aquí
  solo se evita ofrecer lo que ya se sabe que va a rechazar.

  Recepción permanente (PM-03): el horario, el día sin atención, el cierre manual y el corte de domicilio
  no bloquean Entrega ni la confirmación; solo un domicilio deshabilitado se deja de ofrecer. El aviso de
  procesamiento lo calcula el servidor y se muestra únicamente tras persistir el pedido.
*/

import { useQuery } from '@tanstack/react-query'
import type { StoreDto } from '@shared/contracts'
import type { TimeSlot } from '@/types/orderService'
import { isDemoMode } from '@/config/mode'
import { PICKUP_SUBTEXT, TIME_SLOT_LABELS, TIME_SLOT_OPTIONS } from '@/config/app'
import { realCatalogService } from '@/services/realCatalogService'
import { DEMO_SHIPPING_RULES, type ShippingRules } from './shipping'

export interface SlotOption {
  value: TimeSlot
  label: string
  description: string
}

export interface CheckoutRules {
  /** `loading` y `error` solo existen en modo real, mientras no hay reglas del servidor. */
  status: 'ready' | 'loading' | 'error'
  acceptsPickup: boolean
  acceptsDelivery: boolean
  /** `null` mientras no se conocen (modo real sin cargar). */
  shipping: ShippingRules | null
  coverageNote: string | null
  /** Franjas compatibles con la fecha en que el servidor procesaría un pedido hecho ahora. */
  slots: readonly SlotOption[]
  /** Día de esas franjas si no son las de hoy («el jueves, 8 de octubre» o «cuando retomemos la atención»). */
  slotsDay: string | null
  /** Por qué no hay ninguna franja de recogida (configuración), o `null` si las hay. */
  slotsEmptyNote: string | null
  slotLabel(slot: TimeSlot): string
  pickupSubtext(slot: TimeSlot): string
  refetch(): void
}

/** Misma nota que el demo mostraba fija: en modo real manda `delivery.coverageNote` del servidor. */
const DEMO_COVERAGE_NOTE = 'Solo hay cobertura en el casco urbano de Dolores'

const SLOT_LABELS_BY_ID = new Map<TimeSlot, string>(TIME_SLOT_OPTIONS.map((option) => [option.value, option.label]))

/** Franjas compatibles con la fecha de procesamiento, con la ventana horaria que configuró la tienda. */
function slotsFrom(store: StoreDto): SlotOption[] {
  return store.availability.availableTimeSlots.map((value) => {
    const config = store.timeSlots.find((slot) => slot.id === value)
    const description = config && 'start' in config ? `${config.start} – ${config.end}` : 'Según disponibilidad'
    return { value, label: SLOT_LABELS_BY_ID.get(value) ?? value, description }
  })
}

const slotLabelIn = (slots: readonly SlotOption[], slot: TimeSlot): string => {
  const found = slots.find((option) => option.value === slot)
  return found && found.value !== 'asap' ? `${found.label} (${found.description})` : (found?.label ?? SLOT_LABELS_BY_ID.get(slot) ?? slot)
}

const dayFormat = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })

/**
 * Día al que se refieren las franjas ofrecidas, dicho con la fecha del servidor (Bogotá) y nunca con
 * «hoy»/«mañana» relativos: la franja «Mañana» es la de la mañana, no el día siguiente. `null` cuando son
 * las de hoy (o no hay franjas). Es la referencia de la franja, no una promesa de recogida.
 */
function slotsDayFrom({ availability }: StoreDto): string | null {
  if (availability.availableTimeSlots.length === 0) return null
  if (availability.timeSlotsDate === undefined) return availability.isOpen ? null : 'cuando retomemos la atención'
  if (availability.timeSlotsDate === availability.localDate) return null
  return `el ${dayFormat.format(new Date(`${availability.timeSlotsDate}T12:00:00Z`))}`
}

/**
 * Sin franjas ofrecidas el servidor no las inventa: es configuración, no el horario de hoy. Se distingue
 * la tienda sin ninguna franja habilitada de las habilitadas cuya ventana no cabe en el horario de atención.
 */
function slotsEmptyNoteFrom(store: StoreDto): string | null {
  if (store.availability.availableTimeSlots.length > 0) return null
  return store.timeSlots.some((slot) => slot.enabled)
    ? 'Las franjas de recogida habilitadas no coinciden con el horario de atención.'
    : 'La tienda no tiene franjas de recogida habilitadas.'
}

export function rulesFromStore(store: StoreDto, refetch: () => void): CheckoutRules {
  const { availability, delivery } = store
  const slots = slotsFrom(store)
  const slotsDay = slotsDayFrom(store)
  return {
    status: 'ready',
    acceptsPickup: availability.acceptsPickup,
    acceptsDelivery: availability.acceptsDelivery,
    shipping: { cost: delivery.shippingCost, freeThreshold: delivery.freeShippingThreshold },
    coverageNote: delivery.coverageNote,
    slots,
    slotsDay,
    slotsEmptyNote: slotsEmptyNoteFrom(store),
    slotLabel: (slot) => slotLabelIn(slots, slot),
    pickupSubtext: (slot) => {
      const config = store.timeSlots.find((candidate) => candidate.id === slot)
      const window = slot !== 'asap' && config && 'start' in config ? `entre ${config.start} y ${config.end}` : 'lo antes posible'
      return `Recoge tu pedido ${window}${slotsDay ? ` · ${slotsDay}` : ''}`
    },
    refetch,
  }
}

const DEMO_RULES: Omit<CheckoutRules, 'refetch'> = {
  status: 'ready',
  acceptsPickup: true,
  acceptsDelivery: true,
  shipping: DEMO_SHIPPING_RULES,
  coverageNote: DEMO_COVERAGE_NOTE,
  slots: TIME_SLOT_OPTIONS,
  slotsDay: null,
  slotsEmptyNote: null,
  slotLabel: (slot) => TIME_SLOT_LABELS[slot],
  pickupSubtext: (slot) => PICKUP_SUBTEXT[slot],
}

/** Reglas del demo (constantes locales); también sirven de fixture estable en pruebas. */
export const DEMO_CHECKOUT_RULES: CheckoutRules = { ...DEMO_RULES, refetch: () => undefined }

/** Sin reglas del servidor (cargando o con error) no se ofrece nada: Entrega explica el motivo y permite reintentar. */
const UNKNOWN_RULES: Omit<CheckoutRules, 'status' | 'refetch'> = {
  acceptsPickup: false,
  acceptsDelivery: false,
  shipping: null,
  coverageNote: null,
  slots: [],
  slotsDay: null,
  slotsEmptyNote: null,
  slotLabel: (slot) => SLOT_LABELS_BY_ID.get(slot) ?? slot,
  pickupSubtext: () => 'Elige cuándo quieres recogerlo',
}

/** Reglas vigentes de la tienda; se refrescan al volver a la pestaña para reflejar cambios de configuración y franjas. */
export function useCheckoutRules(): CheckoutRules {
  const query = useQuery({
    queryKey: ['store'],
    queryFn: ({ signal }) => realCatalogService.getStore({ signal }),
    enabled: !isDemoMode(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
  const refetch = () => { void query.refetch() }
  if (isDemoMode()) return { ...DEMO_RULES, refetch }
  if (query.data) return rulesFromStore(query.data, refetch)
  return { ...UNKNOWN_RULES, status: query.isError ? 'error' : 'loading', refetch }
}
