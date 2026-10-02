import {
  categoryDtoSchema,
  productDtoSchema,
  staffProductDtoSchema,
  type CategoryDto,
  type ProductDto,
  type PublicCatalogResponse,
  type StaffCatalogResponse,
  type StaffProductDto,
} from '../../../../shared/contracts/index.js'
import type { CatalogCategory, CatalogProduct } from './Catalog.js'

/** `null` interno → campo omitido en el DTO (los opcionales del contrato no admiten `null`). */
const present = <K extends string, V>(key: K, value: V | null): { [P in K]?: V } =>
  (value === null ? {} : { [key]: value }) as { [P in K]?: V }

const publicFields = (product: CatalogProduct) => ({
  id: product.id,
  name: product.name,
  ...present('name_display', product.displayName),
  ...present('name_legal', product.legalName),
  price: product.price,
  ...present('originalPrice', product.originalPrice),
  unit: product.unit,
  imageUrl: product.imageUrl,
  categoryId: product.categoryId,
  inStock: product.inStock,
  is_variable_weight: product.isVariableWeight,
  ...present('badge', product.badge),
  currency: product.currency,
  ...present('description', product.description),
  ...present('nutritionalInfo', product.nutritionalInfo),
  ...present('availability', product.availability),
})

/** Proyección pública por lista blanca y validada: sin `storeId`, `version` ni estado interno. */
export const toProductDto = (product: CatalogProduct): ProductDto => productDtoSchema.parse(publicFields(product))

export const toStaffProductDto = (product: CatalogProduct): StaffProductDto =>
  staffProductDtoSchema.parse({
    ...publicFields(product),
    version: product.version,
    active: product.active,
    archived: product.archivedAt !== null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  })

export const toCategoryDto = (category: CatalogCategory): CategoryDto =>
  categoryDtoSchema.parse({
    id: category.id,
    name: category.name,
    ...present('icon', category.icon),
    ...present('slug', category.slug),
    ...present('illustrationUrl', category.illustrationUrl),
    ...present('order', category.order),
  })

interface CatalogContent {
  categories: readonly CatalogCategory[]
  products: readonly CatalogProduct[]
}

export const toPublicCatalogResponse = ({ categories, products }: CatalogContent): PublicCatalogResponse => ({
  categories: categories.map(toCategoryDto),
  products: products.map(toProductDto),
})

export const toStaffCatalogResponse = ({ categories, products }: CatalogContent): StaffCatalogResponse => ({
  categories: categories.map(toCategoryDto),
  products: products.map(toStaffProductDto),
})
