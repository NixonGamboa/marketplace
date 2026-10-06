import { describe, expect, it } from 'vitest'
import type { OrderItemChange } from '../../../../shared/contracts/index.js'
import type { CatalogProduct } from '../../../src/domain/catalog/Catalog.js'
import type { Order, OrderStatus } from '../../../src/domain/orders/Order.js'
import {
  applyItemChanges,
  applyStatusChange,
  type OrderChangeContext,
  type SubstituteCatalog,
} from '../../../src/domain/orders/orderLifecycle.js'
import { toOrderDto } from '../../../src/domain/orders/orderMappers.js'
import { ValidationError } from '../../../src/shared/errors.js'
import { NOW_ISO, internalOrder } from '../../contratos/fixtures.js'

const ctx: OrderChangeContext = { actorId: 'acc_operador', now: '2026-09-03T12:00:00.000Z' }

/** Pedido a domicilio: leche 2 × 4500 + carne 1,5 kg × 22000/kg + envío 3000 = 45000 estimado. */
const order = (overrides: Partial<Order> = {}): Order => internalOrder(overrides)
const preparing = (overrides: Partial<Order> = {}): Order => order({ status: 'preparing', version: 3, ...overrides })

const product = (overrides: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id: 'prod_queso', storeId: 'leche-y-miel', categoryId: 'cat', name: 'Queso campesino', displayName: null,
  legalName: null, price: 9000, originalPrice: null, unit: '500 g', imageUrl: '/q.png', inStock: true,
  isVariableWeight: false, badge: null, currency: 'COP', description: null, nutritionalInfo: null,
  availability: null, active: true, archivedAt: null, version: 7, createdAt: NOW_ISO, updatedAt: NOW_ISO,
  ...overrides,
})

const pollo = product({ id: 'prod_pollo', name: 'Pechuga de pollo', price: 4990, unit: 'Por Kilogramo', isVariableWeight: true })
const catalogOf = (...products: (CatalogProduct | [string, null])[]): SubstituteCatalog =>
  new Map(products.map((entry) => (Array.isArray(entry) ? entry : [entry.id, entry])))

const items = (target: Order, changes: OrderItemChange[], catalog: SubstituteCatalog = catalogOf()) =>
  applyItemChanges(target, changes, catalog, ctx)

const rejection = (run: () => unknown): ValidationError => {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError)
    return error as ValidationError
  }
  throw new Error('Se esperaba ValidationError')
}
const issuePaths = (run: () => unknown): string[] =>
  ((rejection(run).issues ?? []) as { path: string }[]).map((issue) => issue.path)

