import { expect, test } from '@playwright/test'
import type { StaffProductDto, StoreDto, UpdateProductRequest, UpdateStoreSettingsRequest } from '../../shared/contracts/index.js'
import { TechnicalFixtures, type FixtureApi } from '../support/fixtures.js'
import { carryOver, type RuntimeRecord } from '../support/runtime.js'

// Sin red: el doble en memoria solo reproduce el contrato owner (versión de personal, PATCH parcial).
function fakeApi() {
  const calls: string[] = []
  const store = { storeId: 'store-1', contactPhone: null as string | null, scheduleOverride: 'auto' } as unknown as StoreDto
  const products = new Map<string, StaffProductDto>([
    ['p1', { id: 'p1', price: 50, inStock: true, version: 3 } as unknown as StaffProductDto],
    ['p2', { id: 'p2', price: 80, inStock: true, version: 7 } as unknown as StaffProductDto],
  ])
  const api: FixtureApi = {
    readStaffStore: async () => ({ ...store }),
    readStaffProduct: async (id) => { calls.push(`read:${id}`); return { ...products.get(id)! } },
    patchStore: async (patch: UpdateStoreSettingsRequest) => { calls.push('patchStore'); Object.assign(store, patch); return { ...store } },
    patchProduct: async (id: string, patch: UpdateProductRequest) => {
      calls.push(`patch:${id}`)
      const next = { ...products.get(id)!, ...patch, version: products.get(id)!.version + 1 } as StaffProductDto
      products.set(id, next)
      return { ...next }
    },
  }
  return { api, calls, store, products }
}

const blankRuntime = (): RuntimeRecord => ({
  block: 'T-22', phase: 'prepared', startedAt: 'x', previewSha: null, readyStamp: 'r1', orders: [], findings: [],
})

test.describe('fixtures técnicos', () => {
  test('registran valor previo y versión real ANTES de mutar', async () => {
    const { api, products } = fakeApi()
    const runtime = blankRuntime()
    const snapshots: string[] = []
    const guarded: FixtureApi = {
      ...api,
      patchProduct: async (id, patch) => { snapshots.push(JSON.stringify(runtime.fixtures)); return api.patchProduct(id, patch) },
    }
    await new TechnicalFixtures(guarded, runtime, () => undefined).product('p1', { inStock: false })
    expect(JSON.parse(snapshots[0]!)).toEqual([{ kind: 'product', id: 'p1', original: { inStock: true }, applied: { inStock: false }, versionBefore: 3, restored: false }])
    expect(products.get('p1')!.inStock).toBe(false)
  })

  test('restauran en orden inverso y verifican los campos', async () => {
    const { api, products, store } = fakeApi()
    const runtime = blankRuntime()
    const fixtures = new TechnicalFixtures(api, runtime, () => undefined)
    await fixtures.store({ contactPhone: '573101234567' })
    await fixtures.product('p1', { price: 99 })
    await fixtures.product('p2', { inStock: false })
    await fixtures.restore()
    expect(store.contactPhone).toBeNull()
    expect(products.get('p1')).toMatchObject({ price: 50, inStock: true })
    expect(products.get('p2')).toMatchObject({ price: 80, inStock: true })
    expect(runtime.fixtures!.every((fixture) => fixture.restored)).toBe(true)
  })

  test('no pisan un valor que otro actor cambió después', async () => {
    const { api, products } = fakeApi()
    const runtime = blankRuntime()
    const fixtures = new TechnicalFixtures(api, runtime, () => undefined)
    await fixtures.product('p1', { price: 99 })
    products.set('p1', { ...products.get('p1')!, price: 70 })
    await fixtures.restore()
    expect(products.get('p1')!.price).toBe(70)
    expect(runtime.findings.join(' ')).toContain('otro actor cambió price')
    expect(runtime.fixtures![0]!.restored).toBe(true)
  })

  test('el producto editado por UI se restaura de forma incondicional', async () => {
    const { api, products } = fakeApi()
    const runtime = blankRuntime()
    const fixtures = new TechnicalFixtures(api, runtime, () => undefined)
    await fixtures.watchProduct('p1', ['price'])
    products.set('p1', { ...products.get('p1')!, price: 187 })
    await fixtures.restore()
    expect(products.get('p1')!.price).toBe(50)
  })

  test('un fallo al restaurar no impide devolver el resto y se informa', async () => {
    const { api, products } = fakeApi()
    const runtime = blankRuntime()
    const fixtures = new TechnicalFixtures({ ...api, patchProduct: async (id, patch) => (id === 'p1' && patch.price === 50 ? Promise.reject(new Error('PATCH rechazado')) : api.patchProduct(id, patch)) }, runtime, () => undefined)
    await fixtures.product('p2', { inStock: false })
    await fixtures.product('p1', { price: 99 })
    await expect(fixtures.restore()).rejects.toThrow(/Fixtures sin restaurar: product p1/)
    expect(products.get('p2')!.inStock).toBe(true)
    expect(runtime.fixtures!.find((fixture) => fixture.id === 'p1')!.restored).toBe(false)
  })

  test('un segundo restore no repite cambios ya devueltos', async () => {
    const { api, calls } = fakeApi()
    const runtime = blankRuntime()
    const fixtures = new TechnicalFixtures(api, runtime, () => undefined)
    await fixtures.product('p1', { inStock: false })
    await fixtures.restore()
    const patches = calls.filter((call) => call.startsWith('patch:')).length
    await fixtures.restore()
    expect(calls.filter((call) => call.startsWith('patch:')).length).toBe(patches)
  })
})

test.describe('registro de la corrida', () => {
  const previous: RuntimeRecord = {
    ...blankRuntime(),
    orders: [{ key: 'k1', orderId: 'o1' }],
    findings: ['hallazgo'],
    override: { original: 'auto', applied: 'open', restored: false },
    fixtures: [
      { kind: 'product', id: 'p1', original: { price: 50 }, restored: false },
      { kind: 'product', id: 'p2', original: { price: 80 }, restored: true },
    ],
  }

  test('mismo ready: conserva pedidos, hallazgos, override y fixtures', () => {
    const next = carryOver('sha', 'r1', previous)
    expect(next).toMatchObject({ orders: previous.orders, findings: ['hallazgo'], override: previous.override })
    expect(next.fixtures).toHaveLength(2)
  })

  test('ready nuevo: empieza limpio pero hereda el estado vivo sin devolver', () => {
    const next = carryOver('sha', 'r2', previous)
    expect(next.orders).toEqual([])
    expect(next.findings).toEqual([])
    expect(next.override).toEqual(previous.override)
    expect(next.fixtures!.map((fixture) => fixture.id)).toEqual(['p1'])
  })

  test('sin registro previo o con todo devuelto no arrastra nada', () => {
    expect(carryOver('sha', 'r1', null).fixtures).toBeUndefined()
    const done: RuntimeRecord = { ...previous, override: { original: 'auto', applied: 'open', restored: true }, fixtures: [{ kind: 'store', id: 's', original: {}, restored: true }] }
    const next = carryOver('sha', 'r2', done)
    expect(next.override).toBeUndefined()
    expect(next.fixtures).toBeUndefined()
  })
})
