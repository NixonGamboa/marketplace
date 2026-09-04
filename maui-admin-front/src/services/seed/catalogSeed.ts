/**
 * Seed inicial del catálogo del admin desde el baseline compartido
 * `@shared/catalog`. Fuente autoritativa: la misma que consume la PWA — así los
 * `item.id` de un pedido resuelven a nombre real vía `catalogRepo.getProduct`.
 *
 * Idempotencia: marker `maui-admin-catalog-seeded-v2`. El bump de versión (v1 →
 * v2) fuerza re-seed en clientes que ya tenían el catálogo placeholder cacheado,
 * para que los pedidos existentes empiecen a resolver contra el catálogo real.
 *
 * El owner puede editar/agregar/quitar productos desde /catalogo; su copia
 * diverge en localStorage y el botón "Reiniciar demo" la restaura al baseline.
 */

import type { Category, Product } from '@/types/catalog'
import { sharedProducts, sharedCategories } from '@shared/catalog'

const STORAGE_KEY = 'maui-admin-catalog'
const SEED_MARKER = 'maui-admin-catalog-seeded-v2'
const LEGACY_MARKER_V1 = 'maui-admin-catalog-seeded-v1'

export interface CatalogShape {
  products: Record<string, Product>
  categories: Record<string, Category>
}

function buildSeed(): CatalogShape {
  const products = Object.fromEntries(
    (sharedProducts as Product[]).map((p) => [p.id, p]),
  )
  const categories = Object.fromEntries(
    (sharedCategories as Category[]).map((c) => [c.id, c]),
  )
  return { products, categories }
}

export const SEED_CATALOG: CatalogShape = buildSeed()

export function runCatalogSeed(): void {
  if (typeof window === 'undefined') return
  // Migración v1 → v2: si sólo había marker viejo, invalidar catálogo cacheado.
  if (
    window.localStorage.getItem(SEED_MARKER) !== '1' &&
    window.localStorage.getItem(LEGACY_MARKER_V1) === '1'
  ) {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_MARKER_V1)
  }
  if (window.localStorage.getItem(SEED_MARKER) === '1') return
  if (!window.localStorage.getItem(STORAGE_KEY)) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_CATALOG))
  }
  window.localStorage.setItem(SEED_MARKER, '1')
}