describe('applyStatusChange: máquina común por modalidad', () => {
  it('recorre el flujo de retiro y deja versión, actor y fecha en cada paso', () => {
    let current = order({ deliveryType: 'pickup', deliveryData: {}, shippingCost: 0, estimatedTotal: 42000,
      items: [{ id: 'prod_leche', name: 'Leche', qty: 2, priceAtMoment: 4500, picked: true }] })
    for (const [index, status] of (['confirmed', 'preparing', 'ready', 'delivered'] as OrderStatus[]).entries()) {
      current = applyStatusChange(current, { status }, ctx)
      expect(current).toMatchObject({ status, version: index + 2, updatedBy: 'acc_operador', updatedAt: ctx.now, estimatedTotal: 42000 })
    }
  })

  it('in_delivery solo en domicilio y nunca se cancela desde ahí', () => {
    const ready = order({ status: 'ready', finalTotal: 45000, items: [{ id: 'prod_leche', qty: 2, priceAtMoment: 4500 }] })
    expect(applyStatusChange(ready, { status: 'in_delivery' }, ctx).status).toBe('in_delivery')
    rejection(() => applyStatusChange({ ...ready, deliveryType: 'pickup', deliveryData: {}, shippingCost: 0 }, { status: 'in_delivery' }, ctx))
    rejection(() => applyStatusChange({ ...ready, status: 'in_delivery' }, { status: 'cancelled', reason: 'Motivo válido' }, ctx))
  })

  it('no salta pasos ni retrocede', () => {
    for (const [from, to] of [['received', 'preparing'], ['received', 'ready'], ['preparing', 'confirmed'], ['ready', 'confirmed'],
      ['in_delivery', 'preparing'], ['in_delivery', 'ready'], ['confirmed', 'received']] as const) {
      expect(issuePaths(() => applyStatusChange(order({ status: from }), { status: to }, ctx))).toEqual(['status'])
    }
  })

  it.each(['delivered', 'cancelled'] as const)('%s es inmutable para cualquier destino', (terminal) => {
    for (const status of ['received', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered', 'cancelled'] as const) {
      expect(rejection(() => applyStatusChange(order({ status: terminal }), { status, reason: 'Motivo válido' }, ctx)).message)
        .toContain('no admite cambios')
    }
  })

  it('ready exige todos los pesos reales y fija el total final', () => {
    const unweighed = preparing({ items: [{ ...order().items[0]!, picked: true }, order().items[1]!] })
    expect(issuePaths(() => applyStatusChange(unweighed, { status: 'ready' }, ctx))).toEqual(['items.1.picked'])
    const weighed = preparing({ items: [{ ...order().items[0]!, picked: true }, { ...order().items[1]!, kilosReal: 1.237, picked: true }] })
    // 9000 + round(22000 × 1,237) = 9000 + 27214 + envío 3000.
    expect(applyStatusChange(weighed, { status: 'ready' }, ctx)).toMatchObject({ status: 'ready', finalTotal: 39214, estimatedTotal: 45000 })
  })

  it('pedido solo de peso fijo: ready fija el total final igual a ítems + envío', () => {
    const fixed = preparing({ items: [{ id: 'prod_leche', name: 'Leche', qty: 3, priceAtMoment: 4500, picked: true }], estimatedTotal: 16500 })
    expect(applyStatusChange(fixed, { status: 'ready' }, ctx).finalTotal).toBe(16500)
  })

  it('cancelar guarda motivo y fecha; conserva estimación, envío e ítems', () => {
    const before = order({ status: 'confirmed', version: 2 })
    const cancelled = applyStatusChange(before, { status: 'cancelled', reason: 'Cliente no responde' }, ctx)
    expect(cancelled).toMatchObject({
      status: 'cancelled', cancellationReason: 'Cliente no responde', cancelledAt: ctx.now, version: 3,
      estimatedTotal: before.estimatedTotal, shippingCost: before.shippingCost, items: before.items,
    })
    expect(issuePaths(() => applyStatusChange(before, { status: 'cancelled' }, ctx))).toEqual(['reason'])
  })

  it('updatedAt no retrocede si el reloj de esta instancia va atrasado', () => {
    const later = order({ updatedAt: '2026-09-03T13:00:00.000Z' })
    expect(applyStatusChange(later, { status: 'confirmed' }, ctx).updatedAt).toBe('2026-09-03T13:00:00.000Z')
  })
})

describe('applyStatusChange: etapas de entrega con total final (pedidos legacy)', () => {
  const fixedLegacy = (status: OrderStatus): Order => {
    const { shippingCost: _shipping, finalTotal: _final, ...legacy } = order({
      status, items: [{ id: 'prod_leche', name: 'Leche', qty: 2, priceAtMoment: 4500 }], estimatedTotal: 9000,
    })
    return legacy
  }

  it('legacy fijo en ready/in_delivery sin total: avanzar fija el total final (sin envío guardado, solo ítems)', () => {
    expect(applyStatusChange(fixedLegacy('ready'), { status: 'in_delivery' }, ctx)).toMatchObject({ status: 'in_delivery', finalTotal: 9000 })
    expect(applyStatusChange(fixedLegacy('ready'), { status: 'delivered' }, ctx)).toMatchObject({ status: 'delivered', finalTotal: 9000 })
    expect(applyStatusChange(fixedLegacy('in_delivery'), { status: 'delivered' }, ctx)).toMatchObject({ status: 'delivered', finalTotal: 9000 })
    const withShipping = { ...fixedLegacy('ready'), shippingCost: 3000 }
    expect(applyStatusChange(withShipping, { status: 'delivered' }, ctx).finalTotal).toBe(12000)
  })

  it('legacy variable sin peso real en ready/in_delivery: no avanza a entrega; ready aún se cancela', () => {
    const missing = (status: OrderStatus): Order => order({ status })
    for (const [status, next] of [['ready', 'in_delivery'], ['ready', 'delivered'], ['in_delivery', 'delivered']] as const) {
      expect(issuePaths(() => applyStatusChange(missing(status), { status: next }, ctx))).toEqual(['items.1.kilosReal'])
    }
    expect(applyStatusChange(missing('ready'), { status: 'cancelled', reason: 'Peso no registrado' }, ctx).status).toBe('cancelled')
  })

  it('un total final previo se recalcula de forma coherente con ítems y envío al entregar', () => {
    const weighed = order({ status: 'in_delivery', finalTotal: 1, items: [order().items[0]!, { ...order().items[1]!, kilosReal: 1.237 }] })
    expect(applyStatusChange(weighed, { status: 'delivered' }, ctx).finalTotal).toBe(39214)
  })
})

describe('applyItemChanges: preferencia call_me y constancia de contacto', () => {
  const callMe = (): Order => preparing({ substitutionPreference: 'call_me' })
  const substitute = { type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 } as const

  it('sin constancia de contacto no se quita ni se sustituye', () => {
    expect(issuePaths(() => items(callMe(), [substitute], catalogOf(product())))).toEqual(['changes.0.customerContacted'])
    expect(issuePaths(() => items(callMe(), [{ type: 'remove', itemId: 'prod_leche' }]))).toEqual(['changes.0.customerContacted'])
  })

  it('pesar no es un cambio de producto: no exige contacto', () => {
    expect(items(callMe(), [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.5 }]).finalTotal).toBe(45000)
  })

  it('con la declaración del personal se aplica y queda la constancia con actor y fecha, fuera del DTO', () => {
    const next = items(callMe(), [{ ...substitute, customerContacted: true }, { type: 'remove', itemId: 'prod_carne', customerContacted: true }], catalogOf(product()))
    expect(next.items.map((item) => item.id)).toEqual(['prod_queso'])
    expect(next.itemAdjustments).toEqual([
      { type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', customerContacted: true, by: 'acc_operador', at: ctx.now },
      { type: 'remove', itemId: 'prod_carne', customerContacted: true, by: 'acc_operador', at: ctx.now },
    ])
    const dto = toOrderDto(next)
    expect(dto).not.toHaveProperty('itemAdjustments')
    expect(JSON.stringify(dto)).not.toContain('acc_operador')
  })

  it('las constancias se acumulan; con `similar` el cambio queda registrado sin contacto declarado', () => {
    const first = items(preparing(), [substitute], catalogOf(product()))
    const second = items(first, [{ type: 'remove', itemId: 'prod_carne' }], catalogOf())
    expect(second.itemAdjustments?.map(({ type, customerContacted }) => [type, customerContacted])).toEqual([
      ['substitute', false], ['remove', false],
    ])
    expect(items(first, [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1 }]).itemAdjustments).toEqual(first.itemAdjustments)
  })
})

