// Utilidades SOLO para pruebas del checkout: tienda abierta con las tres franjas y proveedor de consultas.
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { StoreDto } from '@shared/contracts'

const day = { open: '08:00', close: '18:00', closed: false }

export const openStoreDto = (overrides: Partial<StoreDto> = {}): StoreDto => ({
  storeId: 'store-1',
  name: 'Leche & Miel',
  contactPhone: '573105550101',
  address: 'Calle 1 # 2-3, Dolores',
  timeZone: 'America/Bogota',
  weeklySchedule: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: { ...day, closed: true } },
  scheduleOverride: 'auto',
  delivery: { enabled: true, shippingCost: 3000, freeShippingThreshold: 30000, cutoff: '17:00', coverageNote: 'Solo hay cobertura en el casco urbano de Dolores' },
  timeSlots: [
    { id: 'morning', enabled: true, start: '08:00', end: '12:00' },
    { id: 'afternoon', enabled: true, start: '12:00', end: '17:00' },
    { id: 'asap', enabled: true },
  ],
  availability: {
    evaluatedAt: '2026-10-02T15:00:00.000Z',
    localDate: '2026-10-02',
    localTime: '10:00',
    weekday: 'fri',
    isOpen: true,
    acceptsPickup: true,
    acceptsDelivery: true,
    availableTimeSlots: ['morning', 'afternoon', 'asap'],
  },
  updatedAt: '2026-10-02T15:00:00.000Z',
  ...overrides,
})

/** Cliente sin reintentos, con la tienda ya cargada (la consulta `['store']` queda fresca y no sale a la red). */
export const testQueryClient = (store: StoreDto | null = openStoreDto()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (store) client.setQueryData(['store'], store)
  return client
}

export const renderWithQuery = (ui: ReactElement, client: QueryClient = testQueryClient()) =>
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
