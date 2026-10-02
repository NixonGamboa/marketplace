import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  entityIdSchema,
  isSupportedListTimestampMs,
  ORDER_LIST_LIMITS,
  type ContractIssue,
} from '../../../../shared/contracts/index.js'
import type { OrderActor } from '../../domain/orders/orderAccess.js'
import type { OrderListFilter, OrderListPosition, OrderListScope } from '../../domain/orders/orderListing.js'
import { ValidationError } from '../../shared/errors.js'

/**
 * Cursor opaco = base64url(JSON{v, t, i, b}). `t`/`i` son la posición de la última fila y `b` un
 * sha256 del actor, rol, alcance y filtros de la consulta que lo emitió. No es un secreto ni
 * autoriza nada: el alcance siempre se aplica en la consulta. Sirve para que un cursor solo
 * continúe la consulta que lo produjo y no se reutilice con otros filtros, cuenta, rol o tienda.
 */
const CURSOR_VERSION = 1
const POSITION_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/

/** Fecha real y dentro del rango: V8 acepta `02-30` y la desplaza, pero PostgreSQL la rechazaría (503). */
const isRealPosition = (value: string): boolean => {
  const millis = Date.parse(`${value.slice(0, 23)}Z`)
  return isSupportedListTimestampMs(millis) && new Date(millis).toISOString().slice(0, 19) === value.slice(0, 19)
}

const payloadSchema = z
  .object({
    v: z.literal(CURSOR_VERSION),
    t: z.string().regex(POSITION_PATTERN).refine(isRealPosition),
    i: entityIdSchema,
    b: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict()

const INVALID_CURSOR: ContractIssue[] = [{ path: 'cursor', message: 'Cursor inválido para esta consulta' }]

const invalidCursor = (): ValidationError => new ValidationError('Invalid cursor', INVALID_CURSOR)

/** Huella de la consulta. Excluye `limit`: el tamaño de página puede cambiar entre páginas. */
export const orderListBinding = (actor: OrderActor, scope: OrderListScope, filter: OrderListFilter): string =>
  createHash('sha256')
    .update(JSON.stringify([
      'orders:list', CURSOR_VERSION, actor.id, actor.role,
      scope.kind === 'customer' ? ['customer', scope.customerId] : ['store', scope.storeId],
      filter.status ?? null, filter.from ?? null, filter.to ?? null, filter.search ?? null,
    ]))
    .digest('base64url')

export const encodeOrderListCursor = (position: OrderListPosition, binding: string): string =>
  Buffer.from(JSON.stringify({ v: CURSOR_VERSION, t: position.createdAt, i: position.id, b: binding })).toString('base64url')

/** Devuelve la posición o lanza `ValidationError` (400) sin revelar el motivo concreto. */
export const decodeOrderListCursor = (cursor: string, binding: string): OrderListPosition => {
  if (cursor.length > ORDER_LIST_LIMITS.maxCursorLength) throw invalidCursor()
  let raw: unknown
  try {
    raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw invalidCursor()
  }
  const parsed = payloadSchema.safeParse(raw)
  if (!parsed.success || parsed.data.b !== binding) throw invalidCursor()
  const position = { createdAt: parsed.data.t, id: parsed.data.i }
  // Una sola codificación válida por posición: rechaza variantes base64 o JSON equivalentes.
  if (encodeOrderListCursor(position, binding) !== cursor) throw invalidCursor()
  return position
}