describe('applyItemChanges: pesos reales', () => {
  it('solo en preparación; terminales siguen inmutables', () => {
    for (const status of ['received', 'confirmed', 'ready', 'in_delivery'] as const) {
      expect(issuePaths(() => items(order({ status }), [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1 }]))).toEqual(['status'])
    }
    for (const status of ['delivered', 'cancelled'] as const) {
      expect(rejection(() => items(order({ status }), [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1 }])).message).toContain('no admite cambios')
    }
  })

  it('pesa ítems variables y calcula el total final por línea en gramos (ADR-006)', () => {
    const next = items(preparing(), [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.237 }])
    expect(next.items[1]).toMatchObject({ id: 'prod_carne', kilosRequested: 1.5, kilosReal: 1.237 })
    expect(next).toMatchObject({ finalTotal: 39214, estimatedTotal: 45000, shippingCost: 3000, version: 4, updatedBy: 'acc_operador' })
    expect(next).not.toHaveProperty('originalItems')
    // Repesar corrige el valor y el total.
    expect(items(next, [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.5 }]).finalTotal).toBe(45000)
  })

  it('un peso sobre un ítem fijo o inexistente es un error explícito sin cambios parciales', () => {
    const base = preparing()
    expect(issuePaths(() => items(base, [
      { type: 'weight', itemId: 'prod_carne', kilosReal: 1 },
      { type: 'weight', itemId: 'prod_leche', kilosReal: 1 },
      { type: 'remove', itemId: 'prod_fantasma' },
    ]))).toEqual(['changes.1.kilosReal', 'changes.2.itemId'])
    expect(base.items[1]).not.toHaveProperty('kilosReal')
  })

  it('el total final no supera el tope COP', () => {
    const huge = preparing({ items: [{ id: 'prod_carne', qty: 1, priceAtMoment: 100_000_000, is_variable_weight: true, kilosRequested: 1 }] })
    expect(rejection(() => items(huge, [{ type: 'weight', itemId: 'prod_carne', kilosReal: 2 }])).message).toContain('máximo')
  })
})

