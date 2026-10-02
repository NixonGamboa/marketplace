import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { StoredAccount } from '../../src/domain/auth/Account.js'
import { JoseSessionTokenService } from '../../src/infra/auth/JoseSessionTokenService.js'
import { AuthRepositoryPostgres } from '../../src/infra/postgres/AuthRepositoryPostgres.js'
import { OrdersRepositoryPostgres } from '../../src/infra/postgres/OrdersRepositoryPostgres.js'
import { authenticateSession } from '../../src/usecases/auth/authenticateSession.js'
import { getOrderForActor } from '../../src/usecases/orders/getOrder.js'
import { updateOrderStatus } from '../../src/usecases/orders/updateOrderStatus.js'
import { NotFoundError } from '../../src/shared/errors.js'
import { TEST_AUDIENCE, TEST_ISSUER, TEST_SECRET, TestClock } from '../auth/fixtures.js'
import { internalOrder } from '../contratos/fixtures.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from './pgliteNeon.js'

const NOW = '2026-10-01T12:00:00.000Z'
const EXPIRES = '2026-10-01T20:00:00.000Z'

const account = (overrides: Partial<StoredAccount>): StoredAccount => ({
  id: 'acc_base', role: 'customer', name: 'Cuenta de prueba', phone: null, email: null, storeId: null,
  status: 'active', passwordHash: 'fixture-secret-not-for-login', createdAt: NOW, updatedAt: NOW,
  ...overrides,
})

const accounts = {
  customerA: account({ id: 'acc_cliente_a', phone: '573001234567' }),
  customerB: account({ id: 'acc_cliente_b', phone: '573007654321' }),
  operator: account({ id: 'acc_operador', role: 'operator', email: 'op@maui.test', storeId: 'leche-y-miel' }),
  foreign: account({ id: 'acc_ajeno', role: 'owner', email: 'duena@otra.test', storeId: 'otra-tienda' }),
}

describe('autorización de pedidos sobre filas persistidas en PostgreSQL embebido', () => {
  let embedded: EmbeddedPostgres
  let auth: AuthRepositoryPostgres
  let orders: OrdersRepositoryPostgres
  const clock = new TestClock(new Date(NOW))
  const tokens = new JoseSessionTokenService({ secret: TEST_SECRET, issuer: TEST_ISSUER, audience: TEST_AUDIENCE })

  /** Actor como lo obtiene un handler: JWT → sesión persistida → cuenta vigente con su tienda. */
  const actorOf = async (key: keyof typeof accounts) => {
    const sessionId = `ses_${key}`
    const token = await tokens.sign({
      accountId: accounts[key].id,
      sessionId,
      issuedAt: Math.floor(Date.parse(NOW) / 1000),
      expiresAt: Math.floor(Date.parse(EXPIRES) / 1000),
    })
    const { account } = await authenticateSession({ repository: auth, tokens, clock }, token)
    return account
  }

  beforeAll(async () => {
    embedded = await startEmbeddedPostgres()
    auth = new AuthRepositoryPostgres(embedded.db)
    orders = new OrdersRepositoryPostgres(embedded.db)
    for (const [key, stored] of Object.entries(accounts)) {
      await auth.createAccount(stored)
      await auth.createSession({ id: `ses_${key}`, accountId: stored.id, createdAt: NOW, expiresAt: EXPIRES, revokedAt: null })
    }
    await orders.create(internalOrder({ id: '01HJ0000000000000000000001', customerId: accounts.customerA.id }))
    await orders.create(internalOrder({ id: '01HJ0000000000000000000002', customerId: accounts.customerB.id, storeId: 'otra-tienda' }))
  }, 30_000)

  afterAll(async () => {
    if (embedded) await embedded.close()
  })

  it('propiedad y tienda salen de las filas: cliente dueño y personal de su tienda leen', async () => {
    const id = '01HJ0000000000000000000001'
    expect((await getOrderForActor({ orders }, await actorOf('customerA'), id)).customerId).toBe(accounts.customerA.id)
    expect((await getOrderForActor({ orders }, await actorOf('operator'), id)).storeId).toBe('leche-y-miel')

    for (const key of ['customerB', 'foreign'] as const) {
      await expect(getOrderForActor({ orders }, await actorOf(key), id)).rejects.toBeInstanceOf(NotFoundError)
    }
  })

  it('personal de otra tienda no cambia el estado; el de la tienda sí', async () => {
    const id = '01HJ0000000000000000000002'
    await expect(
      updateOrderStatus({ orders, clock }, await actorOf('operator'), id, { status: 'confirmed', expectedVersion: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect((await orders.findById(id))?.status).toBe('received')

    const updated = await updateOrderStatus({ orders, clock }, await actorOf('foreign'), id, { status: 'confirmed', expectedVersion: 1 })
    expect(updated).toMatchObject({ status: 'confirmed', version: 2, updatedBy: accounts.foreign.id })
  })

  it('cambiar la tienda persistida del operador le retira el acceso en la siguiente request', async () => {
    const id = '01HJ0000000000000000000001'
    await embedded.pg.query('UPDATE auth_accounts SET store_id = $1 WHERE id = $2', ['otra-tienda', accounts.operator.id])
    await expect(getOrderForActor({ orders }, await actorOf('operator'), id)).rejects.toBeInstanceOf(NotFoundError)
  })
})
