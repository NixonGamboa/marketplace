import { create } from 'zustand'

// ─── Domain types ────────────────────────────────────────────────────────────

export type DeliveryMode = 'pickup' | 'delivery'
export type TimeSlot = 'morning' | 'afternoon' | 'asap'
export type SubstitutionPref = 'call_me' | 'similar' | 'remove'

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
  substitutionPref: null,
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

// ─── Derived selector ─────────────────────────────────────────────────────────

/**
 * Returns true when the minimum required fields for checkout submission are
 * filled in, based on the selected delivery mode:
 *   - deliveryMode is always required
 *   - substitutionPref is always required
 *   - pickup requires a timeSlot
 *   - delivery requires an address
 */
export function useIsCheckoutReady(): boolean {
  return useCheckoutStore((s) => {
    if (s.deliveryMode === null || s.substitutionPref === null) return false
    if (s.deliveryMode === 'pickup') return s.timeSlot !== null
    return s.address !== null
  })
}
