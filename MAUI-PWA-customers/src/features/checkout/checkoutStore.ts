import { create } from 'zustand'
import type { TimeSlot, SubstitutionPref } from '@/types/orderService'
import type { CartItem as CartStoreItem } from '@/types/cart'
import type { CartItem as OrderItem } from '@/types/orderService'

// ─── Domain types ────────────────────────────────────────────────────────────

export type { TimeSlot, SubstitutionPref } from '@/types/orderService'
export type DeliveryMode = 'pickup' | 'delivery'

// ─── State ───────────────────────────────────────────────────────────────────

interface CheckoutState {
  deliveryMode: DeliveryMode | null
  timeSlot: TimeSlot | null
  address: string | null
  lat: number | null
  lng: number | null
  customerPhone: string | null
  substitutionPref: SubstitutionPref | null
  customerName: string | null
  isSubmitting: boolean
}

// ─── Actions ─────────────────────────────────────────────────────────────────

interface CheckoutActions {
  setDeliveryMode: (mode: DeliveryMode) => void
  setTimeSlot: (slot: TimeSlot) => void
  setAddress: (address: string) => void
  setCoordinates: (lat: number, lng: number) => void
  setCustomerPhone: (phone: string) => void
  setSubstitutionPref: (pref: SubstitutionPref) => void
  setCustomerName: (name: string) => void
  setSubmitting: (isSubmitting: boolean) => void
  reset: () => void
}

type CheckoutStore = CheckoutState & CheckoutActions

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: CheckoutState = {
  deliveryMode: null,
  timeSlot: null,
  address: null,
  lat: null,
  lng: null,
  customerPhone: null,
  substitutionPref: 'similar',
  customerName: null,
  isSubmitting: false,
}

// ─── Store — DD-3: ephemeral, no persist middleware ───────────────────────────

export const useCheckoutStore = create<CheckoutStore>((set) => ({
  ...initialState,

  setDeliveryMode: (mode) => {
    if (mode === 'pickup') {
      // pickup: keep timeSlot, clear location fields
      set({ deliveryMode: mode, address: null, lat: null, lng: null })
    } else {
      // delivery: keep address/lat/lng, clear timeSlot
      set({ deliveryMode: mode, timeSlot: null })
    }
  },

  setTimeSlot: (slot) => set({ timeSlot: slot }),

  setAddress: (address) => set({ address }),

  setCoordinates: (lat, lng) => set({ lat, lng }),

  setCustomerPhone: (phone) => set({ customerPhone: phone }),

  setSubstitutionPref: (pref) => set({ substitutionPref: pref }),

  setCustomerName: (name) => set({ customerName: name }),

  setSubmitting: (isSubmitting) => set({ isSubmitting }),

  reset: () => set(initialState),
}))

// ─── Derived selectors ────────────────────────────────────────────────────────

/** True when delivery details alone are complete (step 1 gate — no substitutionPref required). */
export function useIsDeliveryReady(): boolean {
  return useCheckoutStore((s) => {
    if (s.deliveryMode === null || normalizeCustomerPhone(s.customerPhone) === null) return false
    if (s.deliveryMode === 'pickup') return s.timeSlot !== null
    return hasDeliveryLocation(s)
  })
}

/** True when all required fields for final submission are filled in. */
export function useIsCheckoutReady(): boolean {
  return useCheckoutStore((s) => {
    if (s.deliveryMode === null || s.substitutionPref === null || normalizeCustomerPhone(s.customerPhone) === null) return false
    if (s.deliveryMode === 'pickup') return s.timeSlot !== null
    return hasDeliveryLocation(s)
  })
}

/** Normalized Colombian mobile number for persisted orders and contact links. */
export function normalizeCustomerPhone(value: string | null | undefined): string | null {
  const input = value?.trim() ?? ''
  if (!/^\+?[\d\s()-]+$/.test(input)) return null
  const digits = input.replace(/\D/g, '')
  const local = digits.startsWith('57') && digits.length === 12 ? digits.slice(2) : digits
  return /^3\d{9}$/.test(local) ? `57${local}` : null
}

function hasDeliveryLocation(state: CheckoutState): boolean {
  const hasAddress = Boolean(state.address?.trim())
  const hasCoordinates = state.lat !== null && state.lng !== null &&
    Number.isFinite(state.lat) && Number.isFinite(state.lng) &&
    Math.abs(state.lat) <= 90 && Math.abs(state.lng) <= 180
  return hasAddress || hasCoordinates
}

/** Preserve the cart's price snapshot while representing kilograms explicitly. */
export function mapCartItemsToOrderItems(items: CartStoreItem[]): OrderItem[] {
  return items.map((item) => item.is_variable_weight
    ? {
        id: item.productId,
        qty: 1,
        priceAtMoment: item.price_at_moment,
        is_variable_weight: true,
        kilosRequested: item.kilos ?? 1,
      }
    : {
        id: item.productId,
        qty: item.quantity,
        priceAtMoment: item.price_at_moment,
      })
}
