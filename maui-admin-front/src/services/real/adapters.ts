// Funciones puras que adaptan los DTO compartidos a los tipos de la UI admin y viceversa.
// Sin red ni estado: se prueban directamente. No inventan campos que el servidor no entrega.

import {
  CATALOG_CURRENCY,
  VARIABLE_WEIGHT_UNIT,
  type AuthSessionResponse,
  type CategoryDto,
  type CreateCategoryRequest,
  type CreateProductRequest,
  type StoreDto,
  type UpdateCategoryRequest,
  type UpdateProductRequest,
  type UpdateStoreSettingsRequest,
} from '@shared/contracts'
import type { Session } from '@/types/auth'
import type { Category, Product } from '@/types/catalog'
import type { MerchantConfig } from '@/types/merchant'
import type { StoreStatus } from '@/types/storeStatus'
import type { OrderStatus } from '@/types/orderService'
import { ApiError } from '../http/apiError'

/** Quita las claves `undefined` para que el body no envíe campos que el usuario no decidió. */
const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T

// ── Auth ────────────────────────────────────────────────────────────────────

/** Sesión de personal; `null` si la cuenta es de cliente (no pertenece al panel admin). */
export const staffSessionFrom = (response: AuthSessionResponse): Session | null => {
  const { account } = response
  if (account.role === 'customer') return null
  return {
    user: { email: account.email, name: account.name, role: account.role, merchantId: account.storeId },
    expiresAt: response.expiresAt,
  }
}

// ── Catálogo ────────────────────────────────────────────────────────────────

const assertSupportedCurrency = (product: Product): void => {
  if (product.currency !== undefined && product.currency !== CATALOG_CURRENCY) {
    throw new ApiError({ kind: 'invalid_request', message: `Solo se admite moneda ${CATALOG_CURRENCY}` })
  }
}

/** Alta: el servidor asigna el ID, así que `product.id` no viaja. En peso variable la unidad la fija el servidor. */
export const createProductRequestFrom = (product: Product): CreateProductRequest => {
  assertSupportedCurrency(product)
  return compact({
    name: product.name,
    name_display: product.name_display,
    name_legal: product.name_legal,
    price: product.price,
    originalPrice: product.originalPrice,
    unit: product.is_variable_weight ? undefined : product.unit,
    imageUrl: product.imageUrl,
    categoryId: product.categoryId,
    inStock: product.inStock,
    is_variable_weight: product.is_variable_weight,
    badge: product.badge,
    currency: product.currency === undefined ? undefined : CATALOG_CURRENCY,
    description: product.description,
    nutritionalInfo: product.nutritionalInfo,
    availability: product.availability,
  })
}

/**
 * Edición completa del formulario: un opcional ausente se envía como `null` para borrarlo.
 * `active`/`archived` no forman parte del formulario y no se tocan.
 */
export const updateProductRequestFrom = (product: Product): UpdateProductRequest => {
  assertSupportedCurrency(product)
  return {
    name: product.name,
    name_display: product.name_display ?? null,
    name_legal: product.name_legal ?? null,
    price: product.price,
    originalPrice: product.originalPrice ?? null,
    unit: product.is_variable_weight ? VARIABLE_WEIGHT_UNIT : product.unit,
    imageUrl: product.imageUrl,
    categoryId: product.categoryId,
    inStock: product.inStock,
    is_variable_weight: product.is_variable_weight,
    badge: product.badge ?? null,
    description: product.description ?? null,
    nutritionalInfo: product.nutritionalInfo ?? null,
    availability: product.availability ?? null,
  }
}

export const createCategoryRequestFrom = (category: Category): CreateCategoryRequest =>
  compact({
    name: category.name,
    icon: category.icon,
    slug: category.slug,
    illustrationUrl: category.illustrationUrl,
    order: category.order,
  })

export const updateCategoryRequestFrom = (category: Category): UpdateCategoryRequest => ({
  name: category.name,
  icon: category.icon ?? null,
  slug: category.slug ?? null,
  illustrationUrl: category.illustrationUrl ?? null,
  order: category.order ?? null,
})

export const categoryFromDto = (dto: CategoryDto): Category => dto

/** Filtros del listado admin; el catálogo de personal llega completo y se filtra aquí. */
export const matchesCatalogFilter = (
  product: Product,
  filter: { categoryId?: string; q?: string } | undefined,
): boolean => {
  if (filter?.categoryId && product.categoryId !== filter.categoryId) return false
  const query = filter?.q?.trim().toLowerCase()
  if (!query) return true
  return [product.name, product.name_display, product.name_legal, product.id].some((text) =>
    text?.toLowerCase().includes(query),
  )
}

// ── Tienda y aliado ─────────────────────────────────────────────────────────

/** `merchantId` es el `storeId`; sin teléfono configurado, `whatsapp` queda vacío (no se inventa uno). */
export const merchantFromStore = (store: StoreDto): MerchantConfig => ({
  merchantId: store.storeId,
  name: store.name,
  whatsapp: store.contactPhone ?? '',
  address: store.address,
  updatedAt: store.updatedAt,
})

export const merchantPatchFrom = (config: MerchantConfig): UpdateStoreSettingsRequest => ({
  name: config.name,
  contactPhone: config.whatsapp.trim() === '' ? null : config.whatsapp,
  address: config.address,
})

export const storeStatusFrom = (store: StoreDto): StoreStatus => ({
  override: store.scheduleOverride,
  schedule: store.weeklySchedule,
  updatedAt: store.updatedAt,
})

// ── Listado de pedidos ──────────────────────────────────────────────────────

export interface OrderListFilterInput {
  status?: OrderStatus
  q?: string
  /** `YYYY-MM-DD`, día completo inclusive. */
  from?: string
  /** `YYYY-MM-DD`, día completo inclusive. */
  to?: string
}

export interface OrderPageRequest {
  limit?: number
  cursor?: string
}

/** Colombia no tiene horario de verano: los días de la tienda empiezan a las 00:00 UTC-5. */
const STORE_UTC_OFFSET = '-05:00'
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const startOfStoreDay = (date: string): number => {
  const start = DATE_ONLY.test(date) ? Date.parse(`${date}T00:00:00.000${STORE_UTC_OFFSET}`) : Number.NaN
  if (Number.isNaN(start)) throw new ApiError({ kind: 'invalid_request', message: `Fecha inválida: ${date}` })
  return start
}

/** Convierte el filtro de la UI a la query cruda de `GET /api/orders` (`to` exclusivo = día siguiente). */
export const orderListQueryFrom = (
  filter: OrderListFilterInput | undefined,
  page: OrderPageRequest | undefined,
): Record<string, string | number | undefined> => ({
  status: filter?.status,
  q: filter?.q?.trim() || undefined,
  from: filter?.from ? new Date(startOfStoreDay(filter.from)).toISOString() : undefined,
  to: filter?.to ? new Date(startOfStoreDay(filter.to) + DAY_MS).toISOString() : undefined,
  limit: page?.limit,
  cursor: page?.cursor,
})
