import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listOrdersQuerySchema } from '../../../shared/contracts/index.js'
import { OrderPersistenceError } from '../../src/domain/orders/orderCreation.js'
import type { OrderActor } from '../../src/domain/orders/orderAccess.js'
import { OrdersRepositoryPostgres } from '../../src/infra/postgres/OrdersRepositoryPostgres.js'
import { listOrdersForActor } from '../../src/usecases/orders/listOrders.js'
import { internalOrder } from '../contratos/fixtures.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from './pgliteNeon.js'

const owner: OrderActor = { id: 'acc_owner', role: 'owner', storeId: 'leche-y-miel' }
const customer: OrderActor = { id: 'cust_01', role: 'customer', storeId: null }
const idOf = (n: number) => `01HJ${String(n).padStart(22, '0')}`

const query = (raw: Record<string, unknown> = {}) => listOrdersQuerySchema.parse(raw)

describe('listado de pedidos sobre filas PostgreSQL reales', () => {
  let embedded: EmbeddedPostgres
  let orders: OrdersRepositoryPostgres

  /** Inserta por el adapter y fija `created_at` con la precisión de microsegundos de PostgreSQL. */
  const insert = async (n: number, createdAt: string, overrides: Parameters<typeof internalOrder>[0] = {}) => {
    await orders.create(internalOrder({ id: idOf(n), ...overrides }))
    await embedded.pg.query('update orders set created_at = $1::timestamptz where id = $2', [createdAt, idOf(n)])
  }

  const ownerIds = async (raw: Record<string, unknown> = {}) =>
    (await listOrdersForActor({ orders }, owner, query(raw))).items.map(order => order.id)

  async function walk(actor: OrderActor, raw: Record<string, unknown>) {
    const seen: string[] = []
    const sizes: number[] = []
    let cursor: string | undefined
    for (let guard = 0; guard < 60; guard += 1) {
      const result = await listOrdersForActor({ orders }, actor, query({ ...raw, ...(cursor ? { cursor } : {}) }))
      seen.push(...result.items.map(order => order.id))
      sizes.push(result.items.length)
      if (result.nextCursor === null) return { seen, sizes }
      cursor = result.nextCursor
    }
    throw new Error('La paginación no termina')
  }

  beforeAll(async () => {
    embedded = await startEmbeddedPostgres()
    orders = new OrdersRepositoryPostgres(embedded.db)
  }, 60_000)

  afterAll(async () => {
    if (embedded) await embedded.close()
  })

  describe('orden y cursor', () => {
    beforeAll(async () => {
      // Mismo milisegundo, distinto microsegundo: un cursor redondeado a ms perdería filas.
      await insert(1, '2026-09-03 10:00:00.123456+00')
      await insert(2, '2026-09-03 10:00:00.123789+00')
      await insert(3, '2026-09-03 10:00:00.123000+00')
      await insert(4, '2026-09-03 10:00:00.122999+00')
      // Misma fecha exacta, desempate por ID descendente.
      await insert(7, '2026-09-03 10:00:05.500000+00')
      await insert(5, '2026-09-03 10:00:05.500000+00')
      await insert(6, '2026-09-03 10:00:05.500000+00')
      await insert(8, '2026-09-03 10:00:05.500000+00')
      // Otra zona horaria de entrada: el instante es el mismo que el de la fila 7 (10:00:05.5Z).
      await insert(9, '2026-09-03 05:00:05.500000-05')
    })

    const expectedOrder = [9, 8, 7, 6, 5, 2, 1, 3, 4].map(idOf)

    it('ordena por createdAt DESC e id DESC, incluyendo microsegundos', async () => {
      expect(await ownerIds()).toEqual(expectedOrder)
    })

    it.each([1, 2, 3, 4, 9])('paginando de a %i no pierde ni repite filas', async limit => {
      const { seen, sizes } = await walk(owner, { limit: String(limit) })
      expect(seen).toEqual(expectedOrder)
      expect(sizes.slice(0, -1).every(size => size === limit)).toBe(true)
      expect(sizes.at(-1)).toBeGreaterThan(0)
    })

    it('un total múltiplo del límite no deja una página vacía al final', async () => {
      const { sizes } = await walk(owner, { limit: '3' })
      expect(sizes).toEqual([3, 3, 3])
    })

    it('la posición conserva los 6 decimales de la columna', async () => {
      const { entries, hasMore } = await orders.listPage({ scope: { kind: 'store', storeId: 'leche-y-miel' }, filter: {}, limit: 7 })
      expect(hasMore).toBe(true)
      expect(entries.map(entry => entry.position.createdAt)).toEqual([
        '2026-09-03T10:00:05.500000Z', '2026-09-03T10:00:05.500000Z', '2026-09-03T10:00:05.500000Z',
        '2026-09-03T10:00:05.500000Z', '2026-09-03T10:00:05.500000Z', '2026-09-03T10:00:00.123789Z',
        '2026-09-03T10:00:00.123456Z',
      ])
      // El pedido sigue exponiendo milisegundos (contrato), pero el cursor no depende de eso.
      expect(entries.at(-1)?.order.createdAt).toBe('2026-09-03T10:00:00.123Z')
    })

    it('el cursor entre dos filas del mismo milisegundo continúa exactamente tras la última', async () => {
      const first = await listOrdersForActor({ orders }, owner, query({ limit: '6' }))
      expect(first.items.map(order => order.id)).toEqual([9, 8, 7, 6, 5, 2].map(idOf))
      const second = await listOrdersForActor({ orders }, owner, query({ limit: '6', cursor: first.nextCursor! }))
      expect(second.items.map(order => order.id)).toEqual([1, 3, 4].map(idOf))
      expect(second.nextCursor).toBeNull()
    })

    it('from inclusivo y to exclusivo comparan con la precisión completa', async () => {
      // 10:00:00.123Z = .123000: incluye .123000 y posteriores del mismo ms, excluye .122999.
      expect(await ownerIds({ from: '2026-09-03T10:00:00.123Z', to: '2026-09-03T10:00:00.124Z' })).toEqual([2, 1, 3].map(idOf))
      expect(await ownerIds({ from: '2026-09-03T10:00:00.124Z', to: '2026-09-03T10:00:05.500Z' })).toEqual([])
      expect(await ownerIds({ from: '2026-09-03T10:00:00.000Z', to: '2026-09-03T10:00:00.123Z' })).toEqual([idOf(4)])
      expect(await ownerIds({ from: '2026-09-03T10:00:05.500Z', to: '2026-09-03T10:00:05.501Z' })).toEqual([9, 8, 7, 6, 5].map(idOf))
      expect(await ownerIds({ from: '2026-09-03T05:00:05.500-05:00', to: '2026-09-03T05:00:05.501-05:00' })).toEqual([9, 8, 7, 6, 5].map(idOf))
    })

    it('los filtros se aplican en SQL: la página no trae filas ajenas al filtro ni calcula el resto', async () => {
      await insert(30, '2026-09-04 10:00:00+00', { status: 'ready' })
      const { entries, hasMore } = await orders.listPage({
        scope: { kind: 'store', storeId: 'leche-y-miel' }, filter: { status: 'ready' }, limit: 1,
      })
      expect(entries.map(entry => entry.order.id)).toEqual([idOf(30)])
      expect(hasMore).toBe(false)
      await embedded.pg.query('delete from orders where id = $1', [idOf(30)])
    })

    it('los índices del listado existen y permiten el orden sin Sort', async () => {
      const { rows } = await embedded.pg.query<{ indexname: string }>(`select indexname from pg_indexes where tablename = 'orders'`)
      expect(rows.map(row => row.indexname)).toEqual(expect.arrayContaining(['orders_by_store_recent', 'orders_by_customer_recent']))

      await embedded.pg.query('set enable_seqscan = off')
      try {
        for (const [column, index] of [['store_id', 'orders_by_store_recent'], ['customer_id', 'orders_by_customer_recent']] as const) {
          const plan = await embedded.pg.query<{ 'QUERY PLAN': string }>(
            `explain select * from orders where ${column} = 'x' order by created_at desc nulls last, id desc nulls last limit 21`,
          )
          const text = plan.rows.map(row => row['QUERY PLAN']).join('\n')
          expect(text).toContain(index)
          expect(text).not.toContain('Sort')
        }
      } finally {
        await embedded.pg.query('reset enable_seqscan')
      }
    })
  })

  describe('alcance', () => {
    beforeAll(async () => {
      await insert(40, '2026-10-01 10:00:00+00', { storeId: 'otra-tienda', customerId: customer.id })
      await insert(41, '2026-10-01 11:00:00+00', { storeId: 'otra-tienda', customerId: 'cust_02' })
    })

    it('el cliente ve los suyos de todas las tiendas y el owner solo su tienda', async () => {
      const own = (await listOrdersForActor({ orders }, customer, query())).items.map(order => order.id)
      expect(own).toContain(idOf(40))
      expect(own).not.toContain(idOf(41))
      expect(own.every(id => id !== idOf(41))).toBe(true)
      expect(await ownerIds()).not.toContain(idOf(40))
      expect((await listOrdersForActor({ orders }, { id: 'o2', role: 'owner', storeId: 'otra-tienda' }, query())).items.map(order => order.id))
        .toEqual([idOf(41), idOf(40)])
    })
  })

  describe('búsqueda como texto literal', () => {
    beforeAll(async () => {
      await insert(50, '2026-11-01 10:00:00+00', { customerName: '100%_Real', customerPhone: '573001110001' })
      await insert(51, '2026-11-01 10:00:01+00', { customerName: "Ana'; DROP TABLE orders;--", customerPhone: '573001110002' })
      await insert(52, '2026-11-01 10:00:02+00', { customerName: 'Ruta C:\\temp', customerPhone: '573001110003' })
      await insert(53, '2026-11-01 10:00:03+00', { customerName: 'ÁNGEL Ñandú', customerPhone: '573001110004' })
      await embedded.pg.query(`update orders set customer_phone = '(300) 111-0005' where id = $1`, [idOf(53)])
    })

    const find = async (q: string) =>
      (await ownerIds({ q })).filter(id => Number(id.slice(4)) >= 50)

    it('% y _ no son comodines', async () => {
      expect(await find('%')).toEqual([idOf(50)])
      expect(await find('_')).toEqual([idOf(50)])
      expect(await find('0%_R')).toEqual([idOf(50)])
      expect(await find('1%R')).toEqual([])
      expect(await find('1_0')).toEqual([])
    })

    it('barra invertida y comillas son texto', async () => {
      expect(await find('C:\\temp')).toEqual([idOf(52)])
      expect(await find('\\')).toEqual([idOf(52)])
      expect(await find("Ana';")).toEqual([idOf(51)])
    })

    it('no permite inyección SQL: la consulta es literal y la tabla sigue intacta', async () => {
      const before = (await embedded.pg.query<{ n: number }>('select count(*)::int as n from orders')).rows[0]?.n
      for (const q of ["' OR '1'='1", "'; DROP TABLE orders;--", "x') OR 1=1 --", '" OR ""="', '$1', '${ownerIds}']) {
        const found = await ownerIds({ q })
        expect(found.filter(id => id !== idOf(51))).toEqual([])
      }
      expect(await find("'; DROP TABLE orders;--")).toEqual([idOf(51)])
      expect((await embedded.pg.query<{ n: number }>('select count(*)::int as n from orders')).rows[0]?.n).toBe(before)
    })

    it('mayúsculas y teléfono con formato heredado', async () => {
      expect(await find('ana')).toEqual([idOf(51)])
      expect(await find('ñandú')).toEqual([idOf(53)])
      expect(await find('0005')).toEqual([idOf(53)])
      expect(await find('+57 300 111 0001')).toEqual([idOf(50)])
      expect(await find('(300) 111-0005')).toEqual([idOf(53)])
    })

    it('el prefijo de ID busca por inicio, no por fragmento', async () => {
      expect(await find(idOf(52).toLowerCase())).toEqual([idOf(52)])
      expect(await find(idOf(52).slice(5))).toEqual([])
    })

    it('buscar con paginación conserva filtro y orden', async () => {
      const { seen } = await walk(owner, { q: 'a', limit: '1' })
      const direct = await ownerIds({ q: 'a' })
      expect(seen).toEqual(direct)
      expect(seen.length).toBeGreaterThan(3)
    })
  })

  describe('fallos del driver', () => {
    it('devuelven OrderPersistenceError sin SQL, parámetros ni error original', async () => {
      await embedded.pg.query('alter table orders rename to orders_oculta')
      try {
        const error = await listOrdersForActor({ orders }, owner, query({ q: 'secreto-busqueda' })).catch((e: unknown) => e)
        expect(error).toBeInstanceOf(OrderPersistenceError)
        const text = `${String((error as Error).message)} ${JSON.stringify(error)} ${String((error as Error).stack)}`
        expect(text).not.toMatch(/select|"orders"|secreto-busqueda|relation/i)
        expect((error as Error & { cause?: unknown }).cause).toBeUndefined()
      } finally {
        await embedded.pg.query('alter table orders_oculta rename to orders')
      }
    })
  })
})
