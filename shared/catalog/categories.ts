/**
 * Categorías (pasillos) del catálogo real de Leche y Miel.
 * Fuente autoritativa consumida por PWA y admin. Editar aquí propaga a ambos.
 */

import type { Category } from './types'

export const sharedCategories: Category[] = [
  { id: 'cat-la', name: 'Lácteos',           slug: 'lacteos',           order: 1 },
  { id: 'cat-be', name: 'Bebidas',           slug: 'bebidas',           order: 2 },
  { id: 'cat-dp', name: 'Despensa',          slug: 'despensa',          order: 3 },
  { id: 'cat-as', name: 'Limpieza',          slug: 'aseo',              order: 4 },
  { id: 'cat-sn', name: 'Snacks',            slug: 'snacks',            order: 5 },
  { id: 'cat-co', name: 'Congelados',        slug: 'congelados',        order: 6 },
  { id: 'cat-el', name: 'Electrodomésticos', slug: 'electrodomesticos', order: 7 },
  { id: 'cat-hr', name: 'Herramientas',      slug: 'herramientas',      order: 8 },
  { id: 'cat-ju', name: 'Juguetería',        slug: 'jugueteria',        order: 9 },
]