describe('applyItemChanges: retiro y sustitución', () => {
  it('quitar fija el snapshot original sin pesos reales y recalcula el total', () => {
    const weighed = items(preparing(), [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.237 }])
    const next = items(weighed, [{ type: 'remove', itemId: 'prod_leche' }])
    expect(next.items.map((item) => item.id)).toEqual(['prod_carne'])
    expect(next.originalItems).toEqual(order().items)
    expect(next).toMatchObject({ finalTotal: 30214, estimatedTotal: 45000 })
    expect(issuePaths(() => items(next, [{ type: 'remove', itemId: 'prod_carne' }]))).toEqual(['changes'])
  })

  it('sustituto con nombre, unidad y precio del catálogo de la tienda', () => {
    const next = items(preparing(), [{ type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 }], catalogOf(product()))
    expect(next.items[0]).toEqual({
      id: 'prod_queso', name: 'Queso campesino', unit: '500 g', priceAtMoment: 9000, is_variable_weight: false,
      qty: 1, substitutedFor: 'prod_leche',
    })
    expect(next.originalItems).toEqual(order().items)
    // Falta el peso de la carne: sin total final hasta pesarla.
    expect(next).not.toHaveProperty('finalTotal')
    expect(toOrderDto(next).items[0]).toMatchObject({ substitutedFor: 'prod_leche' })
  })

  it('sustituto de peso variable: qty 1, kilos pedidos y peso real opcional con redondeo por gramos', () => {
    const changes: OrderItemChange[] = [
      { type: 'substitute', itemId: 'prod_carne', productId: 'prod_pollo', qty: 1, kilosRequested: 0.5, kilosReal: 0.333 },
    ]
    const next = items(preparing(), changes, catalogOf(pollo))
    // floor((4990 × 333 + 500) / 1000) = 1662; + leche 9000 + envío 3000.
    expect(next.items[1]).toMatchObject({ id: 'prod_pollo', priceAtMoment: 4990, kilosRequested: 0.5, kilosReal: 0.333, substitutedFor: 'prod_carne' })
    expect(next.finalTotal).toBe(13662)
    expect(issuePaths(() => items(preparing(), [{ type: 'substitute', itemId: 'prod_carne', productId: 'prod_pollo', qty: 2 }], catalogOf(pollo))))
      .toEqual(expect.arrayContaining(['changes.0.kilosRequested', 'changes.0.qty']))
    expect(issuePaths(() => items(preparing(), [{ type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1, kilosReal: 1 }], catalogOf(product()))))
      .toEqual(['changes.0.kilosReal'])
  })

  it('el sustituto debe ser pedible en la misma tienda y no estar ya en el pedido', () => {
    const cases: [string, SubstituteCatalog, string][] = [
      ['inexistente', catalogOf(['prod_queso', null]), 'prod_queso'],
      ['otra tienda', catalogOf(product({ storeId: 'otra-tienda' })), 'prod_queso'],
      ['agotado', catalogOf(product({ inStock: false })), 'prod_queso'],
      ['inactivo', catalogOf(product({ active: false })), 'prod_queso'],
      ['archivado', catalogOf(product({ archivedAt: NOW_ISO })), 'prod_queso'],
      ['ya en el pedido', catalogOf(product({ id: 'prod_carne' })), 'prod_carne'],
      ['el mismo producto', catalogOf(product({ id: 'prod_leche' })), 'prod_leche'],
    ]
    for (const [, catalog, productId] of cases) {
      expect(issuePaths(() => items(preparing(), [{ type: 'substitute', itemId: 'prod_leche', productId, qty: 1 }], catalog)))
        .toEqual(['changes.0.productId'])
    }
  })

  it('respeta la preferencia `remove`: quitar sí, reemplazar no', () => {
    const base = preparing({ substitutionPreference: 'remove' })
    expect(issuePaths(() => items(base, [{ type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 }], catalogOf(product()))))
      .toEqual(['changes.0.type'])
    expect(items(base, [{ type: 'remove', itemId: 'prod_leche' }]).items).toHaveLength(1)
    expect(items(preparing({ substitutionPreference: 'similar' }), [{ type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 }], catalogOf(product())).items[0]!.id)
      .toBe('prod_queso')
  })

  it('sustituir de nuevo conserva el original raíz y el primer snapshot; volver al original no es sustitución', () => {
    const first = items(preparing(), [{ type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 }], catalogOf(product()))
    const yogurt = product({ id: 'prod_yogurt', name: 'Yogurt', price: 3500, unit: '1 L' })
    const second = items(first, [{ type: 'substitute', itemId: 'prod_queso', productId: 'prod_yogurt', qty: 2 }], catalogOf(yogurt))
    expect(second.items[0]).toMatchObject({ id: 'prod_yogurt', substitutedFor: 'prod_leche' })
    expect(second.originalItems).toEqual(first.originalItems)
    const leche = product({ id: 'prod_leche', name: 'Leche entera 1L', price: 4600, unit: '1 L' })
    const back = items(second, [{ type: 'substitute', itemId: 'prod_yogurt', productId: 'prod_leche', qty: 2 }], catalogOf(leche))
    expect(back.items[0]).not.toHaveProperty('substitutedFor')
  })

  it('un bloque inválido no aplica ninguno de sus cambios', () => {
    const base = preparing()
    rejection(() => items(base, [
      { type: 'remove', itemId: 'prod_leche' },
      { type: 'substitute', itemId: 'prod_carne', productId: 'prod_queso', qty: 1 },
    ], catalogOf(product({ inStock: false }))))
    expect(base.items).toHaveLength(2)
    expect(base).not.toHaveProperty('originalItems')
  })
})

