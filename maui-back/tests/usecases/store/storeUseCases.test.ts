import { beforeEach, describe, expect, it } from 'vitest'
import { AuthorizationError } from '../../../src/domain/auth/errors.js'
import { StoreConflictError, StoreRuleError } from '../../../src/domain/store/errors.js'
import type { StoreActor } from '../../../src/domain/store/storeAccess.js'
import { toStoreDto } from '../../../src/domain/store/storeMappers.js'
import { StoreRepositoryMemory } from '../../../src/infra/memory/StoreRepositoryMemory.js'
import { NotFoundError, ValidationError } from '../../../src/shared/errors.js'
import { evaluateOrderFulfillment } from '../../../src/usecases/store/evaluateOrderFulfillment.js'
import { getStaffStoreSettings, getStoreSettings } from '../../../src/usecases/store/getStore.js'
import { initializeStore } from '../../../src/usecases/store/initializeStore.js'
import { updateStoreSettings } from '../../../src/usecases/store/updateStoreSettings.js'
import { TestClock } from '../../auth/fixtures.js'

const STORE = 'leche-y-miel'
const owner: StoreActor = { id: 'acc_owner', role: 'owner', storeId: STORE }
const operator: StoreActor = { id: 'acc_operator', role: 'operator', storeId: STORE }
const customer: StoreActor = { id: 'acc_customer', role: 'customer', storeId: null }
const foreignOwner: StoreActor = { id: 'acc_foreign', role: 'owner', storeId: 'otra-tienda' }

/** Lunes 2026-10-05, 10:00 en Bogotá. */
const MONDAY_10AM = new Date('2026-10-05T15:00:00.000Z')

describe('casos de uso de tienda', () => {
  let store: StoreRepositoryMemory
  let clock: TestClock

  beforeEach(async () => {
    store = new StoreRepositoryMemory()
    clock = new TestClock(MONDAY_10AM)
    await initializeStore({ store, clock })
  })

  it('inicialización idempotente: no sobrescribe la configuración editada', async () => {
    await updateStoreSettings({ store, clock }, owner, { name: 'Leche y Miel Centro' })
    const again = await initializeStore({ store, clock })
    expect(again.created).toBe(false)
    expect(again.settings.name).toBe('Leche y Miel Centro')
    await expect(initializeStore({ store, clock }, { storeId: 'x', overrides: { contactPhone: '573000000000' } })).rejects.toBeInstanceOf(ValidationError)
  })

  it('tienda sin inicializar responde 404, sin valores por defecto inventados', async () => {
    await expect(getStoreSettings({ store }, 'sin-config')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('solo el owner edita; operator lee; cliente no accede a la vista de personal', async () => {
    await expect(updateStoreSettings({ store, clock }, operator, { scheduleOverride: 'closed' })).rejects.toBeInstanceOf(AuthorizationError)
    await expect(updateStoreSettings({ store, clock }, customer, { name: 'X' })).rejects.toBeInstanceOf(AuthorizationError)
    expect((await getStaffStoreSettings({ store }, operator)).id).toBe(STORE)
    await expect(getStaffStoreSettings({ store }, customer)).rejects.toBeInstanceOf(AuthorizationError)
    expect((await getStoreSettings({ store }, STORE)).scheduleOverride).toBe('auto')
  })

  it('el owner de otra tienda edita solo la suya (aquí inexistente)', async () => {
    await expect(updateStoreSettings({ store, clock }, foreignOwner, { name: 'Robada' })).rejects.toBeInstanceOf(NotFoundError)
    expect((await getStoreSettings({ store }, STORE)).name).toBe('Leche y Miel')
  })

  it('fusiona delivery parcial, normaliza contacto y sube versión', async () => {
    clock.advanceSeconds(60)
    const updated = await updateStoreSettings({ store, clock }, owner, {
      contactPhone: '+57 310 123 4567',
      delivery: { shippingCost: 4000 },
    })
    expect(updated.contactPhone).toBe('573101234567')
    expect(updated.delivery).toMatchObject({ shippingCost: 4000, freeShippingThreshold: 30000, cutoff: '17:00' })
    expect(updated.version).toBe(2)
    expect(updated.updatedAt).toBe(clock.nowIso())
    expect((await updateStoreSettings({ store, clock }, owner, { contactPhone: null })).contactPhone).toBeNull()
  })

  it('una edición con versión vieja no pisa la vigente', async () => {
    const stale = await getStoreSettings({ store }, STORE)
    await updateStoreSettings({ store, clock }, owner, { scheduleOverride: 'closed' })
    // Lectura obsoleta (otra edición ganó entre la lectura y el UPDATE condicionado).
    const racing = {
      findSettings: async () => stale,
      insertSettingsIfAbsent: (s: typeof stale) => store.insertSettingsIfAbsent(s),
      updateSettings: (s: typeof stale, expected: number) => store.updateSettings(s, expected),
    }
    await expect(updateStoreSettings({ store: racing, clock }, owner, { name: 'Viejo' })).rejects.toBeInstanceOf(StoreConflictError)
    expect(await getStoreSettings({ store }, STORE)).toMatchObject({ name: 'Leche y Miel', scheduleOverride: 'closed' })
  })

  it('el DTO público expone nota de cobertura y disponibilidad calculada, sin versión', async () => {
    const dto = toStoreDto(await getStoreSettings({ store }, STORE), MONDAY_10AM)
    expect(dto).toMatchObject({
      storeId: STORE,
      contactPhone: null,
      timeZone: 'America/Bogota',
      delivery: { coverageNote: 'Solo hay cobertura en el casco urbano de Dolores' },
      availability: { isOpen: true, localTime: '10:00', weekday: 'mon', acceptsDelivery: true },
    })
    expect(dto).not.toHaveProperty('version')
  })

  it('reglas para T-10: cierre/franja con reloj inyectado y envío por modalidad', async () => {
    const deps = { store, clock }
    expect(await evaluateOrderFulfillment(deps, STORE, { deliveryType: 'delivery', itemsSubtotal: 12_000 })).toMatchObject({
      shippingCost: 3000,
      freeShippingApplied: false,
    })
    expect(await evaluateOrderFulfillment(deps, STORE, { deliveryType: 'delivery', itemsSubtotal: 30_000, timeSlot: 'morning' })).toMatchObject({
      shippingCost: 0,
      freeShippingApplied: true,
    })
    expect((await evaluateOrderFulfillment(deps, STORE, { deliveryType: 'pickup', itemsSubtotal: 5000 })).shippingCost).toBe(0)

    clock.advanceSeconds(10 * 3600) // 20:00 Bogotá: cerrado
    await expect(evaluateOrderFulfillment(deps, STORE, { deliveryType: 'pickup', itemsSubtotal: 5000 })).rejects.toBeInstanceOf(StoreRuleError)
  })
})
