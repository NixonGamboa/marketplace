/**
 * Tipos del catálogo compartido. Deliberadamente idénticos al contrato replicado
 * en `MAUI-PWA-customers/src/types/catalog.ts` y `maui-admin-front/src/types/catalog.ts`.
 * El drift-check garantiza que ambos apps consumen el mismo shape; este archivo
 * es el baseline usado por el catálogo real de Leche y Miel.
 */

export interface Product {
  id: string
  name: string
  name_display?: string
  name_legal?: string
  price: number
  originalPrice?: number
  unit: string
  imageUrl: string
  categoryId: string
  inStock: boolean
  is_variable_weight: boolean
  badge?: string
  currency?: string
  description?: string
  nutritionalInfo?: {
    calories?: number
    protein?: string
    fat?: string
    carbs?: string
    fiber?: string
    serving?: string
  }
  availability?: string
}

export interface Category {
  id: string
  name: string
  icon?: string
  slug?: string
  illustrationUrl?: string
  order?: number
}
