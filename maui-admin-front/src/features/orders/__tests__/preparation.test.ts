/** Reglas puras de la lista de preparación (ME-03): peso escrito, pendientes de «Listo» y reaplicación segura. */
import { describe, expect, it } from 'vitest'
import type { OrderItemDto } from '@shared/contracts'
import type { AdminOrder } from '@/types/adminOrder'
import {
  countReady,
  parseWeightDraft,
  pendingRows,
  rebaseVerdict,
  rowIssue,
  weightChangeFor,
  type RowSync,
} from '../preparation'

const milk: OrderItemDto = { id: 'prod-leche', name: 'Leche', qty: 2, priceAtMoment: 5000 }
const cheese: OrderItemDto = { id: 'prod-queso', name: 'Queso', qty: 1, priceAtMoment: 20000, is_variable_weight: true, kilosRequested: 0.5 }
const rice: OrderItemDto = { id: 'prod-arroz', name: 'Arroz', qty: 1, priceAtMoment: 4000 }

/** Línea alistada: `picked` es el literal `true` del contrato. */
const done = (item: OrderItemDto): OrderItemDto => ({ ...item, picked: true })

const order = (items: OrderItemDto[], overrides: Partial<AdminOrder> = {}): AdminOrder => ({
  orderId: 'ord-1', userId: 'usr', status: 'preparing', version: 4, items, deliveryType: 'pickup', deliveryData: {},
  substitutionPreference: 'similar', customerName: 'Ana', estimatedTotal: 20000, createdAt: '2026-10-02T15:00:00.000Z', ...overrides,
})

describe('parseWeightDraft', () => {
  it.each([
    ['', { kind: 'empty' }],
    ['   ', { kind: 'empty' }],
    ['0.6', { kind: 'valid', kilos: 0.6 }],
    ['1,25', { kind: 'valid', kilos: 1.25 }],
    ['.5', { kind: 'valid', kilos: 0.5 }],
    ['100', { kind: 'valid', kilos: 100 }],
    ['0.001', { kind: 'valid', kilos: 0.001 }],
    ['0', { kind: 'invalid' }],
    ['-1', { kind: 'invalid' }],
    ['0.0005', { kind: 'invalid' }],
    ['1.2345', { kind: 'invalid' }],
    ['100.1', { kind: 'invalid' }],
    ['abc', { kind: 'invalid' }],
    ['1e2', { kind: 'invalid' }],
    ['1.2.3', { kind: 'invalid' }],
  ])('%j → %j', (text, expected) => {
    expect(parseWeightDraft(text)).toEqual(expected)
  })
})

describe('weightChangeFor', () => {
  it('un peso válido distinto del guardado se guarda; el igual no genera cambio', () => {
    expect(weightChangeFor(cheese, { kind: 'valid', kilos: 0.6 })).toEqual({ type: 'weight', itemId: 'prod-queso', kilosReal: 0.6 })
    expect(weightChangeFor({ ...cheese, kilosReal: 0.6 }, { kind: 'valid', kilos: 0.6 })).toBeNull()
  })

  it('vaciar el campo borra el peso guardado (y con él la marca); si no había peso no hay cambio', () => {
    expect(weightChangeFor(done({ ...cheese, kilosReal: 0.6 }), { kind: 'empty' })).toEqual({ type: 'weight', itemId: 'prod-queso', kilosReal: null })
    expect(weightChangeFor(cheese, { kind: 'empty' })).toBeNull()
  })

  it('un peso inválido nunca se envía', () => {
    expect(weightChangeFor(cheese, { kind: 'invalid' })).toBeNull()
  })
})

