import { describe, expect, it } from 'vitest'
import type { BusinessCategoryGroup, Product } from '@/types'
import { FEATURED_LIMIT, activeBusinessGroups, deriveFeaturedProducts, searchProducts } from './catalogDerivations'

const product = (id: string, overrides: Partial<Product> = {}): Product => ({
  id, name: id, price: 1000, unit: '1 u', imageUrl: '/x.png', categoryId: 'cat', inStock: true, is_variable_weight: false, ...overrides,
})

describe('destacados derivados', () => {
  it('toma hasta 4 disponibles en el orden del servidor, saltando agotados', () => {
    const catalog = [product('a'), product('b', { inStock: false }), product('c'), product('d'), product('e'), product('f')]
    expect(deriveFeaturedProducts(catalog).map((p) => p.id)).toEqual(['a', 'c', 'd', 'e'])
    expect(FEATURED_LIMIT).toBe(4)
  })

  it('con menos de 4 disponibles devuelve los que haya y con ninguno devuelve vacío', () => {
    expect(deriveFeaturedProducts([product('a'), product('b', { inStock: false })]).map((p) => p.id)).toEqual(['a'])
    expect(deriveFeaturedProducts([product('a', { inStock: false })])).toEqual([])
  })

  it('refleja un cambio de disponibilidad del servidor en la siguiente derivación', () => {
    const before = [product('a'), product('b')]
    const after = [product('a', { inStock: false }), product('b')]
    expect(deriveFeaturedProducts(before).map((p) => p.id)).toEqual(['a', 'b'])
    expect(deriveFeaturedProducts(after).map((p) => p.id)).toEqual(['b'])
  })
})

describe('búsqueda derivada', () => {
  const catalog = [
    product('p1', { name: 'Leche entera', name_display: 'Leche Entera 1L' }),
    product('p2', { name: 'Queso campesino', name_legal: 'Queso fresco campesino S.A.' }),
    product('p3', { name: 'Café molido' }),
  ]

  it('ignora mayúsculas y tildes en el nombre corto, de pantalla o legal y conserva el orden', () => {
    expect(searchProducts(catalog, 'LECHE').map((p) => p.id)).toEqual(['p1'])
    expect(searchProducts(catalog, 'cafe').map((p) => p.id)).toEqual(['p3'])
    expect(searchProducts(catalog, 'fresco').map((p) => p.id)).toEqual(['p2'])
    expect(searchProducts(catalog, 'e').map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
  })

  it('una consulta vacía o sin coincidencias no devuelve productos', () => {
    expect(searchProducts(catalog, '   ')).toEqual([])
    expect(searchProducts(catalog, 'zzz')).toEqual([])
  })
})

describe('verticales futuras', () => {
  const groups: BusinessCategoryGroup[] = [
    { id: 'comprar', label: 'Comprar', order: 1, items: [
      { id: 'mercado', name: 'Mercado', iconName: 'Store', slug: null, comingSoon: false },
      { id: 'ferreteria', name: 'Ferretería', iconName: 'Wrench', slug: null, comingSoon: true },
    ] },
    { id: 'servicios', label: 'Servicios', order: 2, items: [{ id: 'transporte', name: 'Transporte', iconName: 'Car', slug: null, comingSoon: true }] },
  ]

  it('omite los ítems próximos y los grupos que quedan vacíos', () => {
    const active = activeBusinessGroups(groups)
    expect(active.map((group) => group.id)).toEqual(['comprar'])
    expect(active[0]?.items.map((item) => item.id)).toEqual(['mercado'])
    expect(groups[0]?.items).toHaveLength(2)
  })
})
