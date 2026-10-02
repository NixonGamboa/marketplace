import { z } from 'zod'
import { copAmountSchema, entityIdSchema, isoUtcSchema } from './common.js'

/**
 * Contrato del catálogo por tienda (T-07). Reutiliza el shape `Product`/`Category` de
 * `shared/catalog/types.ts` (mismos nombres de campo) para que PWA y admin lo consuman sin
 * adaptar la UI. Sin runtime: compila en PWA, admin y backend.
 *
 * Requests `.strict()`: rechazan `id`, `storeId`, fechas, `version` y cualquier campo de
 * contexto. La tienda y el actor salen de la sesión; los IDs nuevos los asigna el servidor.
 *
 * Importes: enteros COP. En peso variable `price` es precio por kilogramo (ADR-006) y la
 * unidad es siempre `VARIABLE_WEIGHT_UNIT`; un producto de peso fijo no puede usarla.
 */

export const CATALOG_CURRENCY = 'COP' as const

/** Unidad única del precio por kg, igual a la del baseline (`queso-campesino-250g`). */
export const VARIABLE_WEIGHT_UNIT = 'Por Kilogramo'

export const CATALOG_LIMITS = {
  nameMaxLength: 120,
  displayNameMaxLength: 60,
  legalNameMaxLength: 200,
  unitMaxLength: 40,
  badgeMaxLength: 30,
  availabilityMaxLength: 40,
  descriptionMaxLength: 2000,
  nutritionTextMaxLength: 40,
  maxCalories: 5000,
  urlMaxLength: 2048,
  categoryNameMaxLength: 60,
  slugMaxLength: 60,
  iconMaxLength: 60,
  maxCategoryOrder: 10_000,
} as const

const text = (max: number) => z.string().trim().min(1).max(max)

/**
 * Imagen o ilustración: ruta relativa al origen (`/product-images/...`) o URL `https`.
 * Rechaza `//host`, esquemas como `javascript:`/`data:` y caracteres de control.
 * T-09 asocia URLs Blob verificadas por el servidor; se conservan URLs manuales/baseline.
 */
const RELATIVE_ASSET_PATTERN = /^\/(?!\/)[A-Za-z0-9._~%/-]+$/

export const isCatalogAssetUrl = (value: string): boolean => {
  if (RELATIVE_ASSET_PATTERN.test(value)) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.length > 0 && !/[\s<>"]/.test(value)
  } catch {
    return false
  }
}

export const catalogAssetUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(CATALOG_LIMITS.urlMaxLength)
  .refine(isCatalogAssetUrl, 'Debe ser una ruta /… o una URL https')

/** Precio de venta: entero COP positivo (unitario o por kg). */
export const catalogPriceSchema = copAmountSchema.min(1)

export const nutritionalInfoSchema = z
  .object({
    calories: z.number().int().min(0).max(CATALOG_LIMITS.maxCalories).optional(),
    protein: text(CATALOG_LIMITS.nutritionTextMaxLength).optional(),
    fat: text(CATALOG_LIMITS.nutritionTextMaxLength).optional(),
    carbs: text(CATALOG_LIMITS.nutritionTextMaxLength).optional(),
    fiber: text(CATALOG_LIMITS.nutritionTextMaxLength).optional(),
    serving: text(CATALOG_LIMITS.nutritionTextMaxLength).optional(),
  })
  .strict()

export type NutritionalInfoDto = z.infer<typeof nutritionalInfoSchema>