describe('ME-03: alistado persistente y regla de listo', () => {
  const pick = (itemId: string, picked = true): OrderItemChange => ({ type: 'pick', itemId, picked })

  it('un peso válido guardado marca la línea; borrarlo quita peso y marca; desmarcar conserva el peso', () => {
    const weighed = items(preparing(), [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.237 }])
    expect(weighed.items[1]).toMatchObject({ kilosReal: 1.237, picked: true })
    expect(weighed.finalTotal).toBe(39214)

    const unpicked = items(weighed, [pick('prod_carne', false)])
    expect(unpicked.items[1]).toMatchObject({ kilosReal: 1.237 })
    expect(unpicked.items[1]).not.toHaveProperty('picked')
    expect(unpicked.finalTotal).toBe(39214)
    // Un desmarcado accidental se corrige volviendo a marcar, sin perder el peso.
    expect(items(unpicked, [pick('prod_carne')]).items[1]).toMatchObject({ kilosReal: 1.237, picked: true })

    const cleared = items(weighed, [{ type: 'weight', itemId: 'prod_carne', kilosReal: null }])
    expect(cleared.items[1]).not.toHaveProperty('kilosReal')
    expect(cleared.items[1]).not.toHaveProperty('picked')
    expect(cleared).not.toHaveProperty('finalTotal')
  })

  it('marcar peso variable exige peso real; peso fijo se marca y desmarca libremente', () => {
    expect(issuePaths(() => items(preparing(), [pick('prod_carne')]))).toEqual(['changes.0.picked'])
    const fixed = items(preparing(), [pick('prod_leche')])
    expect(fixed.items[0]).toMatchObject({ picked: true })
    expect(fixed).toMatchObject({ version: 4, updatedBy: 'acc_operador', estimatedTotal: 45000 })
    expect(fixed).not.toHaveProperty('originalItems')
    expect(items(fixed, [pick('prod_leche', false)]).items[0]).not.toHaveProperty('picked')
    expect(issuePaths(() => items(preparing(), [{ type: 'weight', itemId: 'prod_leche', kilosReal: null }]))).toEqual(['changes.0.kilosReal'])
  })

  it('marcas solo en preparación y nunca sobre líneas retiradas', () => {
    for (const status of ['received', 'confirmed', 'ready', 'in_delivery'] as const) {
      expect(issuePaths(() => items(order({ status }), [pick('prod_leche')]))).toEqual(['status'])
    }
    const removed = items(preparing(), [{ type: 'remove', itemId: 'prod_leche' }])
    expect(issuePaths(() => items(removed, [pick('prod_leche')]))).toEqual(['changes.0.itemId'])
  })

  it('todo sustituto entra sin alistar (también con peso); el original no hereda la marca', () => {
    const picked = items(preparing(), [pick('prod_leche')])
    const substituted = items(picked, [{ type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 }], catalogOf(product()))
    expect(substituted.items[0]).not.toHaveProperty('picked')
    expect(substituted.originalItems?.every((line) => !('picked' in line) && !('kilosReal' in line))).toBe(true)
    const weighedSubstitute = items(preparing(), [
      { type: 'substitute', itemId: 'prod_carne', productId: 'prod_pollo', qty: 1, kilosRequested: 0.5, kilosReal: 0.333 },
    ], catalogOf(pollo))
    expect(weighedSubstitute.items[1]).toMatchObject({ id: 'prod_pollo', kilosReal: 0.333 })
    expect(weighedSubstitute.items[1]).not.toHaveProperty('picked')
    expect(weighedSubstitute.finalTotal).toBeDefined()
    // Listo sigue bloqueado hasta marcar; después el toggle y el peso funcionan con normalidad.
    const withLeche = items(weighedSubstitute, [pick('prod_leche')])
    expect(issuePaths(() => applyStatusChange(withLeche, { status: 'ready' }, ctx))).toEqual(['items.1.picked'])
    const marked = items(withLeche, [pick('prod_pollo')])
    expect(marked.items[1]).toMatchObject({ kilosReal: 0.333, picked: true })
    expect(applyStatusChange(marked, { status: 'ready' }, ctx).status).toBe('ready')
    expect(items(marked, [pick('prod_pollo', false)]).items[1]).toMatchObject({ kilosReal: 0.333 })
    expect(items(marked, [{ type: 'weight', itemId: 'prod_pollo', kilosReal: 0.4 }]).items[1]).toMatchObject({ kilosReal: 0.4, picked: true })
    // Sustituto de peso fijo: también sin marcar.
    const fixedSub = items(preparing(), [{ type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 }], catalogOf(product()))
    expect(fixedSub.items[0]).not.toHaveProperty('picked')
    expect(issuePaths(() => applyStatusChange(items(fixedSub, [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1 }]), { status: 'ready' }, ctx))).toEqual(['items.0.picked'])
  })

  it('listo exige cada línea vigente alistada y pesada; lo retirado no cuenta; se señalan las pendientes', () => {
    const base = preparing()
    expect(issuePaths(() => applyStatusChange(base, { status: 'ready' }, ctx))).toEqual(['items.0.picked', 'items.1.picked'])
    const partial = items(base, [pick('prod_leche')])
    expect(rejection(() => applyStatusChange(partial, { status: 'ready' }, ctx)).message).toContain('Faltan 1 productos por alistar')
    expect(issuePaths(() => applyStatusChange(partial, { status: 'ready' }, ctx))).toEqual(['items.1.picked'])
    // Desmarcar un producto ya pesado vuelve a bloquear listo aunque el peso siga guardado.
    const all = items(partial, [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.5 }])
    expect(issuePaths(() => applyStatusChange(items(all, [pick('prod_carne', false)]), { status: 'ready' }, ctx))).toEqual(['items.1.picked'])
    expect(applyStatusChange(all, { status: 'ready' }, ctx)).toMatchObject({ status: 'ready', finalTotal: 45000 })
    const onlyLeche = items(partial, [{ type: 'remove', itemId: 'prod_carne' }])
    expect(applyStatusChange(onlyLeche, { status: 'ready' }, ctx)).toMatchObject({ status: 'ready', finalTotal: 12000 })
  })
})

