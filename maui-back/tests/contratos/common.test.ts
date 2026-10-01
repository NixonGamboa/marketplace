import { describe, expect, it } from 'vitest'
import {
  apiErrorSchema,
  buildApiError,
  copAmountSchema,
  entityIdSchema,
  isoUtcSchema,
  issuesFromZodError,
  mobileInputSchema,
  normalizeColombianMobile,
  normalizeIsoUtc,
  updateOrderStatusRequestSchema,
} from '../../../shared/contracts/index.js'

describe('teléfono colombiano canónico', () => {
  it.each([
    ['3001234567', '573001234567'],
    ['573001234567', '573001234567'],
    ['+57 300 123 4567', '573001234567'],
    ['(300) 123-4567', '573001234567'],
    ['+573001234567', '573001234567'],
  ])('normaliza %s', (raw, expected) => {
    expect(normalizeColombianMobile(raw)).toBe(expected)
    expect(mobileInputSchema.parse(raw)).toBe(expected)
  })

  it.each(['', '12345', '2001234567', '+1 3001234567', '57300123456', '3001234567890', '30012345ab', '++573001234567'])(
    'rechaza %j',
    (raw) => {
      expect(normalizeColombianMobile(raw)).toBeNull()
      expect(mobileInputSchema.safeParse(raw).success).toBe(false)
    },
  )
})

describe('timestamps ISO UTC', () => {
  it('acepta solo ISO con sufijo Z', () => {
    expect(isoUtcSchema.safeParse('2026-09-03T10:00:00.000Z').success).toBe(true)
    expect(isoUtcSchema.safeParse('2026-09-03T10:00:00+02:00').success).toBe(false)
    expect(isoUtcSchema.safeParse('2026-09-03 10:00:00').success).toBe(false)
    expect(isoUtcSchema.safeParse('03/09/2026').success).toBe(false)
  })

  it.each([
    ['2026-09-03 10:00:00+00', '2026-09-03T10:00:00.000Z'],
    ['2026-09-03 10:00:00.123456+00', '2026-09-03T10:00:00.123Z'],
    ['2026-09-03 05:00:00-05', '2026-09-03T10:00:00.000Z'],
    ['2026-09-03T12:30:00+02:30', '2026-09-03T10:00:00.000Z'],
    ['2026-09-03T10:00:00Z', '2026-09-03T10:00:00.000Z'],
    ['2026-09-03T10:00:00.5Z', '2026-09-03T10:00:00.500Z'],
  ])('normaliza %s', (raw, expected) => {
    expect(normalizeIsoUtc(raw)).toBe(expected)
    expect(isoUtcSchema.safeParse(normalizeIsoUtc(raw)).success).toBe(true)
  })

  it.each(['', 'ayer', '2026-13-45 10:00:00+00', '2026-09-03 10:00:00'])('rechaza %j', (raw) => {
    expect(() => normalizeIsoUtc(raw)).toThrow(RangeError)
  })
})

describe('primitivas', () => {
  it('importes COP: enteros, finitos y acotados', () => {
    expect(copAmountSchema.safeParse(0).success).toBe(true)
    expect(copAmountSchema.safeParse(100_000_000).success).toBe(true)
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 100_000_001, '10']) {
      expect(copAmountSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('IDs opacos', () => {
    for (const ok of ['01HJ0000000000000000000001', 'MAUI-DEMO-0001', 'leche-entera-1l', 'cust_01']) {
      expect(entityIdSchema.safeParse(ok).success).toBe(true)
    }
    for (const bad of ['', ' ', '-x', 'a b', 'a/b', 'x'.repeat(65)]) {
      expect(entityIdSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('rechaza estados desconocidos y campos extra al cambiar estado', () => {
    for (const status of ['received', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered', 'cancelled']) {
      expect(updateOrderStatusRequestSchema.safeParse({ status }).success).toBe(true)
    }
    expect(updateOrderStatusRequestSchema.safeParse({ status: 'ask' }).success).toBe(false)
    expect(updateOrderStatusRequestSchema.safeParse({ status: 'ready', storeId: 'x' }).success).toBe(false)
  })
})

describe('envelope de error', () => {
  it('serializa {error, message} y {error, message, issues}', () => {
    expect(buildApiError('NOT_FOUND', 'Order x not found')).toEqual({
      error: 'NOT_FOUND',
      message: 'Order x not found',
    })
    const withIssues = buildApiError('VALIDATION_ERROR', 'Invalid', [{ path: 'items.0.qty', message: 'bad' }])
    expect(apiErrorSchema.safeParse(withIssues).success).toBe(true)
    expect(apiErrorSchema.safeParse({ error: 'X' }).success).toBe(false)
    expect(apiErrorSchema.safeParse({ error: 'X', message: 'm', extra: 1 }).success).toBe(false)
  })

  it('convierte errores Zod a issues con ruta', () => {
    const result = updateOrderStatusRequestSchema.safeParse({ status: 'nope' })
    if (result.success) throw new Error('debía fallar')
    expect(issuesFromZodError(result.error)).toEqual([
      expect.objectContaining({ path: 'status', message: expect.any(String) }),
    ])
  })
})
