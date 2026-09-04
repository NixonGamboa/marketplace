/**
 * @spec Paso 2/3 (catálogo compartido + reset demo)
 * Verifica que runCatalogSeed siembra desde el baseline shared, es idempotente
 * y que la migración v1 → v2 invalida el catálogo cacheado.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { runCatalogSeed, SEED_CATALOG } from '../catalogSeed'
import { sharedProducts, sharedCategories } from '@shared/catalog'

const STORAGE_KEY = 'maui-admin-catalog'
const SEED_MARKER = 'maui-admin-catalog-seeded-v2'
const LEGACY_MARKER = 'maui-admin-catalog-seeded-v1'

beforeEach(() => {
  window.localStorage.clear()
})

describe('runCatalogSeed', () => {
  it('siembra products+categories desde @shared/catalog en primera ejecución', () => {
    runCatalogSeed()
    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(Object.keys(parsed.products)).toHaveLength(sharedProducts.length)
    expect(Object.keys(parsed.categories)).toHaveLength(sharedCategories.length)
    // Sanity: un id conocido del baseline resuelve al mismo objeto
    expect(parsed.products['queso-campesino-250g']?.is_variable_weight).toBe(true)
    expect(window.localStorage.getItem(SEED_MARKER)).toBe('1')
  })

  it('es idempotente: segunda ejecución no reescribe el storage', () => {
    runCatalogSeed()
    const raw1 = window.localStorage.getItem(STORAGE_KEY)
    // Simular edición del owner
    const edited = { ...JSON.parse(raw1!) }
    edited.products['queso-campesino-250g'].price = 99999
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(edited))

    runCatalogSeed()
    const raw2 = window.localStorage.getItem(STORAGE_KEY)
    const after = JSON.parse(raw2!)
    // La edición del owner se conserva porque el marker ya estaba
    expect(after.products['queso-campesino-250g'].price).toBe(99999)
  })

  it('migración v1 → v2: si sólo estaba el marker viejo, invalida el catálogo', () => {
    // Estado legacy: producto placeholder + marker v1
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      products: { 'legacy-placeholder': { id: 'legacy-placeholder' } },
      categories: {},
    }))
    window.localStorage.setItem(LEGACY_MARKER, '1')

    runCatalogSeed()

    // El marker viejo desapareció, el nuevo está, y el catálogo tiene el baseline
    expect(window.localStorage.getItem(LEGACY_MARKER)).toBeNull()
    expect(window.localStorage.getItem(SEED_MARKER)).toBe('1')
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)
    expect(parsed.products['legacy-placeholder']).toBeUndefined()
    expect(parsed.products['queso-campesino-250g']).toBeTruthy()
  })

  it('reset demo → primera carga tras limpiar → baseline sembrado de nuevo', () => {
    runCatalogSeed()
    // ResetDemoButton borra las claves con prefijo maui-admin-*
    for (const key of Object.keys({ ...window.localStorage })) {
      if (key.startsWith('maui-admin-')) window.localStorage.removeItem(key)
    }
    // Siguiente arranque
    runCatalogSeed()
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)
    expect(Object.keys(parsed.products)).toHaveLength(sharedProducts.length)
  })

  it('SEED_CATALOG expuesto es consistente con el baseline shared', () => {
    expect(Object.keys(SEED_CATALOG.products)).toHaveLength(sharedProducts.length)
    expect(Object.keys(SEED_CATALOG.categories)).toHaveLength(sharedCategories.length)
  })
})
