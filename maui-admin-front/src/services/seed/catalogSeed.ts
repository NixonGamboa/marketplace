// Seed inicial del catálogo del admin (~20 productos demo, 4 categorías).
// Idempotente vía marker `maui-admin-catalog-seeded-v1`.
//
// Cobertura intencional:
//  - lácteos / abarrotes / carnes / bebidas (4 categorías).
//  - ≥3 productos con `is_variable_weight: true` (queso campesino, frijol, chorizo).

import type { Category, Product } from '@/types/catalog'

const STORAGE_KEY = 'maui-admin-catalog'
const SEED_MARKER = 'maui-admin-catalog-seeded-v1'

export interface CatalogShape {
  products: Record<string, Product>
  categories: Record<string, Category>
}

const CATEGORIES: Category[] = [
  { id: 'lacteos',    name: 'Lácteos',    slug: 'lacteos',    order: 1 },
  { id: 'abarrotes',  name: 'Abarrotes',  slug: 'abarrotes',  order: 2 },
  { id: 'carnes',     name: 'Carnes',     slug: 'carnes',     order: 3 },
  { id: 'bebidas',    name: 'Bebidas',    slug: 'bebidas',    order: 4 },
]

const PICSUM = (seed: string) => `https://picsum.photos/seed/${seed}/240/240`

const PRODUCTS: Product[] = [
  // ── Lácteos ──
  { id: 'leche-entera-1l',       name: 'Leche entera 1L',         price: 4500,  unit: '1 L',  imageUrl: PICSUM('leche-entera'),    categoryId: 'lacteos',   inStock: true,  is_variable_weight: false },
  { id: 'leche-deslactosada-1l', name: 'Leche deslactosada 1L',   price: 5200,  unit: '1 L',  imageUrl: PICSUM('leche-desl'),      categoryId: 'lacteos',   inStock: true,  is_variable_weight: false },
  { id: 'yogurt-natural-1l',     name: 'Yogur natural 1L',        price: 8200,  unit: '1 L',  imageUrl: PICSUM('yogur'),           categoryId: 'lacteos',   inStock: true,  is_variable_weight: false },
  { id: 'queso-campesino-250g',  name: 'Queso campesino',         price: 32000, unit: '$/kg', imageUrl: PICSUM('queso'),           categoryId: 'lacteos',   inStock: true,  is_variable_weight: true  },
  { id: 'mantequilla-250g',      name: 'Mantequilla 250g',        price: 9800,  unit: '250 g',imageUrl: PICSUM('mantequilla'),     categoryId: 'lacteos',   inStock: true,  is_variable_weight: false },

  // ── Abarrotes ──
  { id: 'arroz-1kg',             name: 'Arroz 1kg',               price: 5500,  unit: '1 kg', imageUrl: PICSUM('arroz'),           categoryId: 'abarrotes', inStock: true,  is_variable_weight: false },
  { id: 'frijol-bola-roja-500g', name: 'Fríjol bola roja',        price: 8400,  unit: '$/kg', imageUrl: PICSUM('frijol'),          categoryId: 'abarrotes', inStock: true,  is_variable_weight: true  },
  { id: 'aceite-girasol-1l',     name: 'Aceite girasol 1L',       price: 12000, unit: '1 L',  imageUrl: PICSUM('aceite'),          categoryId: 'abarrotes', inStock: true,  is_variable_weight: false },
  { id: 'azucar-1kg',            name: 'Azúcar 1kg',              price: 4900,  unit: '1 kg', imageUrl: PICSUM('azucar'),          categoryId: 'abarrotes', inStock: true,  is_variable_weight: false },
  { id: 'sal-500g',              name: 'Sal 500g',                price: 1800,  unit: '500 g',imageUrl: PICSUM('sal'),             categoryId: 'abarrotes', inStock: true,  is_variable_weight: false },
  { id: 'pasta-spaghetti-500g',  name: 'Pasta spaghetti 500g',    price: 3200,  unit: '500 g',imageUrl: PICSUM('pasta'),           categoryId: 'abarrotes', inStock: true,  is_variable_weight: false },
  { id: 'atun-lata-170g',        name: 'Atún en lata 170g',       price: 5500,  unit: '170 g',imageUrl: PICSUM('atun'),            categoryId: 'abarrotes', inStock: true,  is_variable_weight: false },

  // ── Carnes ──
  { id: 'chorizo-250g',          name: 'Chorizo',                 price: 36000, unit: '$/kg', imageUrl: PICSUM('chorizo'),         categoryId: 'carnes',    inStock: true,  is_variable_weight: true  },
  { id: 'salchichas-viena-250g', name: 'Salchichas Viena 250g',   price: 7800,  unit: '250 g',imageUrl: PICSUM('salchichas'),      categoryId: 'carnes',    inStock: true,  is_variable_weight: false },
  { id: 'pollo-pechuga-kg',      name: 'Pechuga de pollo',        price: 22000, unit: '$/kg', imageUrl: PICSUM('pollo'),           categoryId: 'carnes',    inStock: true,  is_variable_weight: true  },
  { id: 'huevos-rojos-30',       name: 'Huevos rojos AA x 30',    price: 21000, unit: '30 u', imageUrl: PICSUM('huevos'),          categoryId: 'carnes',    inStock: true,  is_variable_weight: false },

  // ── Bebidas ──
  { id: 'gaseosa-cola-2l',       name: 'Gaseosa cola 2L',         price: 6500,  unit: '2 L',  imageUrl: PICSUM('gaseosa'),         categoryId: 'bebidas',   inStock: true,  is_variable_weight: false },
  { id: 'agua-600ml',            name: 'Agua 600ml',              price: 2200,  unit: '600 ml',imageUrl: PICSUM('agua'),           categoryId: 'bebidas',   inStock: true,  is_variable_weight: false },
  { id: 'jugo-naranja-1l',       name: 'Jugo de naranja 1L',      price: 7400,  unit: '1 L',  imageUrl: PICSUM('jugo'),            categoryId: 'bebidas',   inStock: true,  is_variable_weight: false },
  { id: 'cafe-molido-500g',      name: 'Café molido 500g',        price: 18500, unit: '500 g',imageUrl: PICSUM('cafe'),            categoryId: 'bebidas',   inStock: false, is_variable_weight: false },
]

function buildSeed(): CatalogShape {
  const products = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]))
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))
  return { products, categories }
}

export const SEED_CATALOG: CatalogShape = buildSeed()

export function runCatalogSeed(): void {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(SEED_MARKER) === '1') return
  if (!window.localStorage.getItem(STORAGE_KEY)) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_CATALOG))
  }
  window.localStorage.setItem(SEED_MARKER, '1')
}