describe('qué impide pasar a «Listo»', () => {
  const saving: RowSync = { phase: 'saving' }
  const failed = (message = 'Sin conexión'): RowSync => ({
    phase: 'error', message, change: { type: 'pick', itemId: 'prod-leche', picked: true },
  })

  it('una línea marcada y guardada no impide nada; la sin marcar sí', () => {
    expect(rowIssue(done(milk), undefined, undefined)).toBeNull()
    expect(rowIssue(milk, undefined, undefined)).toBe('unpicked')
  })

  it('un peso variable necesita el peso real aunque esté marcado', () => {
    expect(rowIssue(cheese, undefined, undefined)).toBe('missing_weight')
    expect(rowIssue(done(cheese), undefined, undefined)).toBe('missing_weight')
    expect(rowIssue(done({ ...cheese, kilosReal: 0.6 }), undefined, undefined)).toBeNull()
    // Peso guardado pero desmarcado: conserva el peso y sigue pendiente de marcar.
    expect(rowIssue({ ...cheese, kilosReal: 0.6 }, undefined, undefined)).toBe('unpicked')
  })

  it('guardando, fallo, peso inválido y peso sin guardar bloquean aunque la línea parezca lista', () => {
    const ready = done({ ...cheese, kilosReal: 0.6 })
    expect(rowIssue(ready, undefined, saving)).toBe('saving')
    expect(rowIssue(ready, undefined, failed())).toBe('failed')
    expect(rowIssue(ready, '0', undefined)).toBe('invalid_weight')
    expect(rowIssue(ready, '0.7', undefined)).toBe('unsaved_weight')
    expect(rowIssue(ready, '', undefined)).toBe('unsaved_weight')
    expect(rowIssue(ready, '0.6', undefined)).toBeNull()
  })

  it('lista los pendientes en el orden del pedido con su motivo', () => {
    const items = [done(milk), cheese, rice]
    expect(pendingRows(items, {}, { 'prod-arroz': saving })).toEqual([
      { itemId: 'prod-queso', issue: 'missing_weight' },
      { itemId: 'prod-arroz', issue: 'saving' },
    ])
    expect(pendingRows([done(milk)], {}, {})).toEqual([])
  })

  it('cuenta como alistadas solo las marcadas con su peso', () => {
    const items: OrderItemDto[] = [
      done(milk),
      done(cheese),
      done(rice),
      { ...cheese, id: 'otro-queso', kilosReal: 1, picked: true },
    ]
    expect(countReady(items)).toBe(3)
  })
})

describe('rebaseVerdict: reaplicar un cambio propio sobre una versión más nueva', () => {
  const pickMilk = { type: 'pick', itemId: 'prod-leche', picked: true } as const
  const base = order([milk, cheese, rice])

  it('si solo cambió OTRO ítem es seguro', () => {
    const latest = order([milk, cheese, done(rice)], { version: 5 })
    expect(rebaseVerdict(base, latest, pickMilk)).toEqual({ kind: 'safe' })
    const weighed = order([milk, done({ ...cheese, kilosReal: 0.6 }), rice], { version: 5 })
    expect(rebaseVerdict(base, weighed, pickMilk)).toEqual({ kind: 'safe' })
  })

  it('si el mismo ítem cambió por otro lado hay conflicto y no se escribe', () => {
    const latest = order([done(milk), cheese, rice], { version: 5 })
    expect(rebaseVerdict(base, latest, { type: 'pick', itemId: 'prod-leche', picked: false })).toEqual({ kind: 'conflict', reason: 'item' })
    const weighed = order([milk, done({ ...cheese, kilosReal: 0.8 }), rice], { version: 5 })
    expect(rebaseVerdict(base, weighed, { type: 'weight', itemId: 'prod-queso', kilosReal: 0.6 })).toEqual({ kind: 'conflict', reason: 'item' })
  })

  it('si el otro operador ya dejó el ítem como se pretendía no hace falta escribir', () => {
    const latest = order([done(milk), cheese, rice], { version: 5 })
    expect(rebaseVerdict(base, latest, pickMilk)).toEqual({ kind: 'applied' })
    const weighed = order([milk, done({ ...cheese, kilosReal: 0.6 }), rice], { version: 5 })
    expect(rebaseVerdict(base, weighed, { type: 'weight', itemId: 'prod-queso', kilosReal: 0.6 })).toEqual({ kind: 'applied' })
  })

  it('un producto quitado o sustituido (estructura) es conflicto aunque no sea el propio', () => {
    const removed = order([milk, cheese], { version: 5 })
    expect(rebaseVerdict(base, removed, pickMilk)).toEqual({ kind: 'conflict', reason: 'structure' })
    const substituted = order([milk, cheese, { ...rice, id: 'prod-quinua', substitutedFor: 'prod-arroz' }], { version: 5 })
    expect(rebaseVerdict(base, substituted, pickMilk)).toEqual({ kind: 'conflict', reason: 'structure' })
  })

  it('si el pedido ya no está en preparación es conflicto de estado', () => {
    expect(rebaseVerdict(base, order([milk, cheese, rice], { status: 'ready', version: 5 }), pickMilk)).toEqual({ kind: 'conflict', reason: 'status' })
    expect(rebaseVerdict(base, order([milk, cheese, rice], { status: 'cancelled', version: 5 }), pickMilk)).toEqual({ kind: 'conflict', reason: 'status' })
  })
})
