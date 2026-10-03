/*
  Reglas de la tienda para el checkout (T-18).
  Demo: constantes locales de `config/app`. Real: GET /api/store (horario, domicilio, corte, franjas,
  costo de envío y nota de cobertura). El servidor vuelve a validarlo todo al crear el pedido; aquí
  solo se evita ofrecer lo que ya se sabe que va a rechazar.
*/

import { useQuery } from '@tanstack/react-query'
import type { StoreClosedReason, StoreDto } from '@shared/contracts'
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
  isOpen: boolean
  closedReason: StoreClosedReason | undefined
  acceptsPickup: boolean
  acceptsDelivery: boolean
  /** `null` mientras no se conocen (modo real sin cargar). */
  shipping: ShippingRules | null
  coverageNote: string | null
  /** Franjas que el servidor aún acepta hoy. */
  slots: readonly SlotOption[]
  slotLabel(slot: TimeSlot): string
  pickupSubtext(slot: TimeSlot): string
  refetch(): void
}

/** Misma nota que el demo mostraba fija: en modo real manda `delivery.coverageNote` del servidor. */
const DEMO_COVERAGE_NOTE = 'Solo hay cobertura en el casco urbano de Dolores'

const CLOSED_MESSAGES: Record<StoreClosedReason, string> = {
  override_closed: 'La tienda está cerrada por ahora.',
  day_closed: 'Hoy la tienda no atiende.',
  before_opening: 'La tienda aún no abre.',
  after_closing: 'La tienda ya cerró por hoy.',
}

export const closedMessage = (reason: StoreClosedReason | undefined): string =>
  reason ? CLOSED_MESSAGES[reason] : 'La tienda está cerrada en este momento.'

const SLOT_LABELS_BY_ID = new Map<TimeSlot, string>(TIME_SLOT_OPTIONS.map((option) => [option.value, option.label]))

/** Franjas disponibles hoy con la ventana horaria que configuró la tienda. */
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

export function rulesFromStore(store: StoreDto, refetch: () => void): CheckoutRules {
  const { availability, delivery } = store
  const slots = slotsFrom(store)
  return {
    status: 'ready',
    isOpen: availability.isOpen,
    closedReason: availability.closedReason,
    acceptsPickup: availability.acceptsPickup,
    acceptsDelivery: availability.acceptsDelivery,
    shipping: { cost: delivery.shippingCost, freeThreshold: delivery.freeShippingThreshold },
    coverageNote: delivery.coverageNote,
    slots,
    slotLabel: (slot) => slotLabelIn(slots, slot),
    pickupSubtext: (slot) => `Recoge ${slot === 'asap' ? 'lo antes posible' : `tu pedido ${slotLabelIn(slots, slot).toLowerCase()}`}`,
    refetch,
  }
}

const DEMO_RULES: Omit<CheckoutRules, 'refetch'> = {
  status: 'ready',
  isOpen: true,
  closedReason: undefined,
  acceptsPickup: true,
  acceptsDelivery: true,
  shipping: DEMO_SHIPPING_RULES,
  coverageNote: DEMO_COVERAGE_NOTE,
  slots: TIME_SLOT_OPTIONS,
  slotLabel: (slot) => TIME_SLOT_LABELS[slot],
  pickupSubtext: (slot) => PICKUP_SUBTEXT[slot],
}

/** Reglas del demo (constantes locales); también sirven de fixture estable en pruebas. */
export const DEMO_CHECKOUT_RULES: CheckoutRules = { ...DEMO_RULES, refetch: () => undefined }

const UNKNOWN_RULES: Omit<CheckoutRules, 'status' | 'refetch'> = {
  isOpen: false,
  closedReason: undefined,
  acceptsPickup: false,
  acceptsDelivery: false,
  shipping: null,
  coverageNote: null,
  slots: [],
  slotLabel: (slot) => SLOT_LABELS_BY_ID.get(slot) ?? slot,
  pickupSubtext: () => 'Elige cuándo quieres recogerlo',
}

/** Reglas vigentes de la tienda; se refrescan al volver a la pestaña para reflejar cierres y cortes. */
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
