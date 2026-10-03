import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiErrorSchema, auditListResponseSchema, categoryDtoSchema, staffProductDtoSchema, storeDtoSchema } from '../../../shared/contracts/index.js'
import { startHttpWorld, type HttpWorld } from './httpWorld.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })

/**
 * Dos ediciones del owner que leyeron la misma versión antes de que cualquiera escribiera. La carrera
 * es determinista: la lectura del caso de uso espera a que ambas peticiones hayan leído. Un solo
 * ganador (200), un 409 estable, la fila sin mezclar campos y exactamente un evento de auditoría con
 * los campos del ganador. PGlite serializa conexiones: esto prueba el CAS condicionado por versión y
 * su atomicidad con la auditoría, no la contención entre conexiones Neon (`tests/smoke`).
 */
describe('CAS de catálogo y tienda por HTTP sobre PostgreSQL', () => {
  let world: HttpWorld
  beforeAll(async () => { world = await startHttpWorld() })
  afterAll(async () => { await world?.close() })

  /** Retiene las dos primeras lecturas hasta que las dos peticiones llegaron. */
  const holdReads = (repository: object, method: string) => {
    const target = repository as Record<string, (...args: unknown[]) => Promise<unknown>>
    const read = target[method]!.bind(repository)
    let arrivals = 0
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    return vi.spyOn(target, method).mockImplementation(async (...args) => {
      const value = await read(...args)
      if (arrivals < 2) {
        arrivals += 1
        if (arrivals === 2) release()
        await gate
      }
      return value
    })
  }
  const races = async (path: string, patches: [Record<string, unknown>, Record<string, unknown>]) => {
    const responses = await Promise.all(patches.map(patch => world.fetch('PATCH', path, { cookie: world.actors.owner.cookie, body: patch })))
    const winnerIndex = responses.findIndex(response => response.status === 200)
    expect(responses.map(response => response.status).sort()).toEqual([200, 409])
    const loser = responses[1 - winnerIndex]!
    expect(apiErrorSchema.parse(loser.body).message.length).toBeGreaterThan(0)
    return { winner: responses[winnerIndex]!, winnerPatch: patches[winnerIndex]!, loserPatch: patches[1 - winnerIndex]!, loser }
  }
  const auditOf = async (entity: string, entityId: string) =>
    auditListResponseSchema.parse((await world.fetch('GET', `/api/audit?entity=${entity}&entityId=${entityId}&action=updated`, { cookie: world.actors.owner.cookie })).body).items

  it('producto: un ganador, campo del perdedor intacto y un solo evento con los campos del ganador', async () => {
    const spy = holdReads(world.repositories.catalog, 'findProduct')
    try {
      const { winner, winnerPatch, loserPatch, loser } = await races('/api/catalog/products/prod_leche', [{ price: 4700 }, { badge: 'Oferta' }])
      expect(apiErrorSchema.parse(loser.body).error).toBe('CATALOG_CONCURRENT_UPDATE')
      expect(staffProductDtoSchema.parse(winner.body)).toMatchObject({ ...winnerPatch, version: 2 })
      spy.mockRestore()
      const stored = (await world.repositories.catalog.findProduct('leche-y-miel', 'prod_leche'))!
      expect(stored.version).toBe(2)
      if ('price' in winnerPatch) expect({ price: stored.price, badge: stored.badge }).toEqual({ price: 4700, badge: null })
      else expect({ price: stored.price, badge: stored.badge }).toEqual({ price: 4500, badge: 'Oferta' })
      expect(Object.keys(loserPatch).every(field => !(field in winnerPatch))).toBe(true)
      const events = await auditOf('product', 'prod_leche')
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ actorId: world.actors.owner.id, metadata: { fields: Object.keys(winnerPatch), previousVersion: 1, version: 2 } })
    } finally { spy.mockRestore() }
  })

  it('categoría: un ganador, nombre sin mezclar y un solo evento', async () => {
    const [category] = (await world.repositories.catalog.listCategories('leche-y-miel'))
    const spy = holdReads(world.repositories.catalog, 'findCategory')
    try {
      const { winner, winnerPatch, loser } = await races(`/api/catalog/categories/${category!.id}`, [{ name: 'Nombre A' }, { icon: 'cart' }])
      expect(apiErrorSchema.parse(loser.body).error).toBe('CATALOG_CONCURRENT_UPDATE')
      expect(categoryDtoSchema.parse(winner.body)).toMatchObject(winnerPatch)
      spy.mockRestore()
      const stored = (await world.repositories.catalog.findCategory('leche-y-miel', category!.id))!
      expect(stored.version).toBe(2)
      expect({ name: stored.name === 'Nombre A', icon: stored.icon === 'cart' }).toEqual('name' in winnerPatch ? { name: true, icon: false } : { name: false, icon: true })
      const events = await auditOf('category', category!.id)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ actorId: world.actors.owner.id, metadata: { fields: Object.keys(winnerPatch), version: 2 } })
    } finally { spy.mockRestore() }
  })

  it('tienda: un ganador, campos sin mezclar y un solo evento sin valores', async () => {
    const before = (await world.repositories.store.findSettings('leche-y-miel'))!
    const spy = holdReads(world.repositories.store, 'findSettings')
    try {
      const { winner, winnerPatch, loser } = await races('/api/store/staff', [{ name: 'Tienda concurrente A' }, { address: 'DIRECCION PRIVADA B' }])
      expect(apiErrorSchema.parse(loser.body).error).toBe('STORE_CONCURRENT_UPDATE')
      expect(storeDtoSchema.parse(winner.body)).toMatchObject(winnerPatch)
      spy.mockRestore()
      const stored = (await world.repositories.store.findSettings('leche-y-miel'))!
      expect(stored.version).toBe(before.version + 1)
      expect({ name: stored.name, address: stored.address }).toEqual('name' in winnerPatch
        ? { name: 'Tienda concurrente A', address: before.address }
        : { name: before.name, address: 'DIRECCION PRIVADA B' })
      const events = await auditOf('store', 'leche-y-miel')
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ actorId: world.actors.owner.id, metadata: { fields: Object.keys(winnerPatch), version: stored.version } })
      expect(JSON.stringify(events)).not.toMatch(/DIRECCION PRIVADA|Tienda concurrente/)
    } finally { spy.mockRestore() }
  })
})