/** Campos que un owner puede decidir de un producto (sin contexto ni estado de archivo). */
const productFields = {
  name: text(CATALOG_LIMITS.nameMaxLength),
  name_display: text(CATALOG_LIMITS.displayNameMaxLength),
  name_legal: text(CATALOG_LIMITS.legalNameMaxLength),
  price: catalogPriceSchema,
  /** Precio anterior tachado; debe ser mayor que `price`. */
  originalPrice: catalogPriceSchema,
  unit: text(CATALOG_LIMITS.unitMaxLength),
  imageUrl: catalogAssetUrlSchema,
  categoryId: entityIdSchema,
  /** `false` = agotado: sigue visible con su badge, pero no se puede pedir (T-10). */
  inStock: z.boolean(),
  is_variable_weight: z.boolean(),
  badge: text(CATALOG_LIMITS.badgeMaxLength),
  currency: z.literal(CATALOG_CURRENCY),
  description: text(CATALOG_LIMITS.descriptionMaxLength),
  nutritionalInfo: nutritionalInfoSchema,
  /** Etiqueta libre de disponibilidad ("Pocas unidades"); `inStock` es la fuente de verdad. */
  availability: text(CATALOG_LIMITS.availabilityMaxLength),
  /** `false` = oculto al público sin archivar (publicación temporalmente pausada). */
  active: z.boolean(),
}

/** Reglas de coherencia del precio/unidad, comunes a create, update fusionado y salida. */
export interface ProductRuleInput {
  price: number
  originalPrice?: number | null | undefined
  unit?: string | null | undefined
  is_variable_weight: boolean
}

export const productRuleIssues = (product: ProductRuleInput): { path: string; message: string }[] => {
  const issues: { path: string; message: string }[] = []
  if (product.originalPrice != null && product.originalPrice <= product.price) {
    issues.push({ path: 'originalPrice', message: 'El precio anterior debe ser mayor que el precio' })
  }
  if (product.is_variable_weight) {
    if (product.unit != null && product.unit !== VARIABLE_WEIGHT_UNIT) {
      issues.push({ path: 'unit', message: `En peso variable la unidad es "${VARIABLE_WEIGHT_UNIT}" (precio por kg)` })
    }
  } else if (product.unit == null) {
    issues.push({ path: 'unit', message: 'Requerida en productos de peso fijo' })
  } else if (product.unit === VARIABLE_WEIGHT_UNIT) {
    issues.push({ path: 'unit', message: `"${VARIABLE_WEIGHT_UNIT}" solo aplica a peso variable` })
  }
  return issues
}

const refineProductRules = (product: ProductRuleInput, ctx: z.RefinementCtx): void => {
  for (const issue of productRuleIssues(product)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message })
  }
}

/**
 * POST /api/catalog/products. `unit` se omite en peso variable (el servidor fija
 * `VARIABLE_WEIGHT_UNIT`); `inStock` y `active` valen `true` si no se envían.
 */
export const createProductRequestSchema = z
  .object({
    name: productFields.name,
    name_display: productFields.name_display.optional(),
    name_legal: productFields.name_legal.optional(),
    price: productFields.price,
    originalPrice: productFields.originalPrice.optional(),
    unit: productFields.unit.optional(),
    imageUrl: productFields.imageUrl,
    categoryId: productFields.categoryId,
    inStock: productFields.inStock.optional(),
    is_variable_weight: productFields.is_variable_weight,
    badge: productFields.badge.optional(),
    currency: productFields.currency.optional(),
    description: productFields.description.optional(),
    nutritionalInfo: productFields.nutritionalInfo.optional(),
    availability: productFields.availability.optional(),
    active: productFields.active.optional(),
  })
  .strict()
  .superRefine(refineProductRules)

/**
 * PATCH /api/catalog/products/:id. Parcial; `null` borra un campo opcional. `archived`
 * archiva o restaura sin borrar la fila: los pedidos históricos conservan ID y snapshot.
 * Las reglas de precio/unidad se validan sobre el producto ya fusionado en el servidor.
 */
