import { create } from 'zustand'
import type { TimeSlot, SubstitutionPref } from '@/types/orderService'

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
  substitutionPref: SubstitutionPref | null
  customerName: string | null
  isSubmitting: boolean
}

// ─── Actions ─────────────────────────────────────────────────────────────────

interface CheckoutActions {
  setDeliveryMode: (mode: DeliveryMode) => void
  setTimeSlot: (slot: TimeSlot) => void
  setAddress: (address: string, lat?: number, lng?: number) => void
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

  setAddress: (address, lat = null, lng = null) =>
    set({ address, lat, lng }),

  setSubstitutionPref: (pref) => set({ substitutionPref: pref }),

  setCustomerName: (name) => set({ customerName: name }),

  setSubmitting: (isSubmitting) => set({ isSubmitting }),

  reset: () => set(initialState),
}))

// ─── Derived selectors ────────────────────────────────────────────────────────

/** True when delivery details alone are complete (step 1 gate — no substitutionPref required). */
export function useIsDeliveryReady(): boolean {
  return useCheckoutStore((s) => {
    if (s.deliveryMode === null) return false
    if (s.deliveryMode === 'pickup') return s.timeSlot !== null
    return s.address !== null && s.address.trim() !== ''
  })
}

/** True when all required fields for final submission are filled in. */
export function useIsCheckoutReady(): boolean {
  return useCheckoutStore((s) => {
    if (s.deliveryMode === null || s.substitutionPref === null) return false
    if (s.deliveryMode === 'pickup') return s.timeSlot !== null
    return s.address !== null && s.address.trim() !== ''
  })
}
