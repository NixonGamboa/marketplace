import { describe, expect, it } from 'vitest'
import { sharedCategories, sharedProducts } from '../../../shared/catalog/index.js'
import {
  VARIABLE_WEIGHT_UNIT,
  categoryDtoSchema,
  createCategoryRequestSchema,
  createProductRequestSchema,
  isCatalogAssetUrl,
  productDtoSchema,
  updateCategoryRequestSchema,
  updateProductRequestSchema,
} from '../../../shared/contracts/index.js'

const fixedProduct = {
  name: 'Leche entera 1L',
  price: 4500,
  unit: '1 L',
  imageUrl: '/product-images/lacteos/leche.png',
  categoryId: 'cat-la',
  is_variable_weight: false,
}

const variableProduct = {
  name: 'Queso campesino',
  price: 7500,
  imageUrl: 'https://placehold.co/400x400?text=Queso',
  categoryId: 'cat-la',
  is_variable_weight: true,
}

const issuePaths = (result: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join('.')) ?? []

describe('contrato de productos', () => {
  it('acepta peso fijo con unidad y peso variable sin unidad (precio por kg)', () => {
    expect(createProductRequestSchema.safeParse(fixedProduct).success).toBe(true)
    expect(createProductRequestSchema.safeParse(variableProduct).success).toBe(true)
    expect(createProductRequestSchema.safeParse({ ...variableProduct, unit: VARIABLE_WEIGHT_UNIT }).success).toBe(true)
  })

  it('rechaza unidades incoherentes con el peso', () => {
    expect(issuePaths(createProductRequestSchema.safeParse({ ...variableProduct, unit: '250 g' }))).toEqual(['unit'])
    expect(issuePaths(createProductRequestSchema.safeParse({ ...fixedProduct, unit: undefined }))).toEqual(['unit'])
    expect(issuePaths(createProductRequestSchema.safeParse({ ...fixedProduct, unit: VARIABLE_WEIGHT_UNIT }))).toEqual(['unit'])
  })

  it.each([
    ['cero', 0],
    ['negativo', -100],
    ['decimal', 4500.5],
    ['sobre el máximo', 100_000_001],
    ['texto', '4500'],
    ['NaN', Number.NaN],
  ])('rechaza precio %s', (_label, price) => {
    expect(issuePaths(createProductRequestSchema.safeParse({ ...fixedProduct, price }))).toContain('price')
  })

  it('solo admite COP y precio anterior mayor que el precio', () => {
    expect(createProductRequestSchema.safeParse({ ...fixedProduct, currency: 'COP' }).success).toBe(true)
    expect(issuePaths(createProductRequestSchema.safeParse({ ...fixedProduct, currency: 'USD' }))).toEqual(['currency'])
    expect(issuePaths(createProductRequestSchema.safeParse({ ...fixedProduct, originalPrice: 4500 }))).toEqual(['originalPrice'])
    expect(createProductRequestSchema.safeParse({ ...fixedProduct, originalPrice: 5800 }).success).toBe(true)
  })

  it('el body no decide ID, tienda, archivo ni fechas', () => {
    for (const field of ['id', 'storeId', 'archived', 'createdAt', 'version']) {
      const result = createProductRequestSchema.safeParse({ ...fixedProduct, [field]: 'x' })
      expect(result.success, field).toBe(false)
    }
    expect(updateProductRequestSchema.safeParse({ storeId: 'otra-tienda' }).success).toBe(false)
    expect(updateProductRequestSchema.safeParse({}).success).toBe(false)
  })

  it('update admite null para borrar opcionales y los estados independientes', () => {
    const parsed = updateProductRequestSchema.parse({ originalPrice: null, inStock: false, active: false, archived: true })
    expect(parsed).toEqual({ originalPrice: null, inStock: false, active: false, archived: true })
    expect(updateProductRequestSchema.safeParse({ name: null }).success).toBe(false)
  })

  it('imágenes: rutas del origen o https; nunca otros esquemas', () => {
    for (const ok of ['/product-images/a.png', 'https://placehold.co/400x400/9ca3af/f9fafb?text=Lenteja']) {
      expect(isCatalogAssetUrl(ok), ok).toBe(true)
    }
    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AA', '//evil.test/x.png', 'http://x.test/a.png', 'img.png']) {
      expect(isCatalogAssetUrl(bad), bad).toBe(false)
    }
  })

  it('el DTO público es el shape del baseline y aplica las mismas reglas', () => {
    for (const product of sharedProducts) {
      expect(productDtoSchema.safeParse({ ...product, currency: 'COP' }).success, product.id).toBe(true)
    }
    expect(productDtoSchema.safeParse({ ...fixedProduct, id: 'p1', inStock: true, currency: 'COP', storeId: 's' }).success).toBe(false)
  })
})

describe('contrato de categorías', () => {
  it('acepta el baseline y valida slug/orden', () => {
    for (const { id, ...category } of sharedCategories) {
      expect(createCategoryRequestSchema.safeParse(category).success, id).toBe(true)
      expect(categoryDtoSchema.safeParse({ id, ...category }).success).toBe(true)
    }
    expect(createCategoryRequestSchema.safeParse({ name: 'Frutas', slug: 'Frutas Frescas' }).success).toBe(false)
    expect(createCategoryRequestSchema.safeParse({ name: 'Frutas', order: -1 }).success).toBe(false)
    expect(createCategoryRequestSchema.safeParse({ name: 'Frutas', storeId: 'otra' }).success).toBe(false)
    expect(updateCategoryRequestSchema.safeParse({ slug: null }).success).toBe(true)
  })
})
