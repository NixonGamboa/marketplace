import { z } from 'zod'
import { ORDER_STATUS_VALUES } from './orderEnums.js'
import { orderDtoSchema } from './orders.js'

/**
 * Listado histórico `GET /api/orders` (T-11). El alcance NUNCA viaja en la query: el cliente ve
 * solo sus pedidos y owner/operator solo los de su tienda, ambos derivados de la sesión.
 *
 * Query (todo opcional, `.strict()`: parámetros desconocidos o repetidos se rechazan con 400):
 *  - `q`: texto literal de 1–64 caracteres, sin caracteres de control. Coincide con (a) el
 *    inicio del ID del pedido, (b) un fragmento del nombre del cliente o (c) si parece un
 *    teléfono (≥ 3 dígitos), un fragmento de sus dígitos. Sin distinguir mayúsculas; `%`, `_` y
 *    `\` son texto, no comodines.
 *  - `status`: un estado de pedido.
 *  - `from` (inclusive) y `to` (exclusivo): ISO 8601 con zona obligatoria (`Z` u offset
 *    `±HH:MM`, con `+` codificado como `%2B`), hasta milisegundos, entre 2000-01-01Z y
 *    3000-01-01Z. Filtran `createdAt`; `from` debe ser anterior a `to`.
 *  - `limit`: entero decimal 1–100 (por defecto 20).
 *  - `cursor`: opaco, devuelto en `nextCursor`; solo vale con los mismos filtros, cuenta y tienda.
 *
 * Orden estable: `createdAt` DESC y `orderId` DESC como desempate. `nextCursor` es `null` en la
 * última página.
 */

export const ORDER_LIST_LIMITS = {
  defaultLimit: 20,
  maxLimit: 100,
  maxSearchLength: 64,
  maxCursorLength: 512,
} as const

/** Rango admitido para `from`/`to` y para la posición de un cursor (evita fechas fuera de PostgreSQL). */
export const ORDER_LIST_MIN_TIMESTAMP_MS = Date.UTC(2000, 0, 1)
export const ORDER_LIST_MAX_TIMESTAMP_MS = Date.UTC(3000, 0, 1)

export const isSupportedListTimestampMs = (ms: number): boolean =>
  Number.isFinite(ms) && ms >= ORDER_LIST_MIN_TIMESTAMP_MS && ms < ORDER_LIST_MAX_TIMESTAMP_MS

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
const MILLISECOND_PRECISION = /^[^.]*(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/

/** Fecha con zona explícita; normaliza a ISO UTC con milisegundos. */
export const listTimestampSchema = z
  .string()
  .datetime({ offset: true, message: 'Use ISO 8601 con zona (Z u offset ±HH:MM)' })
  .refine((value) => MILLISECOND_PRECISION.test(value), 'La precisión máxima es de milisegundos')
  .refine((value) => isSupportedListTimestampMs(Date.parse(value)), 'Fecha fuera del rango admitido')
  .transform((value) => new Date(value).toISOString())

const searchSchema = z
  .string()
  .trim()
  .min(1, 'La búsqueda no puede estar vacía')
  .max(ORDER_LIST_LIMITS.maxSearchLength, `Máximo ${ORDER_LIST_LIMITS.maxSearchLength} caracteres`)
  .refine((value) => !CONTROL_CHARACTERS.test(value) && !LONE_SURROGATE.test(value), 'Texto inválido')

export const listLimitSchema = z
  .string()
  .regex(/^[1-9]\d{0,2}$/, 'Entero decimal entre 1 y 100')
  .transform(Number)
  .refine((value) => value <= ORDER_LIST_LIMITS.maxLimit, `Máximo ${ORDER_LIST_LIMITS.maxLimit}`)

export const listCursorSchema = z
  .string()
  .max(ORDER_LIST_LIMITS.maxCursorLength)
  .regex(/^[A-Za-z0-9_-]+$/, 'Cursor inválido')

/**
 * Valida el `req.query` crudo (solo strings: un array por parámetro repetido falla). No hay
 * coerciones laxas: `limit=10abc`, `limit=0x10` o `limit=1e1` son errores.
 */
export const listOrdersQuerySchema = z
  .object({
    q: searchSchema.optional(),
    status: z.enum(ORDER_STATUS_VALUES).optional(),
    from: listTimestampSchema.optional(),
    to: listTimestampSchema.optional(),
    limit: listLimitSchema.optional(),
    cursor: listCursorSchema.optional(),
  })
  .strict()
  .superRefine((query, ctx) => {
    if (query.from !== undefined && query.to !== undefined && query.from >= query.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: '`from` debe ser anterior a `to`' })
    }
  })
  .transform(({ limit, ...query }) => ({ ...query, limit: limit ?? ORDER_LIST_LIMITS.defaultLimit }))

/** Respuesta de `GET /api/orders`: DTO canónico del detalle, sin `storeId` ni campos internos. */
export const orderListResponseSchema = z
  .object({
    items: z.array(orderDtoSchema).max(ORDER_LIST_LIMITS.maxLimit),
    nextCursor: z.string().min(1).max(ORDER_LIST_LIMITS.maxCursorLength).nullable(),
  })
  .strict()

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>
export type OrderListResponse = z.infer<typeof orderListResponseSchema>