export const updateProductRequestSchema = z
  .object({
    name: productFields.name.optional(),
    name_display: productFields.name_display.nullable().optional(),
    name_legal: productFields.name_legal.nullable().optional(),
    price: productFields.price.optional(),
    originalPrice: productFields.originalPrice.nullable().optional(),
    unit: productFields.unit.optional(),
    imageUrl: productFields.imageUrl.optional(),
    categoryId: productFields.categoryId.optional(),
    inStock: productFields.inStock.optional(),
    is_variable_weight: productFields.is_variable_weight.optional(),
    badge: productFields.badge.nullable().optional(),
    currency: productFields.currency.optional(),
    description: productFields.description.nullable().optional(),
    nutritionalInfo: productFields.nutritionalInfo.nullable().optional(),
    availability: productFields.availability.nullable().optional(),
    active: productFields.active.optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Se requiere al menos un campo')

const publicProductShape = {
  id: entityIdSchema,
  name: productFields.name,
  name_display: productFields.name_display.optional(),
  name_legal: productFields.name_legal.optional(),
  price: productFields.price,
  originalPrice: productFields.originalPrice.optional(),
  unit: productFields.unit,
  imageUrl: productFields.imageUrl,
  categoryId: entityIdSchema,
  inStock: productFields.inStock,
  is_variable_weight: productFields.is_variable_weight,
  badge: productFields.badge.optional(),
  currency: productFields.currency,
  description: productFields.description.optional(),
  nutritionalInfo: productFields.nutritionalInfo.optional(),
  availability: productFields.availability.optional(),
}

/** Producto público: mismo shape que `shared/catalog` `Product`; solo activos y no archivados. */
export const productDtoSchema = z.object(publicProductShape).strict().superRefine(refineProductRules)

/** Vista de personal: versión para uploads CAS, publicación, archivo y fechas; sin `storeId`. */
export const staffProductDtoSchema = z
  .object({
    version: z.number().int().positive(),
    ...publicProductShape,
    active: productFields.active,
    archived: z.boolean(),
    createdAt: isoUtcSchema,
    updatedAt: isoUtcSchema,
  })
  .strict()
  .superRefine(refineProductRules)

export const categorySlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(CATALOG_LIMITS.slugMaxLength)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug en minúsculas, números y guiones')

const categoryFields = {
  name: text(CATALOG_LIMITS.categoryNameMaxLength),
  icon: text(CATALOG_LIMITS.iconMaxLength),
  slug: categorySlugSchema,
  illustrationUrl: catalogAssetUrlSchema,
  order: z.number().int().min(0).max(CATALOG_LIMITS.maxCategoryOrder),
}

/** POST /api/catalog/categories. El slug es único por tienda. */
export const createCategoryRequestSchema = z
  .object({
    name: categoryFields.name,
    icon: categoryFields.icon.optional(),
    slug: categoryFields.slug.optional(),
    illustrationUrl: categoryFields.illustrationUrl.optional(),
    order: categoryFields.order.optional(),
  })
  .strict()

/** PATCH /api/catalog/categories/:id. Parcial; `null` borra un campo opcional. */
export const updateCategoryRequestSchema = z
  .object({
    name: categoryFields.name.optional(),
    icon: categoryFields.icon.nullable().optional(),
    slug: categoryFields.slug.nullable().optional(),
    illustrationUrl: categoryFields.illustrationUrl.nullable().optional(),
    order: categoryFields.order.nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Se requiere al menos un campo')

/** Categoría (pasillo): mismo shape que `shared/catalog` `Category`. */
export const categoryDtoSchema = z
  .object({
    id: entityIdSchema,
    name: categoryFields.name,
    icon: categoryFields.icon.optional(),
    slug: categoryFields.slug.optional(),
    illustrationUrl: categoryFields.illustrationUrl.optional(),
    order: categoryFields.order.optional(),
  })
  .strict()

/** GET /api/catalog — catálogo público de la tienda. */
export const publicCatalogResponseSchema = z
  .object({
    categories: z.array(categoryDtoSchema),
    products: z.array(productDtoSchema),
  })
  .strict()

/** GET /api/catalog/staff — todo el catálogo de la tienda de la sesión, incluidos ocultos y archivados. */
export const staffCatalogResponseSchema = z
  .object({
    categories: z.array(categoryDtoSchema),
    products: z.array(staffProductDtoSchema),
  })
  .strict()

export type CreateProductRequest = z.infer<typeof createProductRequestSchema>
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>
export type ProductDto = z.infer<typeof productDtoSchema>
export type StaffProductDto = z.infer<typeof staffProductDtoSchema>
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>
export type CategoryDto = z.infer<typeof categoryDtoSchema>
export type PublicCatalogResponse = z.infer<typeof publicCatalogResponseSchema>
export type StaffCatalogResponse = z.infer<typeof staffCatalogResponseSchema>
