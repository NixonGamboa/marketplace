// Mock CatalogRepository — CRUD productos+categorías en localStorage.
// Toda mutación registra un evento en el audit log (RN-9).

import type { Category, Product } from '@/types/catalog'
import { mockAuditRepository } from './mockAuditRepository'
import { randomDelay } from './delay'
import type { CatalogShape } from './seed/catalogSeed'
import { SEED_CATALOG } from './seed/catalogSeed'

const STORAGE_KEY = 'maui-admin-catalog'

export interface CatalogListFilter {
  categoryId?: string
  q?: string
}

export interface CatalogRepository {
  listProducts(filter?: CatalogListFilter): Promise<Product[]>
  getProduct(id: string): Promise<Product | null>
  upsertProduct(p: Product): Promise<Product>
  deleteProduct(id: string): Promise<void>
  toggleStock(id: string, inStock: boolean): Promise<Product>
  listCategories(): Promise<Category[]>
  upsertCategory(c: Category): Promise<Category>
  deleteCategory(id: string): Promise<void>
}

function readShape(): CatalogShape {
  if (typeof window === 'undefined') return SEED_CATALOG
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { products: {}, categories: {} }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { products: {}, categories: {} }
    const shape = parsed as Partial<CatalogShape>
    return {
      products: shape.products ?? {},
      categories: shape.categories ?? {},
    }
  } catch {
    return { products: {}, categories: {} }
  }
}

function writeShape(shape: CatalogShape): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shape))
}

function matchesProduct(p: Product, filter?: CatalogListFilter): boolean {
  if (!filter) return true
  if (filter.categoryId && p.categoryId !== filter.categoryId) return false
  if (filter.q) {
    const needle = filter.q.trim().toLowerCase()
    if (!p.name.toLowerCase().includes(needle)) return false
  }
  return true
}

const SYSTEM_USER = 'system'

export const mockCatalogRepository: CatalogRepository = {
  async listProducts(filter) {
    await randomDelay()
    return Object.values(readShape().products)
      .filter((p) => matchesProduct(p, filter))
      .sort((a, b) => a.name.localeCompare(b.name))
  },

  async getProduct(id) {
    await randomDelay()
    return readShape().products[id] ?? null
  },

  async upsertProduct(p) {
    await randomDelay()
    const shape = readShape()
    const previous = shape.products[p.id]
    shape.products[p.id] = p
    writeShape(shape)
    await mockAuditRepository.log({
      user: SYSTEM_USER,
      action: 'catalog.product_upsert',
      targetId: p.id,
      meta: { previous, next: p },
    })
    return p
  },

  async deleteProduct(id) {
    await randomDelay()
    const shape = readShape()
    const previous = shape.products[id]
    if (!previous) return
    delete shape.products[id]
    writeShape(shape)
    await mockAuditRepository.log({
      user: SYSTEM_USER,
      action: 'catalog.product_delete',
      targetId: id,
      meta: { previous },
    })
  },

  async toggleStock(id, inStock) {
    await randomDelay()
    const shape = readShape()
    const current = shape.products[id]
    if (!current) throw new Error(`Producto ${id} no encontrado`)
    const updated: Product = { ...current, inStock }
    shape.products[id] = updated
    writeShape(shape)
    await mockAuditRepository.log({
      user: SYSTEM_USER,
      action: 'catalog.stock_toggled',
      targetId: id,
      meta: { inStock },
    })
    return updated
  },

  async listCategories() {
    await randomDelay()
    return Object.values(readShape().categories).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  },

  async upsertCategory(c) {
    await randomDelay()
    const shape = readShape()
    shape.categories[c.id] = c
    writeShape(shape)
    return c
  },

  async deleteCategory(id) {
    await randomDelay()
    const shape = readShape()
    // RN-7: no permitir si hay productos asignados.
    const hasProducts = Object.values(shape.products).some((p) => p.categoryId === id)
    if (hasProducts) {
      throw new Error('No se puede eliminar una categoría con productos asignados (RN-7)')
    }
    delete shape.categories[id]
    writeShape(shape)
  },
}

export const realCatalogRepository: CatalogRepository = {
  listProducts() {
    throw new Error('realCatalogRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  getProduct() {
    throw new Error('realCatalogRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  upsertProduct() {
    throw new Error('realCatalogRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  deleteProduct() {
    throw new Error('realCatalogRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  toggleStock() {
    throw new Error('realCatalogRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  listCategories() {
    throw new Error('realCatalogRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  upsertCategory() {
    throw new Error('realCatalogRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  deleteCategory() {
    throw new Error('realCatalogRepository not implemented (swap from VITE_DEMO_MODE)')
  },
}
