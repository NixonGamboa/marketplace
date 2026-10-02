import { describe, expect, it } from 'vitest'
import {
  ORDER_LIST_LIMITS,
  ORDER_STATUS_VALUES,
  listOrdersQuerySchema,
  orderListResponseSchema,
} from '../../../shared/contracts/index.js'
import { internalOrder } from './fixtures.js'
import { toOrderDto } from '../../src/domain/orders/orderMappers.js'

const parse = (query: unknown) => listOrdersQuerySchema.safeParse(query)
const accepted = (query: unknown) => {
  const result = parse(query)
  if (!result.success) throw new Error(JSON.stringify(result.error.issues))
  return result.data
}

describe('query del listado de pedidos', () => {
  it('sin parámetros usa el límite por defecto y nada más', () => {
    expect(accepted({})).toEqual({ limit: ORDER_LIST_LIMITS.defaultLimit })
  })

  it('acepta filtros válidos y normaliza fechas a ISO UTC con milisegundos', () => {
    expect(accepted({
      q: '  Carmen  ', status: 'preparing', limit: '100', cursor: 'abc_-123',
      from: '2026-09-03T05:00:00-05:00', to: '2026-09-04T10:00:00.5Z',
    })).toEqual({
      q: 'Carmen', status: 'preparing', limit: 100, cursor: 'abc_-123',
      from: '2026-09-03T10:00:00.000Z', to: '2026-09-04T10:00:00.500Z',
    })
  })

  it.each(ORDER_STATUS_VALUES)('status %s es válido', status => {
    expect(accepted({ status })).toMatchObject({ status })
  })

  it.each([
    ['estado desconocido', { status: 'RECEIVED' }],
    ['parámetro desconocido', { storeId: 'otra-tienda' }],
    ['scope de cliente en query', { customerId: 'acc_1' }],
    ['userId en query', { userId: 'acc_1' }],
    ['parámetro repetido (array)', { status: ['received', 'ready'] }],
    ['q repetido', { q: ['a', 'b'] }],
    ['q vacío', { q: '' }],
    ['q solo espacios', { q: '   ' }],
    ['q demasiado largo', { q: 'a'.repeat(ORDER_LIST_LIMITS.maxSearchLength + 1) }],
    ['q con NUL', { q: 'ana\u0000' }],
    ['q con salto de línea', { q: 'ana\nperez' }],
    ['q con sustituto suelto', { q: 'ana\uD800' }],
    ['q no string', { q: 5 }],
    ['limit vacío', { limit: '' }],
    ['limit cero', { limit: '0' }],
    ['limit negativo', { limit: '-1' }],
    ['limit con ceros a la izquierda', { limit: '010' }],
    ['limit decimal', { limit: '10.5' }],
    ['limit exponencial', { limit: '1e1' }],
    ['limit hexadecimal', { limit: '0x10' }],
    ['limit con texto', { limit: '10abc' }],
    ['limit sobre el máximo', { limit: '101' }],
    ['limit numérico (no string)', { limit: 10 }],
    ['cursor vacío', { cursor: '' }],
    ['cursor con caracteres no base64url', { cursor: 'abc=' }],
    ['cursor demasiado largo', { cursor: 'a'.repeat(ORDER_LIST_LIMITS.maxCursorLength + 1) }],
    ['from sin zona', { from: '2026-09-03T10:00:00' }],
    ['from solo fecha', { from: '2026-09-03' }],
    ['from con espacio como separador', { from: '2026-09-03 10:00:00Z' }],
    ['from con + decodificado a espacio', { from: '2026-09-03T10:00:00 05:00' }],
    ['from epoch', { from: '1790000000' }],
    ['from con microsegundos', { from: '2026-09-03T10:00:00.123456Z' }],
    ['from día inexistente', { from: '2026-02-30T00:00:00Z' }],
    ['from mes inexistente', { from: '2026-13-01T00:00:00Z' }],
    ['from antes del rango', { from: '1999-12-31T23:59:59Z' }],
    ['to en el límite superior excluido', { to: '3000-01-01T00:00:00Z' }],
    ['from igual a to', { from: '2026-09-03T10:00:00Z', to: '2026-09-03T10:00:00Z' }],
    ['from posterior a to', { from: '2026-09-04T00:00:00Z', to: '2026-09-03T00:00:00Z' }],
    ['rango equivalente con otra zona', { from: '2026-09-03T10:00:00Z', to: '2026-09-03T05:00:00-05:00' }],
  ])('rechaza %s', (_name, query) => {
    expect(parse(query).success).toBe(false)
  })

  it('el límite mínimo y el máximo son válidos; las fechas límite del rango también', () => {
    expect(accepted({ limit: '1' }).limit).toBe(1)
    expect(accepted({ limit: String(ORDER_LIST_LIMITS.maxLimit) }).limit).toBe(100)
    expect(accepted({ from: '2000-01-01T00:00:00Z', to: '2999-12-31T23:59:59.999Z' })).toBeTruthy()
  })

  it('trata % _ \\ y comillas como texto literal de búsqueda', () => {
    const q = `100%_\\'; DROP TABLE orders;--`
    expect(accepted({ q }).q).toBe(q)
  })

  it('el error no refleja el valor recibido', () => {
    const result = parse({ limit: 'valor-secreto-xyz' })
    expect(JSON.stringify(result.success ? '' : result.error.issues)).not.toContain('valor-secreto-xyz')
  })
})

describe('respuesta del listado', () => {
  it('usa el DTO canónico del detalle y rechaza campos internos', () => {
    const dto = toOrderDto(internalOrder())
    expect(orderListResponseSchema.parse({ items: [dto], nextCursor: null })).toEqual({ items: [dto], nextCursor: null })
    expect(orderListResponseSchema.safeParse({ items: [{ ...dto, storeId: 'leche-y-miel' }], nextCursor: null }).success).toBe(false)
    expect(orderListResponseSchema.safeParse({ items: [dto], nextCursor: null, total: 1 }).success).toBe(false)
    expect(orderListResponseSchema.safeParse({ items: [dto] }).success).toBe(false)
  })
})
