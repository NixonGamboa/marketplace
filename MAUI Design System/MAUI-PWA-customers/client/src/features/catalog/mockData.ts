import type { Product, Category } from '@/types'

// ─── Categorías ───────────────────────────────────────────────────────────────

export const mockCategories: Category[] = [
  { id: 'cat-la', name: 'Lácteos',          slug: 'lacteos',          order: 1 },
  { id: 'cat-ab', name: 'Abarrotes',         slug: 'abarrotes',        order: 2 },
  { id: 'cat-fv', name: 'Frutas y Verduras', slug: 'frutas-verduras',  order: 3 },
  { id: 'cat-ca', name: 'Carnes',            slug: 'carnes',           order: 4 },
  { id: 'cat-as', name: 'Aseo',              slug: 'aseo',             order: 5 },
  { id: 'cat-pa', name: 'Panadería',         slug: 'panaderia',        order: 6 },
  { id: 'cat-be', name: 'Bebidas',           slug: 'bebidas',          order: 7 },
]

// ─── Productos ────────────────────────────────────────────────────────────────

export const mockProducts: Product[] = [
  {
    id: 'p-leche-entera',
    name: 'Leche entera pasteurizada 1L',
    name_display: 'Leche Entera',
    name_legal: 'Leche entera pasteurizada UHT 1L',
    price: 3200,
    unit: '1 L',
    imageUrl: '/assets/products/leche-entera.webp',
    categoryId: 'cat-la',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'p-queso-campesino',
    name: 'Queso campesino fresco',
    name_display: 'Queso Campesino',
    name_legal: 'Queso campesino fresco artesanal',
    price: 8500,
    unit: '~500 g',
    imageUrl: '/assets/products/queso-campesino.webp',
    categoryId: 'cat-la',
    inStock: true,
    is_variable_weight: true,
    currency: 'COP',
    badge: 'Local',
  },
  {
    id: 'p-arroz-diana',
    name: 'Arroz Diana Extra 500g',
    name_display: 'Arroz Diana',
    name_legal: 'Arroz blanco pulido extra 500g Diana',
    price: 3900,
    unit: '500 g',
    imageUrl: '/assets/products/arroz-diana.webp',
    categoryId: 'cat-ab',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'p-aceite-palma',
    name: 'Aceite de palma 1L',
    name_display: 'Aceite Palma',
    name_legal: 'Aceite vegetal de palma refinado 1L',
    price: 9800,
    unit: '1 L',
    imageUrl: '/assets/products/aceite-palma.webp',
    categoryId: 'cat-ab',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'p-tomate-chonto',
    name: 'Tomate chonto fresco',
    name_display: 'Tomate Chonto',
    name_legal: 'Tomate chonto fresco por kilogramo',
    price: 4200,
    unit: '~1 kg',
    imageUrl: '/assets/products/tomate-chonto.webp',
    categoryId: 'cat-fv',
    inStock: true,
    is_variable_weight: true,
    currency: 'COP',
  },
  {
    id: 'p-papa-criolla',
    name: 'Papa criolla fresca',
    name_display: 'Papa Criolla',
    name_legal: 'Papa criolla fresca por kilogramo',
    price: 3500,
    unit: '~1 kg',
    imageUrl: '/assets/products/papa-criolla.webp',
    categoryId: 'cat-fv',
    inStock: true,
    is_variable_weight: true,
    currency: 'COP',
    badge: 'Fresco',
  },
  {
    id: 'p-carne-molida',
    name: 'Carne de res molida',
    name_display: 'Carne Molida',
    name_legal: 'Carne bovina molida fresca por kilogramo',
    price: 18000,
    unit: '~500 g',
    imageUrl: '/assets/products/carne-molida.webp',
    categoryId: 'cat-ca',
    inStock: true,
    is_variable_weight: true,
    currency: 'COP',
  },
  {
    id: 'p-jabon-fab',
    name: 'Jabón Fab lavaplatos 500g',
    name_display: 'Jabón Fab',
    name_legal: 'Detergente para vajilla Fab barra 500g',
    price: 4100,
    unit: '500 g',
    imageUrl: '/assets/products/jabon-fab.webp',
    categoryId: 'cat-as',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'p-pan-tajado',
    name: 'Pan tajado integral',
    name_display: 'Pan Tajado',
    name_legal: 'Pan de molde tajado integral 500g',
    price: 5200,
    unit: '500 g',
    imageUrl: '/assets/products/pan-tajado.webp',
    categoryId: 'cat-pa',
    inStock: false,   // ← Agotado — para probar la lógica de inStock
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'p-gaseosa-postob',
    name: 'Gaseosa Postobón 1.5L',
    name_display: 'Postobón 1.5L',
    name_legal: 'Bebida gaseosa sabor cola Postobón 1.5L',
    price: 5500,
    unit: '1.5 L',
    imageUrl: '/assets/products/gaseosa-postob.webp',
    categoryId: 'cat-be',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Productos disponibles para el carrusel "Lo que no puede faltar" */
export const mockFeaturedProducts = mockProducts.filter(p => p.inStock)

/** Productos por categoría */
export function getProductsByCategory(categoryId: string): Product[] {
  return mockProducts.filter(p => p.categoryId === categoryId && p.inStock)
}
