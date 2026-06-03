import type { Product, Category } from '@/types'
import imgLeche from '@/assets/products/lacteos/leche.png'
import imgQuesoCampesino from '@/assets/products/lacteos/queso-campesino.png'
import imgYogurt from '@/assets/products/lacteos/yogurt.webp'
import imgPlatano from '@/assets/products/frutas-verduras/platano.webp'
import imgTomate from '@/assets/products/frutas-verduras/tomate.png'
import imgPolloEntero from '@/assets/products/carnes/pollo-entero.png'
import imgCarneMolida from '@/assets/products/carnes/carne-molida.png'
import imgChorizo from '@/assets/products/carnes/chorizo.webp'
import imgArroz from '@/assets/products/abarrotes/arroz.png'
import imgAceiteGirasol from '@/assets/products/abarrotes/aceite-girasol.png'

// ─── Categorías ───────────────────────────────────────────────────────────────

export const mockCategories: Category[] = [
  { id: 'cat-la', name: 'Lácteos',          slug: 'lacteos',          order: 1 },
  { id: 'cat-ab', name: 'Despensa',          slug: 'despensa',         order: 2 },
  { id: 'cat-fv', name: 'Frutas y Verduras', slug: 'frutas-verduras',  order: 3 },
  { id: 'cat-ca', name: 'Carnes',            slug: 'carnes',           order: 4 },
  { id: 'cat-as', name: 'Aseo',              slug: 'aseo',             order: 5 },
  { id: 'cat-pa', name: 'Panadería',         slug: 'panaderia',        order: 6 },
  { id: 'cat-be', name: 'Bebidas',           slug: 'bebidas',          order: 7 },
]

// ─── Productos ────────────────────────────────────────────────────────────────
// TODO: reemplazar imageUrl con imágenes reales 400×400 < 30KB por imagen.
//       Convenio: src/assets/products/<categoria>/<nombre>.png
//       Ejemplo: src/assets/products/lacteos/leche.png → import { leche } from '@/assets/products/lacteos'

export const mockProducts: Product[] = [
  // ── Lácteos ──────────────────────────────────────────────────────────────
  {
    id: 'leche-entera-1l',
    name: 'Leche entera pasteurizada 1L',
    name_display: 'Leche Entera',
    name_legal: 'Leche entera pasteurizada UHT 1 litro',
    price: 4500,
    originalPrice: 5800,
    unit: '1 L',
    imageUrl: imgLeche,
    categoryId: 'cat-la',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'queso-campesino-250g',
    name: 'Queso campesino fresco 250g',
    name_display: 'Queso Campesino',
    name_legal: 'Queso campesino fresco artesanal 250g',
    price: 7500,
    unit: '250 g',
    imageUrl: imgQuesoCampesino,
    categoryId: 'cat-la',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
    badge: 'Local',
  },
  {
    id: 'mantequilla-250g',
    name: 'Mantequilla con sal 250g',
    name_display: 'Mantequilla',
    name_legal: 'Mantequilla pasteurizada con sal 250g',
    price: 6800,
    unit: '250 g',
    imageUrl: 'https://placehold.co/400x400/fef9c3/92400e?text=Mantequilla',
    categoryId: 'cat-la',
    inStock: false,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'yogurt-natural-1l',
    name: 'Yogurt natural 1L',
    name_display: 'Yogurt Natural',
    name_legal: 'Yogurt natural entero sin azúcar 1 litro',
    price: 8200,
    unit: '1 L',
    imageUrl: imgYogurt,
    categoryId: 'cat-la',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },

  // ── Carnes ───────────────────────────────────────────────────────────────
  {
    id: 'pollo-entero',
    name: 'Pollo entero fresco',
    name_display: 'Pollo Entero',
    name_legal: 'Pollo entero fresco sin vísceras por unidad',
    price: 22000,
    originalPrice: 27000,
    unit: 'unidad',
    imageUrl: imgPolloEntero,
    categoryId: 'cat-ca',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'carne-molida-500g',
    name: 'Carne de res molida 500g',
    name_display: 'Carne Molida',
    name_legal: 'Carne bovina molida fresca 500g',
    price: 14500,
    originalPrice: 18000,
    unit: '500 g',
    imageUrl: imgCarneMolida,
    categoryId: 'cat-ca',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
    badge: 'Oferta',
  },
  {
    id: 'chorizo-250g',
    name: 'Chorizo casero 250g',
    name_display: 'Chorizo',
    name_legal: 'Chorizo de cerdo artesanal 250g',
    price: 9000,
    originalPrice: 11500,
    unit: '250 g',
    imageUrl: imgChorizo,
    categoryId: 'cat-ca',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },

  // ── Frutas y Verduras ─────────────────────────────────────────────────────
  {
    id: 'platano-verde',
    name: 'Plátano verde',
    name_display: 'Plátano Verde',
    name_legal: 'Plátano verde hartón por unidad',
    price: 800,
    unit: 'unidad',
    imageUrl: imgPlatano,
    categoryId: 'cat-fv',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'tomate-chonto-1lb',
    name: 'Tomate chonto 1lb',
    name_display: 'Tomate Chonto',
    name_legal: 'Tomate chonto fresco 1 libra',
    price: 3200,
    originalPrice: 4200,
    unit: '1 lb',
    imageUrl: imgTomate,
    categoryId: 'cat-fv',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'cebolla-cabezona',
    name: 'Cebolla cabezona blanca 1lb',
    name_display: 'Cebolla Cabezona',
    name_legal: 'Cebolla cabezona blanca fresca 1 libra',
    price: 2800,
    unit: '1 lb',
    imageUrl: 'https://placehold.co/400x400/fefce8/713f12?text=Cebolla',
    categoryId: 'cat-fv',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'aguacate-hass',
    name: 'Aguacate Hass',
    name_display: 'Aguacate Hass',
    name_legal: 'Aguacate variedad Hass por unidad',
    price: 3500,
    originalPrice: 4800,
    unit: 'unidad',
    imageUrl: 'https://placehold.co/400x400/dcfce7/14532d?text=Aguacate',
    categoryId: 'cat-fv',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
    badge: 'Oferta',
  },

  // ── Despensa (Abarrotes) ──────────────────────────────────────────────────
  {
    id: 'arroz-1kg',
    name: 'Arroz blanco 1kg',
    name_display: 'Arroz',
    name_legal: 'Arroz blanco pulido extra 1 kilogramo',
    price: 5500,
    originalPrice: 7000,
    unit: '1 kg',
    imageUrl: imgArroz,
    categoryId: 'cat-ab',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'aceite-girasol-1l',
    name: 'Aceite de girasol 1L',
    name_display: 'Aceite Girasol',
    name_legal: 'Aceite vegetal de girasol refinado 1 litro',
    price: 12000,
    originalPrice: 15000,
    unit: '1 L',
    imageUrl: imgAceiteGirasol,
    categoryId: 'cat-ab',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'azucar-1kg',
    name: 'Azúcar blanca 1kg',
    name_display: 'Azúcar',
    name_legal: 'Azúcar blanca refinada 1 kilogramo',
    price: 4800,
    unit: '1 kg',
    imageUrl: 'https://placehold.co/400x400/fafafa/6b7280?text=Azucar',
    categoryId: 'cat-ab',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'panela-500g',
    name: 'Panela redonda 500g',
    name_display: 'Panela',
    name_legal: 'Panela de caña de azúcar redonda 500g',
    price: 3800,
    unit: '500 g',
    imageUrl: 'https://placehold.co/400x400/fef3c7/92400e?text=Panela',
    categoryId: 'cat-ab',
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
