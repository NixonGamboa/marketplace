// Fixtures que cumplen los esquemas compartidos; los tests las alteran para cada caso.

import { vi } from 'vitest'
import type {
  AuthSessionResponse,
  OrderDto,
  StaffCatalogResponse,
  StaffProductDto,
  StoreDto,
} from '@shared/contracts'
import { createApiClient } from '../../http/apiClient'

export const NOW_ISO = '2026-10-02T15:00:00.000Z'
export const FUTURE_ISO = '2999-01-01T00:00:00.000Z'

export const ownerSession = (overrides: Partial<AuthSessionResponse> = {}): AuthSessionResponse => ({
  account: { id: 'usr-owner', role: 'owner', name: 'Dueño Demo', email: 'owner@maui.test', storeId: 'store-1' },
  expiresAt: FUTURE_ISO,
  ...overrides,
})

export const customerSession = (): AuthSessionResponse => ({
  account: { id: 'usr-cli', role: 'customer', name: 'Cliente Demo', phone: '573105550101', phoneVerified: false },
  expiresAt: FUTURE_ISO,
})

export const staffProduct = (overrides: Partial<StaffProductDto> = {}): StaffProductDto => ({
  id: 'prod-leche',
  version: 3,
  name: 'Leche entera',
  price: 5000,
  unit: '1 L',
  imageUrl: '/product-images/leche.png',
  categoryId: 'cat-lacteos',
  inStock: true,
  is_variable_weight: false,
  currency: 'COP',
  active: true,
  archived: false,
  createdAt: NOW_ISO,
  updatedAt: NOW_ISO,
  ...overrides,
})

export const staffCatalog = (overrides: Partial<StaffCatalogResponse> = {}): StaffCatalogResponse => ({
  categories: [{ id: 'cat-lacteos', name: 'Lácteos', slug: 'lacteos', order: 1 }],
  products: [staffProduct()],
  ...overrides,
})

const day = { open: '08:00', close: '18:00', closed: false }

export const storeDto = (overrides: Partial<StoreDto> = {}): StoreDto => ({
  storeId: 'store-1',
  name: 'Leche & Miel',
  contactPhone: '573105550101',
  address: 'Calle 1 # 2-3, Dolores',
  timeZone: 'America/Bogota',
  weeklySchedule: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: { ...day, closed: true } },
  scheduleOverride: 'auto',
  delivery: { enabled: true, shippingCost: 3000, freeShippingThreshold: 50000, cutoff: '17:00', coverageNote: null },
  timeSlots: [
    { id: 'morning', enabled: true, start: '08:00', end: '12:00' },
    { id: 'afternoon', enabled: true, start: '12:00', end: '17:00' },
    { id: 'asap', enabled: true },
  ],
  availability: {
    evaluatedAt: NOW_ISO,
    localDate: '2026-10-02',
    localTime: '10:00',
    weekday: 'fri',
    isOpen: true,
    acceptsPickup: true,
    acceptsDelivery: true,
    availableTimeSlots: ['morning', 'afternoon', 'asap'],
  },
  updatedAt: NOW_ISO,
  ...overrides,
})

export const orderDto = (overrides: Partial<OrderDto> = {}): OrderDto => ({
  orderId: 'ord-1',
  userId: 'usr-cli',
  status: 'received',
  items: [{ id: 'prod-leche', name: 'Leche entera', qty: 2, priceAtMoment: 5000, unit: '1 L' }],
  deliveryType: 'pickup',
  deliveryData: {},
  substitutionPreference: 'call_me',
  customerName: 'Cliente Demo',
  customerPhone: '573105550101',
  estimatedTotal: 10000,
  createdAt: NOW_ISO,
  ...overrides,
})

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

export const apiProblem = (status: number, error: string, message: string, headers: Record<string, string> = {}): Response =>
  json({ error, message }, status, headers)

export const noContent = (): Response => new Response(null, { status: 204 })

/** Cliente real con `fetch` simulado: cada llamada consume la siguiente respuesta. */
export const clientWith = (...responses: Array<Response | Error>) => {
  const fetchImpl = vi.fn<typeof fetch>()
  for (const response of responses) {
    if (response instanceof Error) fetchImpl.mockRejectedValueOnce(response)
    else fetchImpl.mockResolvedValueOnce(response)
  }
  return { client: createApiClient({ fetchImpl }), fetchImpl }
}

/** Petición `index` realizada: URL, método, cabeceras y cuerpo ya decodificado. */
export const requestAt = (fetchImpl: ReturnType<typeof clientWith>['fetchImpl'], index = 0) => {
  const [url, init] = fetchImpl.mock.calls[index] ?? []
  return {
    url: String(url),
    method: init?.method,
    credentials: init?.credentials,
    cache: init?.cache,
    headers: (init?.headers ?? {}) as Record<string, string>,
    body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
  }
}

export const publicProduct = (overrides: Record<string, unknown> = {}) => ({
  id: 'prod-leche',
  name: 'Leche entera',
  price: 5000,
  unit: '1 L',
  imageUrl: '/product-images/leche.png',
  categoryId: 'cat-lacteos',
  inStock: true,
  is_variable_weight: false,
  currency: 'COP',
  ...overrides,
})

export const publicCatalog = () => ({
  categories: [{ id: 'cat-lacteos', name: 'Lácteos', slug: 'lacteos', order: 1 }],
  products: [publicProduct(), publicProduct({ id: 'prod-agotado', inStock: false })],
})