describe('ME-03: reabrir preparación (ready → preparing)', () => {
  const readyOrder = (): Order => {
    const prepared = items(preparing(), [
      { type: 'pick', itemId: 'prod_leche', picked: true },
      { type: 'weight', itemId: 'prod_carne', kilosReal: 1.237 },
    ])
    return applyStatusChange(prepared, { status: 'ready' }, ctx)
  }

  it('vuelve a preparación con versión y actor, conservando ítems, marcas, pesos, total y snapshots', () => {
    const ready = readyOrder()
    const reopenCtx = { actorId: 'acc_owner', now: '2026-09-03T12:30:00.000Z' }
    const reopened = applyStatusChange(ready, { status: 'preparing' }, reopenCtx)
    expect(reopened).toMatchObject({
      status: 'preparing', version: ready.version + 1, updatedBy: 'acc_owner', updatedAt: reopenCtx.now,
      items: ready.items, finalTotal: ready.finalTotal, estimatedTotal: ready.estimatedTotal, shippingCost: ready.shippingCost,
    })
    // Corregir un peso tras reabrir recalcula el total y listo vuelve a fijarlo.
    const corrected = items(reopened, [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.5 }])
    expect(applyStatusChange(corrected, { status: 'ready' }, ctx).finalTotal).toBe(45000)
  })

  it('solo desde ready: en camino, entregado y cancelado no retroceden', () => {
    // Confirmado → preparando es el avance normal, no una reapertura.
    for (const status of ['received', 'in_delivery'] as const) {
      expect(issuePaths(() => applyStatusChange(order({ status }), { status: 'preparing' }, ctx))).toEqual(['status'])
    }
    for (const status of ['delivered', 'cancelled'] as const) {
      expect(rejection(() => applyStatusChange(order({ status }), { status: 'preparing' }, ctx)).message).toContain('no admite cambios')
    }
  })
})
