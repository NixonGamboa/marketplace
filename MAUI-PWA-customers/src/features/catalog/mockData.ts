import type { Product, Category, BusinessCategoryGroup } from '@/types'
import { categoryImages } from '@/assets/categories'
import imgLeche from '@/assets/products/lacteos/leche.png'
import imgQuesoCampesino from '@/assets/products/lacteos/queso-campesino.png'
import imgYogurt from '@/assets/products/lacteos/yogurt.webp'
import imgFrijol from '@/assets/products/abarrotes/frijol.webp'
import imgArroz from '@/assets/products/abarrotes/arroz.png'
import imgAceiteGirasol from '@/assets/products/abarrotes/aceite-girasol.png'
import imgChorizo from '@/assets/products/carnes/chorizo.webp'

// ─── Categorías ───────────────────────────────────────────────────────────────

export const mockCategories: Category[] = [
  { id: 'cat-la', name: 'Lácteos',           slug: 'lacteos',           illustrationUrl: categoryImages.lacteos,      order: 1 },
  { id: 'cat-be', name: 'Bebidas',           slug: 'bebidas',           illustrationUrl: categoryImages.bebidas,      order: 2 },
  { id: 'cat-dp', name: 'Despensa',          slug: 'despensa',          illustrationUrl: categoryImages.despensa,     order: 3 },
  { id: 'cat-as', name: 'Limpieza',          slug: 'aseo',              illustrationUrl: categoryImages.limpieza,     order: 4 },
  { id: 'cat-sn', name: 'Snacks',            slug: 'snacks',            illustrationUrl: categoryImages.snacks,       order: 5 },
  { id: 'cat-co', name: 'Congelados',        slug: 'congelados',        illustrationUrl: categoryImages.congelados,   order: 6 },
  { id: 'cat-el', name: 'Electrodomésticos', slug: 'electrodomesticos', illustrationUrl: categoryImages.electro,      order: 7 },
  { id: 'cat-hr', name: 'Herramientas',      slug: 'herramientas',      illustrationUrl: categoryImages.herramientas, order: 8 },
  { id: 'cat-ju', name: 'Juguetería',        slug: 'jugueteria',        illustrationUrl: categoryImages.jugueteria,   order: 9 },
]

