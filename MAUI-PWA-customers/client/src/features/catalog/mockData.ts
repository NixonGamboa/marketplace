import type { Product, Category } from '@/types'

// ─── Categorías ───────────────────────────────────────────────────────────────
// TODO FEAT-DEMO-001: reemplazar con las categorías/pasillos reales de Leche y Miel

export const mockCategories: Category[] = [
  { id: 'cat-la', name: 'Lácteos',    slug: 'lacteos',    order: 1 },
  { id: 'cat-ab', name: 'Abarrotes',  slug: 'abarrotes',  order: 2 },
  { id: 'cat-as', name: 'Aseo',       slug: 'aseo',       order: 3 },
  { id: 'cat-pa', name: 'Panadería',  slug: 'panaderia',  order: 4 },
  { id: 'cat-be', name: 'Bebidas',    slug: 'bebidas',    order: 5 },
]

// ─── Productos ────────────────────────────────────────────────────────────────
// TODO FEAT-DEMO-001: reemplazar TODOS estos productos con el catálogo real de Leche y Miel.
// Reglas para los datos reales:
//   - Nombres tal como aparecen en la tienda física
//   - Precios verificados con el aliado
//   - Fotos tomadas en la tienda (WebP, 400×400px, <30KB)
//   - is_variable_weight: false en todos — funcionalidad fuera del scope del demo
// Cobertura mínima: ~15 productos distribuidos entre las categorías reales.

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
    inStock: false, // ← Agotado — para validar lógica de inStock en la UI
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
