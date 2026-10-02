import { sharedCategories, sharedProducts, type Category, type Product } from '../../../../shared/catalog/index.js'
import {
  CATALOG_CURRENCY,
  createCategoryRequestSchema,
  createProductRequestSchema,
  entityIdSchema,
  issuesFromZodError,
} from '../../../../shared/contracts/index.js'
import type { SafeParseReturnType } from 'zod'
import type { CatalogRepository } from '../../domain/catalog/CatalogRepository.js'
import type { Clock } from '../../shared/clock.js'
import { ValidationError } from '../../shared/errors.js'
import { resolveUnit } from './manageProducts.js'

export interface CatalogBaseline {
  categories: readonly Category[]
  products: readonly Product[]
}

export interface CatalogSeedResult {
  categoriesInserted: number
  categoriesSkipped: number
  productsInserted: number
  productsSkipped: number
}

const parseOrThrow = <T>(
  label: string,
  result: SafeParseReturnType<unknown, T>,
): T => {
  if (!result.success) throw new ValidationError(`Invalid catalog baseline: ${label}`, issuesFromZodError(result.error))
  return result.data
}

/**
 * Carga el baseline (`shared/catalog`) como DATOS de una tienda, para el seed de servidor
 * (T-16). Cada entrada se valida con el mismo contrato que la API y conserva su ID (los
 * pedidos existentes lo referencian). Idempotente: inserta solo lo ausente y nunca
 * sobrescribe ediciones. `createdAt` crece 1 ms por entrada para conservar el orden.
 */
export const seedCatalogBaseline = async (
  deps: { catalog: Pick<CatalogRepository, 'insertCategoryIfAbsent' | 'insertProductIfAbsent'>; clock: Clock },
  storeId: string,
  baseline: CatalogBaseline = { categories: sharedCategories, products: sharedProducts },
): Promise<CatalogSeedResult> => {
  const start = deps.clock.now().getTime()
  const stamp = (index: number): string => new Date(start + index).toISOString()

  const categories = baseline.categories.map(({ id, ...fields }, index) => {
    const data = parseOrThrow(`category ${id}`, createCategoryRequestSchema.safeParse(fields))
    const createdAt = stamp(index)
    return {
      id: parseOrThrow(`category id ${id}`, entityIdSchema.safeParse(id)),
      storeId,
      name: data.name,
      icon: data.icon ?? null,
      slug: data.slug ?? null,
      illustrationUrl: data.illustrationUrl ?? null,
      order: data.order ?? null,
      version: 1,
      createdAt,
      updatedAt: createdAt,
    }
  })

  const products = baseline.products.map(({ id, ...fields }, index) => {
    const data = parseOrThrow(`product ${id}`, createProductRequestSchema.safeParse(fields))
    const createdAt = stamp(index)
    return {
      id: parseOrThrow(`product id ${id}`, entityIdSchema.safeParse(id)),
      storeId,
      categoryId: data.categoryId,
      name: data.name,
      displayName: data.name_display ?? null,
      legalName: data.name_legal ?? null,
      price: data.price,
      originalPrice: data.originalPrice ?? null,
      unit: resolveUnit(data.is_variable_weight, data.unit),
      imageUrl: data.imageUrl,
      inStock: data.inStock ?? true,
      isVariableWeight: data.is_variable_weight,
      badge: data.badge ?? null,
      currency: CATALOG_CURRENCY,
      description: data.description ?? null,
      nutritionalInfo: data.nutritionalInfo ?? null,
      availability: data.availability ?? null,
      active: data.active ?? true,
      archivedAt: null,
      version: 1,
      createdAt,
      updatedAt: createdAt,
    }
  })

  const result: CatalogSeedResult = { categoriesInserted: 0, categoriesSkipped: 0, productsInserted: 0, productsSkipped: 0 }
  for (const category of categories) {
    if (await deps.catalog.insertCategoryIfAbsent(category)) result.categoriesInserted += 1
    else result.categoriesSkipped += 1
  }
  for (const product of products) {
    if (await deps.catalog.insertProductIfAbsent(product)) result.productsInserted += 1
    else result.productsSkipped += 1
  }
  return result
}
