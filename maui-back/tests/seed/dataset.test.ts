import { describe, expect, it } from 'vitest'
import { sharedProducts } from '../../../shared/catalog/index.js'
import { ENTITY_ID_PATTERN, canTransition, createOrderRequestSchema, isTerminalOrderStatus } from '../../../shared/contracts/index.js'
import { resolveOrderReception } from '../../src/domain/store/storeRules.js'
import {
  SEED_CUSTOMERS, SEED_ORDERS, SEED_STAFF, SEED_STORE, SEED_STORE_SETTINGS, expectedStatusAfter, finalStatusOf, orderRequestFor, seedCustomerOf,
  seedOrderKey, stepInstant,
} from '../../src/usecases/seed/dataset.js'
import { buildSeedManifest, canonicalJson } from '../../src/usecases/seed/manifest.js'

const products = new Map(sharedProducts.map(product => [product.id, product]))

describe('dataset de seed (T-16)', () => {
  it('IDs únicos y válidos para pedidos, cuentas y claves de idempotencia', () => {
    const ids = [...SEED_ORDERS.map(order => order.id), ...SEED_STAFF.map(staff => staff.id), ...SEED_CUSTOMERS.map(customer => customer.id)]
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(ENTITY_ID_PATTERN)
    const keys = SEED_ORDERS.map(seedOrderKey)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key).toMatch(/^[A-Za-z0-9._:-]{16,128}$/)
  })

  it('cada pedido cumple el contrato real de creación con su cliente', () => {
    for (const spec of SEED_ORDERS) {
      const parsed = createOrderRequestSchema.safeParse(orderRequestFor(spec, seedCustomerOf(spec.customer).id))
      expect(parsed.success, spec.id).toBe(true)
    }
  })

  it('los pedidos caen dentro del horario y antes del corte de la tienda de test, sin cambiar reglas', () => {
    for (const spec of SEED_ORDERS) {
      const reception = resolveOrderReception(SEED_STORE_SETTINGS, {
        deliveryType: spec.request.deliveryType, timeSlot: spec.request.deliveryData.timeSlot,
      }, new Date(spec.createdAt))
      // Se reciben atendiendo: sin aviso de procesamiento diferido.
      expect(reception.processingNotice, spec.id).toBeUndefined()
    }
    // Las reglas siguen siendo las de T-08: cobertura urbana fijada y contacto del negocio sin inventar.
    expect(SEED_STORE_SETTINGS.contactPhone).toBeNull()
    expect(SEED_STORE_SETTINGS.delivery.coverageNote).toBe('Solo hay cobertura en el casco urbano de Dolores')
    expect(SEED_STORE_SETTINGS.delivery.cutoff).toBe('17:00')
  })

  it('cada guion respeta la máquina de estados común y los pasos de ítems ocurren en preparing', () => {
    for (const spec of SEED_ORDERS) {
      let status = expectedStatusAfter(spec, 0)
      expect(status).toBe('received')
      spec.steps.forEach((step, index) => {
        if (step.action.kind === 'status') {
          expect(canTransition(status, step.action.status, spec.request.deliveryType), `${spec.id} paso ${index}`).toBe(true)
          if (step.action.status === 'cancelled') expect(step.action.reason?.length ?? 0).toBeGreaterThanOrEqual(5)
        } else {
          expect(status, `${spec.id} paso ${index}`).toBe('preparing')
        }
        status = expectedStatusAfter(spec, index + 1)
      })
      expect(status).toBe(finalStatusOf(spec))
    }
  })

  it('los instantes de los pasos crecen y quedan en el pasado de la fecha del seed', () => {
    for (const spec of SEED_ORDERS) {
      const instants = spec.steps.map((_, index) => Date.parse(stepInstant(spec, index)))
      expect([...instants].sort((a, b) => a - b)).toEqual(instants)
      for (const instant of instants) expect(instant).toBeGreaterThan(Date.parse(spec.createdAt))
    }
  })

  it('cubre estados, modalidades, peso fijo/variable, envío gratis, sustitución y cancelaciones', () => {
    expect(new Set(SEED_ORDERS.map(finalStatusOf))).toEqual(new Set(['received', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered', 'cancelled']))
    expect(new Set(SEED_ORDERS.map(order => order.request.deliveryType))).toEqual(new Set(['pickup', 'delivery']))
    const lines = SEED_ORDERS.flatMap(order => order.request.items.map(item => products.get(item.id)))
    expect(lines.some(product => product?.is_variable_weight)).toBe(true)
    expect(lines.some(product => product && !product.is_variable_weight)).toBe(true)
    expect(SEED_ORDERS.some(order => order.steps.some(step => step.action.kind === 'items' && step.action.changes.some(change => change.type === 'substitute')))).toBe(true)
    expect(SEED_ORDERS.filter(order => finalStatusOf(order) === 'cancelled').length).toBeGreaterThanOrEqual(2)
    expect(SEED_ORDERS.some(order => order.request.substitutionPreference === 'call_me')).toBe(true)
  })

  it('solo referencia productos del baseline pedibles y deja el agotado fuera de los pedidos', () => {
    const referenced = new Set(SEED_ORDERS.flatMap(order => [
      ...order.request.items.map(item => item.id),
      ...order.steps.flatMap(step => (step.action.kind === 'items' ? step.action.changes.flatMap(change => (change.type === 'substitute' ? [change.productId] : [])) : [])),
    ]))
    for (const id of referenced) expect(products.get(id), id).toBeDefined()
    const outOfStock = sharedProducts.filter(product => product.inStock === false).map(product => product.id)
    expect(outOfStock).toEqual(['jabon-bano-3pack'])
    for (const id of outOfStock) expect(referenced.has(id)).toBe(false)
  })

  it('no inventa el teléfono del negocio: los celulares de fixture son de cuentas de test', () => {
    for (const customer of SEED_CUSTOMERS) expect(customer.phone).toMatch(/^300000000\d$/)
    expect(SEED_STORE).toBe('leche-y-miel')
  })

  it('las cuentas se declaran sin contraseñas ni material secreto', () => {
    const text = JSON.stringify({ SEED_STAFF, SEED_CUSTOMERS, SEED_ORDERS })
    expect(text).not.toMatch(/password|secret|token|hash/i)
  })
})

describe('manifiesto', () => {
  it('es determinista y no incluye secretos', () => {
    const manifest = buildSeedManifest()
    expect(buildSeedManifest()).toEqual(manifest)
    expect(manifest).toMatchObject({
      datasetVersion: 'test-seed-v1', storeId: 'leche-y-miel',
      counts: { categories: 9, products: 16, accounts: 4, orders: SEED_ORDERS.length },
    })
    expect(manifest.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(manifest)).not.toMatch(/password|secret|hash":"\$/i)
    expect(manifest.orders.map(order => order.finalStatus)).toEqual(SEED_ORDERS.map(finalStatusOf))
  })

  it('canonicalJson ignora el orden de claves y los valores undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: undefined, z: 2 }], c: null } })).toBe(canonicalJson({ a: { c: null, d: [2, { z: 2, y: 1 }] }, b: 1 }))
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }))
  })
})