// ─── Productos ────────────────────────────────────────────────────────────────
// TODO: reemplazar imageUrl con imágenes reales 400×400 < 30KB por imagen.
//       Convenio: src/assets/products/<categoria>/<nombre>.webp

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

  // ── Grano ─────────────────────────────────────────────────────────────────
  {
    id: 'frijol-bola-roja-500g',
    name: 'Frijol bola roja 500g',
    name_display: 'Frijol Bola Roja',
    name_legal: 'Frijol bola roja seco 500 gramos',
    price: 4200,
    unit: '500 g',
    imageUrl: imgFrijol,
    categoryId: 'cat-gr',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'lenteja-500g',
    name: 'Lenteja 500g',
    name_display: 'Lenteja',
    name_legal: 'Lenteja seca 500 gramos',
    price: 3800,
    unit: '500 g',
    imageUrl: 'https://placehold.co/400x400/92400e/fef3c7?text=Lenteja',
    categoryId: 'cat-gr',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },

  // ── Despensa ──────────────────────────────────────────────────────────────
  {
    id: 'arroz-1kg',
    name: 'Arroz blanco 1kg',
    name_display: 'Arroz',
    name_legal: 'Arroz blanco pulido extra 1 kilogramo',
    price: 5500,
    originalPrice: 7000,
    unit: '1 kg',
    imageUrl: imgArroz,
    categoryId: 'cat-dp',
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
    categoryId: 'cat-dp',
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
    imageUrl: 'https://placehold.co/400x400/f9fafb/374151?text=Azucar',
    categoryId: 'cat-dp',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },

  // ── Embutidos y Mariscos ──────────────────────────────────────────────────
  {
    id: 'chorizo-250g',
    name: 'Chorizo casero 250g',
    name_display: 'Chorizo',
    name_legal: 'Chorizo de cerdo artesanal 250g',
    price: 9000,
    originalPrice: 11500,
    unit: '250 g',
    imageUrl: imgChorizo,
    categoryId: 'cat-em',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'salchichas-viena-250g',
    name: 'Salchichas tipo viena 250g',
    name_display: 'Salchichas Viena',
    name_legal: 'Salchichas tipo viena de cerdo y res 250g',
    price: 7800,
    unit: '250 g',
    imageUrl: 'https://placehold.co/400x400/fca5a5/7f1d1d?text=Salchichas',
    categoryId: 'cat-em',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'atun-lata-170g',
    name: 'Atún en agua 170g',
    name_display: 'Atún',
    name_legal: 'Atún aleta amarilla en agua 170 gramos',
    price: 5500,
    originalPrice: 6800,
    unit: '170 g',
    imageUrl: 'https://placehold.co/400x400/bfdbfe/1e3a8a?text=Atun',
    categoryId: 'cat-em',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
    badge: 'Oferta',
  },

  // ── Bebidas ───────────────────────────────────────────────────────────────
  {
    id: 'gaseosa-cola-2l',
    name: 'Gaseosa cola 2L',
    name_display: 'Gaseosa Cola',
    name_legal: 'Bebida gaseosa sabor cola 2 litros',
    price: 6500,
    unit: '2 L',
    imageUrl: 'https://placehold.co/400x400/dc2626/fff1f2?text=Gaseosa',
    categoryId: 'cat-be',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'agua-botella-600ml',
    name: 'Agua purificada 600ml',
    name_display: 'Agua Purificada',
    name_legal: 'Agua purificada en botella 600 mililitros',
    price: 2000,
    unit: '600 ml',
    imageUrl: 'https://placehold.co/400x400/e0f2fe/0c4a6e?text=Agua',
    categoryId: 'cat-be',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },

  // ── Aseo ──────────────────────────────────────────────────────────────────
  {
    id: 'detergente-1kg',
    name: 'Detergente en polvo 1kg',
    name_display: 'Detergente',
    name_legal: 'Detergente en polvo multiuso 1 kilogramo',
    price: 11500,
    originalPrice: 14000,
    unit: '1 kg',
    imageUrl: 'https://placehold.co/400x400/4f46e5/eef2ff?text=Detergente',
    categoryId: 'cat-as',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
  },
  {
    id: 'jabon-bano-3pack',
    name: 'Jabón de baño x3 unidades',
    name_display: 'Jabón de Baño',
    name_legal: 'Jabón de baño en barra 3 unidades 100g c/u',
    price: 8500,
    unit: 'x3 und',
    imageUrl: 'https://placehold.co/400x400/d1fae5/064e3b?text=Jabon',
    categoryId: 'cat-as',
    inStock: false,
    is_variable_weight: false,
    currency: 'COP',
  },

  // ── Electrodomésticos ─────────────────────────────────────────────────────
  {
    id: 'nevera-haceb-250l',
    name: 'Nevera 250L Haceb',
    name_display: 'Nevera 250L',
    name_legal: 'Refrigerador doméstico 250 litros marca Haceb',
    price: 1350000,
    originalPrice: 1650000,
    unit: 'unidad',
    imageUrl: 'https://placehold.co/400x400/e2e8f0/1e293b?text=Nevera',
    categoryId: 'cat-el',
    inStock: true,
    is_variable_weight: false,
    currency: 'COP',
    badge: 'Oferta',
  },
]

// ─── Business Category Groups (menú lateral) ──────────────────────────────────

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
export const mockFeaturedProducts = mockProducts.filter(p => p.inStock)

/** Productos por categoría */
export function getProductsByCategory(categoryId: string): Product[] {
  return mockProducts.filter(p => p.categoryId === categoryId && p.inStock)
}
