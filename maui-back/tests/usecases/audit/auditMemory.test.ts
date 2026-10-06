import { describe, expect, it, vi } from 'vitest'
import { auditMetadataSchema, listAuditQuerySchema } from '../../../../shared/contracts/audit.js'
import { AuditPersistenceError, auditFor } from '../../../src/domain/audit/AuditRepository.js'
import { AuditRepositoryMemory } from '../../../src/infra/memory/AuditRepositoryMemory.js'
import { CatalogRepositoryMemory } from '../../../src/infra/memory/CatalogRepositoryMemory.js'
import { OrdersRepositoryMemory } from '../../../src/infra/memory/OrdersRepositoryMemory.js'
import { StoreRepositoryMemory } from '../../../src/infra/memory/StoreRepositoryMemory.js'
import { listAuditForActor } from '../../../src/usecases/audit/listAudit.js'
import { TestClock } from '../../auth/fixtures.js'
import { internalOrder } from '../../contratos/fixtures.js'
import { initializeOrderCatalog } from '../../orders/creationFixture.js'

describe('auditoría memory y contrato seguro', () => {
  it('seed sistema/idempotente, actor de negocio, CAS perdedor y fallo audit sin escritura', async () => {
    const audit = new AuditRepositoryMemory(), store = new StoreRepositoryMemory(audit)
    const catalog = new CatalogRepositoryMemory(id => store.hasStore(id), audit)
    const orders = new OrdersRepositoryMemory(audit)
    const clock = new TestClock(new Date('2026-10-02T12:00:00Z'))
    await initializeOrderCatalog({ catalog, store, clock })
    const actor = { id: 'owner-real', role: 'owner' as const, storeId: 'leche-y-miel' }
    const list = () => listAuditForActor(audit, actor, listAuditQuerySchema.parse({ limit: '100' }))
    const seeded = await list()
    expect(seeded.items.find(event => event.entity === 'store')).toMatchObject({ actorKind: 'system', actorId: null, metadata: { version: 1 } })
    const settings = (await store.findSettings(actor.storeId))!
    expect(await store.insertSettingsIfAbsent(settings)).toBe(false)
    expect((await list()).items).toHaveLength(seeded.items.length)
    const product = (await catalog.findProduct(actor.storeId, 'prod_leche'))!
    const updated = { ...product, price: product.price + 100, version: 2 }
    expect(await catalog.updateProduct(updated, 1, auditFor(actor, ['price']))).toEqual(updated)
    expect(await catalog.updateProduct(updated, 1, auditFor(actor, ['price']))).toBeNull()
    expect((await list()).items.filter(event => event.action === 'updated')).toHaveLength(1)
    expect((await list()).items.find(event => event.action === 'updated')).toMatchObject({ actorId: actor.id, metadata: { fields: ['price'], previousVersion: 1, version: 2 } })
    const order = { ...internalOrder(), id: 'audit-order', storeId: actor.storeId }
    const stored = await orders.create(order)
    expect((await list()).items.find(event => event.entityId === order.id)).toMatchObject({ actorKind: 'system', actorId: null, metadata: { version: order.version } })
    const before = (await list()).items.length
    const spy = vi.spyOn(audit, 'append').mockImplementation(() => { throw new AuditPersistenceError() })
    try {
      await expect(catalog.updateProduct({ ...updated, price: 1, version: 3 }, 2, auditFor(actor))).rejects.toBeInstanceOf(AuditPersistenceError)
      await expect(store.updateSettings({ ...settings, name: 'No persistir', version: 2 }, 1, auditFor(actor))).rejects.toBeInstanceOf(AuditPersistenceError)
      await expect(orders.saveChange({ expected: order, next: { ...order, status: 'confirmed', version: 2, updatedBy: actor.id }, products: [] })).rejects.toBeInstanceOf(AuditPersistenceError)
      expect(await catalog.findProduct(actor.storeId, product.id)).toEqual(updated)
      expect(await store.findSettings(actor.storeId)).toEqual(settings)
      expect(await orders.findById(order.id)).toEqual(stored)
      expect((await list()).items).toHaveLength(before)
    } finally { spy.mockRestore() }
  })
  it('metadata rechaza texto libre, snapshots y claves no autorizadas', () => {
    for (const input of [{ customerName: 'Ana' }, { fields: ['customerPhone'] }, { cancellationReason: 'Texto' }, { changes: [{ type: 'remove', itemId: 'a', by: 'body-actor' }] }, { status: 'texto libre' }]) expect(auditMetadataSchema.safeParse(input).success).toBe(false)
    expect(auditMetadataSchema.safeParse({ fields: ['contactPhone', 'address'] }).success).toBe(true)
  })
})
