import type { CatalogRepository } from '../../src/domain/catalog/CatalogRepository.js'
import type { StoreRepository } from '../../src/domain/store/StoreRepository.js'
import type { Clock } from '../../src/shared/clock.js'
import { initializeStore } from '../../src/usecases/store/initializeStore.js'
import { createCategory } from '../../src/usecases/catalog/manageCategories.js'

/** Datos reales de repositorio para las pruebas de creación, nunca un fallback del runtime. */
export async function initializeOrderCatalog(deps: { catalog: CatalogRepository; store: StoreRepository; clock: Clock }) {
  await initializeStore(deps, { overrides: {
    scheduleOverride: 'open',
    delivery: { enabled: true, shippingCost: 3000, freeShippingThreshold: 30000,
      cutoff: '23:59', coverageNote: 'Solo casco urbano' },
    timeSlots: [{ id: 'morning', enabled: true, start: '00:00', end: '23:59' },
      { id: 'afternoon', enabled: true, start: '00:00', end: '23:59' }, { id: 'asap', enabled: true }],
  } })
  const actor = { id: 'owner_fixture', role: 'owner' as const, storeId: 'leche-y-miel' }
  const category = await createCategory(deps, actor, { name: 'Productos de prueba' })
  const base = { storeId: actor.storeId, categoryId: category.id, displayName: null, legalName: null,
    originalPrice: null, imageUrl: '/fixture.png', inStock: true, badge: null, currency: 'COP' as const,
    description: null, nutritionalInfo: null, availability: null, active: true, archivedAt: null,
    version: 1, createdAt: deps.clock.nowIso(), updatedAt: deps.clock.nowIso() }
  await deps.catalog.createProduct({ ...base, id: 'prod_leche', name: 'Leche entera 1L', price: 4500,
    unit: '1 L', isVariableWeight: false })
  await deps.catalog.createProduct({ ...base, id: 'prod_carne', name: 'Carne molida', price: 22000,
    unit: 'Por Kilogramo', isVariableWeight: true })
  return { category, actor }
}
