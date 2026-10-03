import { describe, expect, it, vi } from 'vitest'
import type { Product } from '@/types/catalog'
import { createRealAuditRepository } from '../../realAuditRepository'
import { createRealAuthRepository } from '../../realAuthRepository'
import { createRealCatalogRepository } from '../../realCatalogRepository'
import { createRealMerchantRepository } from '../../realMerchantRepository'
import { createRealOrderRepository } from '../../realOrderRepository'
import { createRealStoreStatusRepository } from '../../realStoreStatusRepository'
import { CapabilityUnavailableError } from '../capabilityUnavailable'
import {
  FUTURE_ISO,
  NOW_ISO,
  apiProblem,
  clientWith,
  customerSession,
  json,
  noContent,
  orderDto,
  ownerSession,
  requestAt,
  staffCatalog,
  staffProduct,
  storeDto,
} from './fixtures'

const rejection = async (promise: Promise<unknown>): Promise<unknown> => promise.then(() => undefined, (error: unknown) => error)

describe('auth real', () => {
  it('inicia sesión con método email, valida el DTO y mapea la cuenta de personal', async () => {
    const { client, fetchImpl } = clientWith(json(ownerSession()))
    const repo = createRealAuthRepository(client)
    const session = await repo.login(' Owner@Maui.test ', 'clave-segura-123')
    expect(requestAt(fetchImpl)).toMatchObject({
      url: '/api/auth/login', method: 'POST', credentials: 'same-origin',
      body: { method: 'email', email: 'owner@maui.test', password: 'clave-segura-123' },
    })
    expect(session).toEqual({
      user: { email: 'owner@maui.test', name: 'Dueño Demo', role: 'owner', merchantId: 'store-1' },
      expiresAt: FUTURE_ISO,
    })
    expect(repo.getSession()).toEqual(session)
  })

  it('cierra la sesión de una cuenta de cliente y niega el acceso al panel', async () => {
    const { client, fetchImpl } = clientWith(json(customerSession()), noContent())
    const repo = createRealAuthRepository(client)
    expect(await rejection(repo.login('cliente@maui.test', 'clave-segura-123'))).toMatchObject({ kind: 'forbidden' })
    expect(requestAt(fetchImpl, 1)).toMatchObject({ url: '/api/auth/logout', method: 'POST' })
    expect(repo.getSession()).toBeNull()
  })

  it.each([
    [401, 'INVALID_CREDENTIALS', 'unauthenticated'],
    [429, 'RATE_LIMITED', 'rate_limited'],
    [503, 'SERVICE_UNAVAILABLE', 'unavailable'],
  ])('propaga el error HTTP %i del login', async (status, code, kind) => {
    const { client } = clientWith(apiProblem(status, code, 'Fallo', status === 429 ? { 'Retry-After': '30' } : {}))
    expect(await rejection(createRealAuthRepository(client).login('owner@maui.test', 'clave-segura-123'))).toMatchObject({ kind, code })
  })

  it('no envía el login si el email o la contraseña son inválidos', async () => {
    const { client, fetchImpl } = clientWith()
    expect(await rejection(createRealAuthRepository(client).login('no-es-email', ''))).toMatchObject({ kind: 'invalid_request' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('me() rehidrata la sesión y devuelve null ante 401', async () => {
    const { client, fetchImpl } = clientWith(json(ownerSession()), apiProblem(401, 'UNAUTHENTICATED', 'Sesión inválida'))
    const repo = createRealAuthRepository(client)
    expect(await repo.me()).toMatchObject({ user: { role: 'owner' } })
    expect(requestAt(fetchImpl)).toMatchObject({ url: '/api/auth/session', method: 'GET' })
    expect(repo.getSession()).not.toBeNull()
    expect(await repo.me()).toBeNull()
    expect(repo.getSession()).toBeNull()
  })

  it('me() no oculta un 503 como sesión ausente', async () => {
    const { client } = clientWith(apiProblem(503, 'SERVICE_UNAVAILABLE', 'No disponible'))
    expect(await rejection(createRealAuthRepository(client).me())).toMatchObject({ kind: 'unavailable' })
  })

  it('logout limpia la sesión; si el servidor falla conserva la sesión y propaga el error', async () => {
    const { client } = clientWith(json(ownerSession()), apiProblem(503, 'SERVICE_UNAVAILABLE', 'No disponible'), noContent())
    const repo = createRealAuthRepository(client)
    await repo.login('owner@maui.test', 'clave-segura-123')
    expect(await rejection(repo.logout())).toMatchObject({ kind: 'unavailable' })
    expect(repo.getSession()).not.toBeNull()
    await repo.logout()
    expect(repo.getSession()).toBeNull()
  })

  it('descarta una sesión local ya vencida', async () => {
    const { client } = clientWith(json(ownerSession({ expiresAt: '2026-10-02T15:00:01.000Z' })))
    const repo = createRealAuthRepository(client)
    vi.useFakeTimers({ now: new Date('2026-10-02T15:00:00.000Z') })
    try {
      await repo.login('owner@maui.test', 'clave-segura-123')
      expect(repo.getSession()).not.toBeNull()
      vi.setSystemTime(new Date('2026-10-02T15:00:02.000Z'))
      expect(repo.getSession()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

const draftProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'prod-leche', name: 'Leche entera', price: 5200, unit: '1 L', imageUrl: '/product-images/leche.png',
  categoryId: 'cat-lacteos', inStock: true, is_variable_weight: false, ...overrides,
})

describe('catálogo real', () => {
  it('lista el catálogo de personal sin archivados y aplica filtros de la UI', async () => {
    const catalog = staffCatalog({
      products: [
        staffProduct(),
        staffProduct({ id: 'prod-queso', name: 'Queso campesino', categoryId: 'cat-otros', active: false }),
        staffProduct({ id: 'prod-viejo', name: 'Viejo', archived: true }),
      ],
    })
    const { client, fetchImpl } = clientWith(json(catalog), json(catalog), json(catalog))
    const repo = createRealCatalogRepository(client)
    expect((await repo.listProducts()).map((p) => p.id)).toEqual(['prod-leche', 'prod-queso'])
    expect(requestAt(fetchImpl)).toMatchObject({ url: '/api/catalog/staff', credentials: 'same-origin' })
    expect((await repo.listProducts({ q: 'QUESO' })).map((p) => p.id)).toEqual(['prod-queso'])
    expect(await repo.getProduct('prod-viejo')).toBeNull()
  })

  it('edita un producto existente con PATCH completo y conserva la versión devuelta', async () => {
    const updated = staffProduct({ version: 4, price: 5200 })
    const { client, fetchImpl } = clientWith(json(staffCatalog()), json(updated))
    const saved = await createRealCatalogRepository(client).upsertProduct(draftProduct(), 'owner@maui.test')
    expect(saved.version).toBe(4)
    expect(requestAt(fetchImpl, 1)).toMatchObject({ url: '/api/catalog/products/prod-leche', method: 'PATCH' })
    expect(requestAt(fetchImpl, 1).body).toMatchObject({ price: 5200, originalPrice: null, badge: null, description: null })
    expect(requestAt(fetchImpl, 1).body).not.toHaveProperty('active')
    expect(requestAt(fetchImpl, 1).body).not.toHaveProperty('archived')
  })

  it('crea un producto nuevo sin enviar id y fija la unidad del peso variable en el servidor', async () => {
    const created = staffProduct({ id: 'srv-1', is_variable_weight: true, unit: 'Por Kilogramo' })
    const { client, fetchImpl } = clientWith(json(staffCatalog()), json(created, 201))
    await createRealCatalogRepository(client).upsertProduct(draftProduct({ id: 'carne-nueva', is_variable_weight: true, unit: '$/kg' }), 'x')
    const sent = requestAt(fetchImpl, 1)
    expect(sent).toMatchObject({ url: '/api/catalog/products', method: 'POST' })
    expect(sent.body).not.toHaveProperty('id')
    expect(sent.body).not.toHaveProperty('unit')
  })

  it('rechaza localmente una moneda no soportada o un precio inválido sin llamar a la API', async () => {
    const { client, fetchImpl } = clientWith(json(staffCatalog()), json(staffCatalog()))
    const repo = createRealCatalogRepository(client)
    expect(await rejection(repo.upsertProduct(draftProduct({ currency: 'USD' }), 'x'))).toMatchObject({ kind: 'invalid_request' })
    expect(await rejection(repo.upsertProduct(draftProduct({ price: -5 }), 'x'))).toMatchObject({ kind: 'invalid_request' })
    expect(fetchImpl).toHaveBeenCalledTimes(2) // solo las lecturas de existencia
  })

  it('archiva en lugar de borrar y cambia el stock con PATCH', async () => {
    const { client, fetchImpl } = clientWith(json(staffProduct({ archived: true })), json(staffProduct({ inStock: false, version: 4 })))
    const repo = createRealCatalogRepository(client)
    await repo.deleteProduct('prod-leche', 'x')
    expect(requestAt(fetchImpl, 0)).toMatchObject({ method: 'PATCH', body: { archived: true } })
    expect((await repo.toggleStock('prod-leche', false, 'x')).inStock).toBe(false)
    expect(requestAt(fetchImpl, 1).body).toEqual({ inStock: false })
  })

  it.each([
    [403, 'FORBIDDEN', 'forbidden'],
    [404, 'NOT_FOUND', 'not_found'],
    [409, 'CONFLICT', 'conflict'],
    [429, 'RATE_LIMITED', 'rate_limited'],
    [503, 'SERVICE_UNAVAILABLE', 'unavailable'],
  ])('propaga HTTP %i al cambiar stock', async (status, code, kind) => {
    const { client } = clientWith(apiProblem(status, code, 'Fallo'))
    expect(await rejection(createRealCatalogRepository(client).toggleStock('prod-leche', true, 'x'))).toMatchObject({ kind, status, code })
  })

  it('crea, edita y elimina categorías; el borrado con productos devuelve 409 CATEGORY_IN_USE', async () => {
    const category = { id: 'cat-lacteos', name: 'Lácteos y huevos', slug: 'lacteos', order: 1 }
    const { client, fetchImpl } = clientWith(
      json(staffCatalog()), json(category),
      json(staffCatalog()), json({ id: 'srv-cat', name: 'Nueva' }, 201),
      apiProblem(409, 'CATEGORY_IN_USE', 'La categoría tiene productos'),
    )
    const repo = createRealCatalogRepository(client)
    await repo.upsertCategory({ id: 'cat-lacteos', name: 'Lácteos y huevos', slug: 'lacteos', order: 1 }, 'x')
    expect(requestAt(fetchImpl, 1)).toMatchObject({ url: '/api/catalog/categories/cat-lacteos', method: 'PATCH' })
    expect(requestAt(fetchImpl, 1).body).toMatchObject({ icon: null, illustrationUrl: null })
    await repo.upsertCategory({ id: 'local', name: 'Nueva' }, 'x')
    expect(requestAt(fetchImpl, 3)).toMatchObject({ url: '/api/catalog/categories', method: 'POST', body: { name: 'Nueva' } })
    expect(await rejection(repo.deleteCategory('cat-lacteos', 'x'))).toMatchObject({ kind: 'conflict', code: 'CATEGORY_IN_USE' })
    expect(requestAt(fetchImpl, 4)).toMatchObject({ url: '/api/catalog/categories/cat-lacteos', method: 'DELETE' })
  })

  it('rechaza un catálogo con DTO inválido', async () => {
    const { client } = clientWith(json(staffCatalog({ products: [staffProduct({ price: 0 })] })))
    expect(await rejection(createRealCatalogRepository(client).listProducts())).toMatchObject({ kind: 'invalid_response' })
  })
})

describe('aliado y estado de tienda reales', () => {
  it('mapea la tienda a MerchantConfig sin inventar un WhatsApp ausente', async () => {
    const { client } = clientWith(json(storeDto()), json(storeDto({ contactPhone: null })))
    const repo = createRealMerchantRepository(client)
    expect(await repo.get('store-1')).toEqual({
      merchantId: 'store-1', name: 'Leche & Miel', whatsapp: '573105550101', address: 'Calle 1 # 2-3, Dolores', updatedAt: expect.any(String),
    })
    expect((await repo.get('store-1')).whatsapp).toBe('')
  })

  it('un aliado distinto al de la sesión es 404 local', async () => {
    const { client } = clientWith(json(storeDto()))
    expect(await rejection(createRealMerchantRepository(client).get('otra-tienda'))).toMatchObject({ kind: 'not_found' })
  })

  it('actualiza con PATCH normalizando el teléfono; vacío lo borra; el relleno se rechaza sin red', async () => {
    const { client, fetchImpl } = clientWith(json(storeDto()), json(storeDto({ contactPhone: null })))
    const repo = createRealMerchantRepository(client)
    const base = { merchantId: 'store-1', name: 'Leche & Miel', address: 'Calle 1', updatedAt: '' }
    await repo.update({ ...base, whatsapp: '+57 310 555 0101' }, 'x')
    expect(requestAt(fetchImpl)).toMatchObject({
      url: '/api/store/staff', method: 'PATCH', body: { name: 'Leche & Miel', contactPhone: '573105550101', address: 'Calle 1' },
    })
    await repo.update({ ...base, whatsapp: '' }, 'x')
    expect(requestAt(fetchImpl, 1).body).toMatchObject({ contactPhone: null })
    expect(await rejection(repo.update({ ...base, whatsapp: '+573000000000' }, 'x'))).toMatchObject({ kind: 'invalid_request' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('403 de operator y 409/503 llegan como errores explícitos', async () => {
    const { client } = clientWith(apiProblem(403, 'FORBIDDEN', 'Solo owner'), apiProblem(503, 'SERVICE_UNAVAILABLE', 'No disponible'))
    const repo = createRealMerchantRepository(client)
    const base = { merchantId: 'store-1', name: 'Leche & Miel', whatsapp: '', address: 'Calle 1', updatedAt: '' }
    expect(await rejection(repo.update(base, 'x'))).toMatchObject({ kind: 'forbidden' })
    expect(await rejection(repo.get('store-1'))).toMatchObject({ kind: 'unavailable' })
  })

  it('lee y actualiza override y horario; la apertura la decide el servidor', async () => {
    const { client, fetchImpl } = clientWith(
      json(storeDto()), json(storeDto({ scheduleOverride: 'closed' })), json(storeDto()), json(storeDto({ availability: { ...storeDto().availability, isOpen: false } })),
    )
    const repo = createRealStoreStatusRepository(client)
    expect((await repo.get()).override).toBe('auto')
    expect((await repo.setOverride('closed', 'x')).override).toBe('closed')
    expect(requestAt(fetchImpl, 1)).toMatchObject({ method: 'PATCH', body: { scheduleOverride: 'closed' } })
    await repo.setSchedule(storeDto().weeklySchedule, 'x')
    expect(Object.keys((requestAt(fetchImpl, 2).body as { weeklySchedule: object }).weeklySchedule)).toHaveLength(7)
    expect(await repo.isOpenNow()).toBe(false)
  })

  it('no evalúa la apertura en una hora arbitraria', async () => {
    const { client, fetchImpl } = clientWith()
    expect(await rejection(createRealStoreStatusRepository(client).isOpenNow(new Date()))).toBeInstanceOf(CapabilityUnavailableError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('pedidos reales', () => {
  it('pagina el histórico conservando items y nextCursor, con filtros en la zona de la tienda', async () => {
    const page = { items: [orderDto({ orderId: 'ord-2' }), orderDto()], nextCursor: 'cursor-abc_1' }
    const { client, fetchImpl } = clientWith(json(page))
    const result = await createRealOrderRepository(client).listPage(
      { status: 'received', q: ' Cliente ', from: '2026-10-01', to: '2026-10-02' },
      { limit: 2, cursor: 'cursor-previo' },
    )
    expect(result).toEqual(page)
    const url = new URL(requestAt(fetchImpl).url, 'https://admin.test')
    expect(url.pathname).toBe('/api/orders')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: 'received', q: 'Cliente', limit: '2', cursor: 'cursor-previo',
      from: '2026-10-01T05:00:00.000Z', to: '2026-10-03T05:00:00.000Z',
    })
  })

  it('list() recorre las páginas con el cursor y no trunca', async () => {
    const { client, fetchImpl } = clientWith(
      json({ items: [orderDto({ orderId: 'a' })], nextCursor: 'c1' }),
      json({ items: [orderDto({ orderId: 'b' })], nextCursor: null }),
    )
    const orders = await createRealOrderRepository(client).list()
    expect(orders.map((o) => o.orderId)).toEqual(['a', 'b'])
    expect(new URL(requestAt(fetchImpl, 1).url, 'https://admin.test').searchParams.get('cursor')).toBe('c1')
  })

  it('list() falla de forma explícita si el histórico excede el tope', async () => {
    const endless = Array.from({ length: 25 }, () => json({ items: [orderDto()], nextCursor: 'mas' }))
    const { client } = clientWith(...endless)
    expect(await rejection(createRealOrderRepository(client).list())).toMatchObject({ kind: 'invalid_request' })
  })

  it('valida la query contra el contrato antes de enviar', async () => {
    const { client, fetchImpl } = clientWith()
    const repo = createRealOrderRepository(client)
    expect(await rejection(repo.listPage({}, { limit: 101 }))).toMatchObject({ kind: 'invalid_request' })
    expect(await rejection(repo.listPage({ from: '2026-10-05', to: '2026-10-01' }))).toMatchObject({ kind: 'invalid_request' })
    expect(await rejection(repo.listPage({ from: '02/10/2026' }))).toMatchObject({ kind: 'invalid_request' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('lee un pedido por ID y conserva todos los campos del DTO', async () => {
    const order = orderDto({ status: 'cancelled', finalTotal: 9000, shippingCost: 0, updatedAt: '2026-10-02T16:00:00.000Z' })
    const { client, fetchImpl } = clientWith(json(order))
    expect(await createRealOrderRepository(client).getById('ord-1')).toEqual(order)
    expect(requestAt(fetchImpl).url).toBe('/api/orders/ord-1')
  })

  it.each([
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [503, 'unavailable'],
  ])('propaga HTTP %i en lecturas de pedidos', async (status, kind) => {
    const { client } = clientWith(apiProblem(status, 'ERR', 'Fallo'), apiProblem(status, 'ERR', 'Fallo'))
    const repo = createRealOrderRepository(client)
    expect(await rejection(repo.getById('ord-1'))).toMatchObject({ kind, status })
    expect(await rejection(repo.listPage())).toMatchObject({ kind, status })
  })

  it('rechaza un pedido con DTO inválido', async () => {
    const { client } = clientWith(json({ ...orderDto(), status: 'inventado' }))
    expect(await rejection(createRealOrderRepository(client).getById('ord-1'))).toMatchObject({ kind: 'invalid_response' })
  })

  it('crea un pedido con Idempotency-Key y teléfono canónico', async () => {
    const confirmation = { orderId: 'ord-9', status: 'received', estimatedTotal: 10000 }
    const { client, fetchImpl } = clientWith(json(confirmation, 201), apiProblem(409, 'IDEMPOTENCY_KEY_REUSED', 'Clave reutilizada'))
    const repo = createRealOrderRepository(client)
    const payload = {
      userId: 'usr-cli', items: [{ id: 'prod-leche', qty: 2 }], substitutionPreference: 'call_me' as const,
      deliveryType: 'pickup' as const, deliveryData: {}, customerName: 'Cliente Demo', customerPhone: '+57 310 555 0101',
    }
    expect(await repo.submit(payload, 'clave-idempotente-0001')).toEqual(confirmation)
    expect(requestAt(fetchImpl)).toMatchObject({
      url: '/api/orders', method: 'POST', headers: { 'Idempotency-Key': 'clave-idempotente-0001' }, body: { customerPhone: '573105550101' },
    })
    expect(await rejection(repo.submit(payload, 'clave-idempotente-0001'))).toMatchObject({ kind: 'conflict', code: 'IDEMPOTENCY_KEY_REUSED' })
    expect(await rejection(repo.submit(payload, 'corta'))).toMatchObject({ kind: 'invalid_request' })
  })

  it('transición de estado: PATCH /status con la versión leída; el 409 llega como conflicto', async () => {
    const updated = orderDto({ status: 'confirmed', version: 3 })
    const { client, fetchImpl } = clientWith(json(updated), apiProblem(409, 'ORDER_VERSION_CONFLICT', 'El pedido cambió'))
    const repo = createRealOrderRepository(client)
    expect(await repo.updateStatus('ord-1', 'confirmed', 'ignorado@maui.test', 2)).toEqual(updated)
    expect(requestAt(fetchImpl)).toMatchObject({ url: '/api/orders/ord-1/status', method: 'PATCH', body: { status: 'confirmed', expectedVersion: 2 } })
    expect(await rejection(repo.updateStatus('ord-1', 'confirmed', 'x', 2))).toMatchObject({ kind: 'conflict', code: 'ORDER_VERSION_CONFLICT' })
  })

  it('cancelar envía motivo y versión; sin motivo válido o sin versión no toca la red', async () => {
    const { client, fetchImpl } = clientWith(json(orderDto({ status: 'cancelled', cancellationReason: 'Sin stock', cancelledAt: NOW_ISO, version: 4 })))
    const repo = createRealOrderRepository(client)
    expect((await repo.cancel('ord-1', '  Sin stock  ', 'x', 3)).status).toBe('cancelled')
    expect(requestAt(fetchImpl).body).toEqual({ status: 'cancelled', expectedVersion: 3, reason: 'Sin stock' })
    expect(await rejection(repo.cancel('ord-1', 'no', 'x', 3))).toMatchObject({ kind: 'invalid_request' })
    expect(await rejection(repo.cancel('ord-1', 'Sin stock', 'x'))).toMatchObject({ kind: 'invalid_request' })
    expect(await rejection(repo.updateStatus('ord-1', 'confirmed', 'x'))).toMatchObject({ kind: 'invalid_request' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('pesos reales: PATCH de cambios tipo weight con la versión leída y límites de gramos', async () => {
    const { client, fetchImpl } = clientWith(json(orderDto({ status: 'preparing', version: 5 })))
    const repo = createRealOrderRepository(client)
    await repo.setRealWeights('ord-1', [{ itemId: 'prod-queso', kilos: 0.755 }], 'x', 4)
    expect(requestAt(fetchImpl)).toMatchObject({
      url: '/api/orders/ord-1', method: 'PATCH',
      body: { expectedVersion: 4, changes: [{ type: 'weight', itemId: 'prod-queso', kilosReal: 0.755 }] },
    })
    expect(await rejection(repo.setRealWeights('ord-1', [{ itemId: 'prod-queso', kilos: 0.7555 }], 'x', 4))).toMatchObject({ kind: 'invalid_request' })
    expect(await rejection(repo.setRealWeights('ord-1', [{ itemId: 'prod-queso', kilos: 0 }], 'x', 4))).toMatchObject({ kind: 'invalid_request' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('sustituir y quitar ítems viajan en un solo PATCH atómico', async () => {
    const { client, fetchImpl } = clientWith(json(orderDto({ status: 'preparing', version: 6 })))
    await createRealOrderRepository(client).changeItems('ord-1', [
      { type: 'remove', itemId: 'prod-a', customerContacted: true },
      { type: 'substitute', itemId: 'prod-b', productId: 'prod-c', qty: 1, customerContacted: true },
    ], 5)
    expect(requestAt(fetchImpl).body).toEqual({
      expectedVersion: 5,
      changes: [
        { type: 'remove', itemId: 'prod-a', customerContacted: true },
        { type: 'substitute', itemId: 'prod-b', productId: 'prod-c', qty: 1, customerContacted: true },
      ],
    })
  })
})

describe('auditoría real', () => {
  const event = {
    id: 'aud-1', storeId: 'store-1', entity: 'order', entityId: 'ord-1', action: 'status_changed',
    actorKind: 'account', actorId: 'usr-owner', createdAt: NOW_ISO, metadata: { previousStatus: 'received', status: 'confirmed', version: 2 },
  }

  it('lista una página con filtros y cursor del servidor', async () => {
    const { client, fetchImpl } = clientWith(json({ items: [event], nextCursor: 'cur_1' }))
    const page = await createRealAuditRepository(client).listPage(
      { entity: 'order', action: 'status_changed', entityId: ' ord-1 ', from: '2026-10-01T05:00:00.000Z' },
      { limit: 50, cursor: 'previo' },
    )
    expect(page).toEqual({ items: [event], nextCursor: 'cur_1' })
    const url = new URL(requestAt(fetchImpl).url, 'https://admin.test')
    expect(url.pathname).toBe('/api/audit')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      entity: 'order', action: 'status_changed', entityId: 'ord-1', from: '2026-10-01T05:00:00.000Z', limit: '50', cursor: 'previo',
    })
  })

  it('valida la query antes de enviar y rechaza eventos fuera del contrato', async () => {
    const { client, fetchImpl } = clientWith(json({ items: [{ ...event, metadata: { secreto: 'x' } }], nextCursor: null }))
    const repo = createRealAuditRepository(client)
    expect(await rejection(repo.listPage({ from: '2026-10-05T00:00:00Z', to: '2026-10-01T00:00:00Z' }))).toMatchObject({ kind: 'invalid_request' })
    expect(await rejection(repo.listPage({}, { limit: 500 }))).toMatchObject({ kind: 'invalid_request' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await rejection(repo.listPage())).toMatchObject({ kind: 'invalid_response' })
  })

  it.each([[401, 'unauthenticated'], [403, 'forbidden'], [503, 'unavailable']])('propaga HTTP %i', async (status, kind) => {
    const { client } = clientWith(apiProblem(status, 'ERR', 'Fallo'))
    expect(await rejection(createRealAuditRepository(client).listPage())).toMatchObject({ kind, status })
  })
})
