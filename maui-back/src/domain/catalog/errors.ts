import { DomainError, ValidationError } from '../../shared/errors.js'

export type CatalogConflictCode =
  | 'CATEGORY_IN_USE'
  | 'CATEGORY_SLUG_TAKEN'
  | 'CATALOG_CONCURRENT_UPDATE'
  | 'CATALOG_ID_TAKEN'
  | 'STORE_NOT_CONFIGURED'

const CONFLICT_MESSAGES: Record<CatalogConflictCode, string> = {
  CATEGORY_IN_USE: 'La categoría tiene productos (incluidos archivados); muévalos antes de eliminarla',
  CATEGORY_SLUG_TAKEN: 'Ya existe una categoría con ese slug en la tienda',
  CATALOG_CONCURRENT_UPDATE: 'El elemento cambió mientras se editaba; recargue e intente de nuevo',
  CATALOG_ID_TAKEN: 'El identificador ya existe',
  STORE_NOT_CONFIGURED: 'La tienda no está inicializada',
}

/** Conflicto de estado del catálogo (→ 409). */
export class CatalogConflictError extends DomainError {
  constructor(code: CatalogConflictCode) {
    super(CONFLICT_MESSAGES[code], code)
    this.name = 'CatalogConflictError'
  }
}

/**
 * Categoría inexistente en la tienda del actor. Una categoría de otra tienda produce el
 * mismo error: no se revela que exista (→ 400).
 */
export class UnknownCategoryError extends ValidationError {
  constructor() {
    super('Categoría inexistente en la tienda', [{ path: 'categoryId', message: 'Categoría inexistente en la tienda' }])
    this.name = 'UnknownCategoryError'
  }
}

/** Fallo de persistencia del catálogo. No conserva el error original: puede contener URLs o SQL. */
export class CatalogPersistenceError extends Error {
  readonly code = 'CATALOG_PERSISTENCE_UNAVAILABLE'

  constructor() {
    super('La persistencia del catálogo no está disponible')
    this.name = 'CatalogPersistenceError'
  }
}
