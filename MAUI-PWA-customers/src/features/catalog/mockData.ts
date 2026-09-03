/**
 * Adaptador local del catálogo compartido para la PWA.
 *
 * - `mockCategories` y `mockProducts` provienen del baseline en
 *   `@shared/catalog`, la fuente autoritativa consumida también por el admin.
 * - Aquí decoramos categorías con `illustrationUrl` (imports locales de Vite)
 *   y sobrescribimos `imageUrl` de productos con imports locales cuando existen,
 *   para que Vite versione las imágenes.
 * - En el build unificado (mismo origin admin + PWA), los productos sin foto
 *   local caen a placeholders del baseline.
 */

import type { Product, Category, BusinessCategoryGroup } from '@/types'
import { sharedProducts, sharedCategories } from '@shared/catalog'
import { categoryImages } from '@/assets/categories'
import imgLeche from '@/assets/products/lacteos/leche.png'
import imgQuesoCampesino from '@/assets/products/lacteos/queso-campesino.png'
import imgYogurt from '@/assets/products/lacteos/yogurt.webp'
import imgFrijol from '@/assets/products/abarrotes/frijol.webp'
import imgArroz from '@/assets/products/abarrotes/arroz.png'
import imgAceiteGirasol from '@/assets/products/abarrotes/aceite-girasol.png'
import imgChorizo from '@/assets/products/carnes/chorizo.webp'

// ─── Categorías: decoradas con illustrationUrl local ──────────────────────────

const CATEGORY_ILLUSTRATIONS: Record<string, string | undefined> = {
  'cat-la': categoryImages.lacteos,
  'cat-be': categoryImages.bebidas,
  'cat-dp': categoryImages.despensa,
  'cat-as': categoryImages.limpieza,
  'cat-sn': categoryImages.snacks,
  'cat-co': categoryImages.congelados,
  'cat-el': categoryImages.electro,
  'cat-hr': categoryImages.herramientas,
  'cat-ju': categoryImages.jugueteria,
}

export const mockCategories: Category[] = sharedCategories.map((c) => ({
  ...c,
  illustrationUrl: CATEGORY_ILLUSTRATIONS[c.id],
})) as Category[]

// ─── Productos: imageUrl sobrescrito con imports locales cuando aplica ────────

const PRODUCT_IMAGE_OVERRIDES: Record<string, string> = {
  'leche-entera-1l':       imgLeche,
  'queso-campesino-250g':  imgQuesoCampesino,
  'yogurt-natural-1l':     imgYogurt,
  'frijol-bola-roja-500g': imgFrijol,
  'arroz-1kg':             imgArroz,
  'aceite-girasol-1l':     imgAceiteGirasol,
  'chorizo-250g':          imgChorizo,
}

export const mockProducts: Product[] = sharedProducts.map((p) => ({
  ...p,
  imageUrl: PRODUCT_IMAGE_OVERRIDES[p.id] ?? p.imageUrl,
})) as Product[]

// ─── Business Category Groups (menú lateral) ──────────────────────────────────
// Estos NO viven en shared/ porque son específicos de la PWA (verticales de
// plataforma, no del catálogo del aliado).

export const mockBusinessCategoryGroups: BusinessCategoryGroup[] = [
  {
    id: 'comprar',
    label: 'Comprar',
    order: 1,
    items: [
      { id: 'mercado',     name: 'Mercado',           iconName: 'Store',    slug: null,              comingSoon: false },
      { id: 'cat-fv',     name: 'Frutas y Verduras', iconName: 'Leaf',     slug: 'frutas-verduras', comingSoon: true  },
      { id: 'cat-ca',     name: 'Carnes Frescas',    iconName: 'Utensils', slug: 'carnes',          comingSoon: true  },
      { id: 'ferreteria', name: 'Ferretería',        iconName: 'Wrench',   slug: null,              comingSoon: true  },
      { id: 'electro',    name: 'Electrodomésticos', iconName: 'Zap',      slug: null,              comingSoon: true  },
      { id: 'mascotas',   name: 'Mascotas',          iconName: 'PawPrint', slug: null,              comingSoon: true  },
    ],
  },
  {
    id: 'servicios',
    label: 'Servicios',
    order: 2,
    items: [
      { id: 'transporte', name: 'Transporte', iconName: 'Car',   slug: null, comingSoon: true },
      { id: 'domicilios', name: 'Domicilios', iconName: 'Truck', slug: null, comingSoon: true },
      { id: 'hogar',      name: 'Hogar',      iconName: 'Home',  slug: null, comingSoon: true },
    ],
  },
  {
    id: 'comunidad',
    label: 'Comunidad',
    order: 3,
    items: [
      { id: 'promos-locales', name: 'Promociones locales', iconName: 'Tag',  slug: null, comingSoon: true },
      { id: 'negocios',       name: 'Negocios destacados', iconName: 'Star', slug: null, comingSoon: true },
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Productos disponibles para el carrusel "Lo que no puede faltar" */
export const mockFeaturedProducts = mockProducts.filter((p) => p.inStock)

/** Productos por categoría */
export function getProductsByCategory(categoryId: string): Product[] {
  return mockProducts.filter((p) => p.categoryId === categoryId && p.inStock)
}
