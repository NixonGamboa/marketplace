import { describe, expect, it, vi } from 'vitest'
import type { OrderPayload } from '@/types/orderService'
import { createApiClient } from '../../http/apiClient'
import { ApiError } from '../../http/apiError'
import { createRealAuthService } from '../../realAuthService'
import { createRealCatalogService } from '../../realCatalogService'
import { createRealOrderService } from '../../realOrderService'
import { checkoutErrorMessage } from '../../checkoutErrorMessage'
import { createCheckoutIntents, type IntentStorage, type StoredIntent } from '../checkoutIntent'
import {
  apiProblem,
  clientWith,
  customerSession,
  json,
  orderDto,
  ownerSession,
  publicCatalog,
  requestAt,
  storeDto,
} from './fixtures'

const rejection = async (promise: Promise<unknown>): Promise<unknown> => promise.then(() => undefined, (error: unknown) => error)

describe('catálogo real: copia del service worker', () => {
  const served = { 'X-Maui-Served-From-Cache': '1', 'X-Maui-Cached-At': '1790000000000' }

  it('informa el instante de guardado solo si el worker respondió con su copia', async () => {
    const onServedFromCache = vi.fn()
    const { client } = clientWith(json(publicCatalog(), 200, served), json(publicCatalog()), json(publicCatalog(), 200, { 'X-Maui-Cached-At': '1790000000000' }))
    const service = createRealCatalogService(client)
    await service.getCatalog({ onServedFromCache })
    expect(onServedFromCache).toHaveBeenCalledExactlyOnceWith(1790000000000)

    onServedFromCache.mockClear()
    await service.getCatalog({ onServedFromCache })
    await service.getCatalog({ onServedFromCache })
    expect(onServedFromCache).not.toHaveBeenCalled()
  })

  it('sigue funcionando sin observador y no cambia la petición (misma credencial, sin caché del navegador)', async () => {
    const { client, fetchImpl } = clientWith(json(publicCatalog(), 200, served))
    expect((await createRealCatalogService(client).getCatalog()).products).toHaveLength(2)
    expect(requestAt(fetchImpl)).toMatchObject({ url: '/api/catalog', method: 'GET', credentials: 'same-origin', cache: 'no-store' })
  })
})

describe('auth real de cliente', () => {
  it('registra con el esquema estricto, abre sesión y mapea el perfil sin tokens', async () => {
    const { client, fetchImpl } = clientWith(json(customerSession(), 201))
    const session = await createRealAuthService(client).register({ name: 'Cliente Demo', phone: '+57 310 555 0101', password: 'clave-segura-123' })
    expect(requestAt(fetchImpl)).toMatchObject({
      url: '/api/auth/register', method: 'POST', credentials: 'same-origin',
      body: { name: 'Cliente Demo', phone: '573105550101', password: 'clave-segura-123' },
    })
    expect(session.user).toEqual({ id: 'usr-cli', name: 'Cliente Demo', phone: '573105550101', isAuthenticated: true })
  })

  it('inicia sesión por teléfono; una cuenta de personal se cierra y se niega', async () => {
    const ok = clientWith(json(customerSession()))
    await createRealAuthService(ok.client).login('310 555 0101', 'clave-segura-123')
    expect(requestAt(ok.fetchImpl).body).toEqual({ method: 'phone', phone: '573105550101', password: 'clave-segura-123' })

    const staff = clientWith(json(ownerSession()), new Response(null, { status: 204 }))
    const service = createRealAuthService(staff.client)
    expect(await rejection(service.login('310 555 0101', 'clave-segura-123'))).toMatchObject({ kind: 'forbidden' })
    expect(requestAt(staff.fetchImpl, 1).url).toBe('/api/auth/logout')
    expect(service.getSession()).toBeNull()
  })

  it.each([
    [401, 'INVALID_CREDENTIALS', 'unauthenticated'],
    [409, 'ACCOUNT_CONFLICT', 'conflict'],
    [429, 'RATE_LIMITED', 'rate_limited'],
    [503, 'SERVICE_UNAVAILABLE', 'unavailable'],
  ])('propaga HTTP %i del acceso', async (status, code, kind) => {
    const { client } = clientWith(apiProblem(status, code, 'Fallo'))
    expect(await rejection(createRealAuthService(client).login('3105550101', 'clave-segura-123'))).toMatchObject({ kind, code })
  })

  it('no envía un registro con contraseña corta ni un teléfono inválido', async () => {
    const { client, fetchImpl } = clientWith()
    const service = createRealAuthService(client)
    expect(await rejection(service.register({ name: 'Ana', phone: '3105550101', password: 'corta' }))).toMatchObject({ kind: 'invalid_request' })
    expect(await rejection(service.register({ name: 'Ana', phone: '123', password: 'clave-segura-123' }))).toMatchObject({ kind: 'invalid_request' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('me() lee la cookie en el servidor: 401 → null, 503 se propaga', async () => {
    const { client } = clientWith(json(customerSession()), apiProblem(401, 'UNAUTHENTICATED', 'x'), apiProblem(503, 'SERVICE_UNAVAILABLE', 'x'))
    const service = createRealAuthService(client)
    expect((await service.me())?.user.id).toBe('usr-cli')
    expect(await service.me()).toBeNull()
    expect(await rejection(service.me())).toMatchObject({ kind: 'unavailable' })
  })

  it('ensureSession reutiliza la sesión en memoria y logout no finge el cierre si falla', async () => {
    const { client, fetchImpl } = clientWith(json(customerSession()), apiProblem(503, 'SERVICE_UNAVAILABLE', 'x'), new Response(null, { status: 204 }))
    const service = createRealAuthService(client)
    await service.login('3105550101', 'clave-segura-123')
    await service.ensureSession()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(await rejection(service.logout())).toMatchObject({ kind: 'unavailable' })
    expect(service.getSession()).not.toBeNull()
    await service.logout()
    expect(service.getSession()).toBeNull()
  })
})

describe('catálogo y tienda reales', () => {
  it('lee el catálogo público completo conservando agotados', async () => {
    const { client, fetchImpl } = clientWith(json(publicCatalog()))
    const catalog = await createRealCatalogService(client).getCatalog()
    expect(catalog.products.map((p) => [p.id, p.inStock])).toEqual([['prod-leche', true], ['prod-agotado', false]])
    expect(requestAt(fetchImpl)).toMatchObject({ url: '/api/catalog', credentials: 'same-origin', cache: 'no-store' })
  })

  it('lee producto y tienda; 404 sin seed es un error explícito', async () => {
    const { client, fetchImpl } = clientWith(json(publicCatalog().products[0]), json(storeDto()), apiProblem(404, 'STORE_NOT_FOUND', 'Tienda no encontrada'))
    const service = createRealCatalogService(client)
    expect((await service.getProduct('prod-leche')).price).toBe(5000)
    expect(requestAt(fetchImpl).url).toBe('/api/catalog/products/prod-leche')
    expect((await service.getStore()).availability.isOpen).toBe(true)
    expect(await rejection(service.getStore())).toMatchObject({ kind: 'not_found', code: 'STORE_NOT_FOUND' })
  })

  it('rechaza un catálogo con DTO inválido y propaga 429/503', async () => {
    const broken = publicCatalog()
    broken.products[0] = { ...broken.products[0]!, price: 0 }
    const { client } = clientWith(json(broken), apiProblem(429, 'RATE_LIMITED', 'x', { 'Retry-After': '5' }), apiProblem(503, 'SERVICE_UNAVAILABLE', 'x'))
    const service = createRealCatalogService(client)
    expect(await rejection(service.getCatalog())).toMatchObject({ kind: 'invalid_response' })
    expect(await rejection(service.getCatalog())).toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 5 })
    expect(await rejection(service.getCatalog())).toMatchObject({ kind: 'unavailable' })
  })

  it('propaga la cancelación del llamador', async () => {
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const controller = new AbortController()
    const pending = rejection(createRealCatalogService(createApiClient({ fetchImpl })).getCatalog({ signal: controller.signal }))
    controller.abort()
    expect(await pending).toMatchObject({ kind: 'aborted' })
  })
})

const memoryStorage = (): IntentStorage & { value: StoredIntent | null } => {
  const box = { value: null as StoredIntent | null }
  return Object.assign(box, {
    read: () => box.value,
    write: (intent: StoredIntent) => { box.value = intent },
    clear: () => { box.value = null },
  })
}

const payload = (overrides: Partial<OrderPayload> = {}): OrderPayload => ({
  userId: 'usr-cli',
  items: [{ id: 'prod-leche', qty: 2, priceAtMoment: 5000, name: 'Leche entera' }],
  substitutionPreference: 'call_me',
  deliveryType: 'pickup',
  deliveryData: { timeSlot: 'morning' },
  customerName: 'Cliente Demo',
  customerPhone: '310 555 0101',
  shippingCost: 0,
  ...overrides,
})

const confirmation = { orderId: 'ord-9', status: 'received', estimatedTotal: 10000 }

const orderServiceWith = (responses: Array<Response | Error>, sessionResponses = true) => {
  const { client, fetchImpl } = clientWith(...(sessionResponses ? [json(customerSession())] : []), ...responses)
  const storage = memoryStorage()
  let counter = 0
  const intents = createCheckoutIntents(storage, () => `clave-intencion-${(counter += 1).toString().padStart(4, '0')}`)
  const service = createRealOrderService(client, createRealAuthService(client), intents)
  return { service, fetchImpl, storage }
}

const keyOf = (fetchImpl: ReturnType<typeof clientWith>['fetchImpl'], index: number) => requestAt(fetchImpl, index).headers['Idempotency-Key']

describe('pedidos reales: creación e idempotencia', () => {
  it('exige sesión del servidor y no envía nada sin ella', async () => {
    const { service, fetchImpl } = orderServiceWith([apiProblem(401, 'UNAUTHENTICATED', 'Sesión inválida')], false)
    expect(await rejection(service.submit(payload()))).toMatchObject({ kind: 'unauthenticated' })
    expect(fetchImpl).toHaveBeenCalledTimes(1) // solo /auth/session
    expect(requestAt(fetchImpl).url).toBe('/api/auth/session')
  })

  it('rechaza un userId distinto al de la sesión (perfil local no es identidad)', async () => {
    const { service, fetchImpl } = orderServiceWith([])
    expect(await rejection(service.submit(payload({ userId: 'wa-3105550101' })))).toMatchObject({ kind: 'forbidden' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('envía solo lo que decide el cliente, con teléfono canónico y Idempotency-Key', async () => {
    const { service, fetchImpl } = orderServiceWith([json(confirmation, 201)])
    expect(await service.submit(payload())).toEqual(confirmation)
    const sent = requestAt(fetchImpl, 1)
    expect(sent).toMatchObject({ url: '/api/orders', method: 'POST', credentials: 'same-origin' })
    expect(sent.headers['Idempotency-Key']).toBe('clave-intencion-0001')
    expect(sent.body).toEqual({
      userId: 'usr-cli', items: [{ id: 'prod-leche', qty: 2 }], substitutionPreference: 'call_me',
      deliveryType: 'pickup', deliveryData: { timeSlot: 'morning' }, customerName: 'Cliente Demo', customerPhone: '573105550101',
    })
  })

  it.each([
    ['red caída', new TypeError('Failed to fetch')],
    ['HTTP 503', apiProblem(503, 'SERVICE_UNAVAILABLE', 'x')],
    ['HTTP 429', apiProblem(429, 'RATE_LIMITED', 'x', { 'Retry-After': '3' })],
    ['respuesta ilegible', json({ orderId: 'ord-9' }, 201)],
  ])('tras %s el reintento del mismo pedido reutiliza la clave', async (_name, failure) => {
    const { service, fetchImpl, storage } = orderServiceWith([failure, json(confirmation, 201)])
    await rejection(service.submit(payload()))
    expect(storage.value?.key).toBe('clave-intencion-0001')
    expect(await service.submit(payload())).toEqual(confirmation)
    expect(keyOf(fetchImpl, 1)).toBe('clave-intencion-0001')
    expect(keyOf(fetchImpl, 2)).toBe('clave-intencion-0001')
    expect(storage.value).toBeNull()
  })

  it('el reintento tras recargar la página (otro gestor, misma persistencia) conserva la clave', async () => {
    const first = orderServiceWith([new Error('corte')])
    await rejection(first.service.submit(payload()))
    const { client, fetchImpl } = clientWith(json(customerSession()), json(confirmation, 201))
    const reloaded = createRealOrderService(client, createRealAuthService(client), createCheckoutIntents(first.storage, () => 'otra-clave-nueva-0001'))
    await reloaded.submit(payload())
    expect(keyOf(fetchImpl, 1)).toBe('clave-intencion-0001')
  })

  it('un pedido distinto es una intención nueva con otra clave; el teléfono con otro formato es el mismo', async () => {
    const { service, fetchImpl } = orderServiceWith([new Error('corte'), new Error('corte'), json(confirmation, 201)])
    await rejection(service.submit(payload()))
    await rejection(service.submit(payload({ customerPhone: '+57 310-555-0101' })))
    await rejection(service.submit(payload({ items: [{ id: 'prod-leche', qty: 3, priceAtMoment: 5000 }] })))
    expect(keyOf(fetchImpl, 1)).toBe('clave-intencion-0001')
    expect(keyOf(fetchImpl, 2)).toBe('clave-intencion-0001')
    expect(keyOf(fetchImpl, 3)).toBe('clave-intencion-0002')
  })

  it('tras confirmar, la siguiente compra usa una clave nueva', async () => {
    const { service, fetchImpl } = orderServiceWith([json(confirmation, 201), json(confirmation, 201)])
    await service.submit(payload())
    await service.submit(payload())
    expect(keyOf(fetchImpl, 1)).toBe('clave-intencion-0001')
    expect(keyOf(fetchImpl, 2)).toBe('clave-intencion-0002')
  })

  it('un 409 no se disfraza de éxito y la clave no se reutiliza', async () => {
    const { service, fetchImpl } = orderServiceWith([apiProblem(409, 'IDEMPOTENCY_KEY_REUSED', 'Clave reutilizada'), json(confirmation, 201)])
    expect(await rejection(service.submit(payload()))).toMatchObject({ kind: 'conflict', code: 'IDEMPOTENCY_KEY_REUSED' })
    await service.submit(payload())
    expect(keyOf(fetchImpl, 2)).toBe('clave-intencion-0002')
  })

  it.each([
    [400, 'VALIDATION_ERROR', 'validation'],
    [403, 'FORBIDDEN', 'forbidden'],
    [404, 'NOT_FOUND', 'not_found'],
  ])('un rechazo definitivo %i termina la intención', async (status, code, kind) => {
    const { service, storage } = orderServiceWith([apiProblem(status, code, 'No')])
    expect(await rejection(service.submit(payload()))).toMatchObject({ kind })
    expect(storage.value).toBeNull()
  })

  it('un doble clic con la misma intención en vuelo envía una sola petición', async () => {
    let release: (response: Response) => void = () => undefined
    const slow = new Promise<Response>((resolve) => { release = resolve })
    const { client, fetchImpl } = clientWith(json(customerSession()))
    fetchImpl.mockImplementationOnce(() => slow)
    const service = createRealOrderService(client, createRealAuthService(client), createCheckoutIntents(memoryStorage(), () => 'clave-doble-clic-0001'))
    const first = service.submit(payload())
    const second = service.submit(payload())
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
    release(json(confirmation, 201))
    expect(await Promise.all([first, second])).toEqual([confirmation, confirmation])
    expect(fetchImpl).toHaveBeenCalledTimes(2) // sesión + un solo POST
  })

  it('un timeout real del cliente conserva la clave y se puede cancelar', async () => {
    const { client } = clientWith(json(customerSession()))
    const hanging = vi.fn<typeof fetch>((url, init) => (String(url).includes('/auth/')
      ? Promise.resolve(json(customerSession()))
      : new Promise((_resolve, reject) => {
        if (init?.signal?.aborted) reject(new DOMException('aborted', 'AbortError'))
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })))
    const slowClient = createApiClient({ fetchImpl: hanging, timeoutMs: 20 })
    const storage = memoryStorage()
    const service = createRealOrderService(slowClient, createRealAuthService(client), createCheckoutIntents(storage, () => 'clave-timeout-0001'))
    // La sesión se resuelve con `client`; el POST usa `slowClient`.
    expect(await rejection(service.submit(payload()))).toMatchObject({ kind: 'timeout' })
    expect(storage.value?.key).toBe('clave-timeout-0001')
    const controller = new AbortController()
    const pending = rejection(service.submit(payload(), { signal: controller.signal }))
    controller.abort()
    expect(await pending).toMatchObject({ kind: 'aborted' })
    expect(storage.value?.key).toBe('clave-timeout-0001')
  })
})

describe('pedidos reales: lectura y paginación', () => {
  it('lee un pedido por ID y conserva todos los campos', async () => {
    const order = orderDto({ status: 'preparing', finalTotal: 9000, shippingCost: 0, updatedAt: '2026-10-02T16:00:00.000Z' })
    const { client, fetchImpl } = clientWith(json(order))
    const service = createRealOrderService(client, createRealAuthService(client), createCheckoutIntents(memoryStorage()))
    expect(await service.getById('ord-1')).toEqual(order)
    expect(requestAt(fetchImpl).url).toBe('/api/orders/ord-1')
  })

  it.each([
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [503, 'unavailable'],
  ])('propaga HTTP %i en lecturas', async (status, kind) => {
    const { client } = clientWith(apiProblem(status, 'ERR', 'Fallo'))
    const service = createRealOrderService(client, createRealAuthService(client), createCheckoutIntents(memoryStorage()))
    expect(await rejection(service.getById('ord-1'))).toMatchObject({ kind, status })
  })

  it('list() recorre todas las páginas con el cursor y exige la sesión', async () => {
    const { service, fetchImpl } = orderServiceWith([
      json({ items: [orderDto({ orderId: 'a' })], nextCursor: 'c1' }),
      json({ items: [orderDto({ orderId: 'b' })], nextCursor: null }),
    ])
    expect((await service.list('usr-cli')).map((o) => o.orderId)).toEqual(['a', 'b'])
    expect(requestAt(fetchImpl, 1).url).toBe('/api/orders?limit=100')
    expect(requestAt(fetchImpl, 2).url).toBe('/api/orders?limit=100&cursor=c1')
  })

  it('listPage conserva nextCursor; list() falla en vez de truncar; userId ajeno se rechaza', async () => {
    const endless = Array.from({ length: 25 }, () => json({ items: [orderDto()], nextCursor: 'mas' }))
    const { service } = orderServiceWith([json({ items: [orderDto()], nextCursor: 'sig' }), ...endless])
    expect(await rejection(service.list('otro-usuario'))).toMatchObject({ kind: 'forbidden' })
    expect(await service.listPage({ limit: 1 })).toMatchObject({ nextCursor: 'sig' })
    expect(await rejection(service.list())).toMatchObject({ kind: 'invalid_request' })
  })

  it('rechaza una página con DTO inválido', async () => {
    const { service } = orderServiceWith([json({ items: [{ ...orderDto(), status: 'inventado' }], nextCursor: null })])
    expect(await rejection(service.list())).toMatchObject({ kind: 'invalid_response' })
  })
})

describe('mensajes de checkout', () => {
  it.each([
    [new ApiError({ kind: 'unauthenticated', message: 'x' }), /Inicia sesión/],
    [new ApiError({ kind: 'conflict', message: 'x' }), /Revisa Mis pedidos/],
    [new ApiError({ kind: 'rate_limited', message: 'x', retryAfterSeconds: 30 }), /30 segundos/],
    [new ApiError({ kind: 'timeout', message: 'x' }), /no se duplicará/],
    [new ApiError({ kind: 'unavailable', message: 'x' }), /carrito sigue guardado/],
    [new Error('otro'), /No pudimos procesar tu pedido/],
  ])('mapea el error a un mensaje claro', (error, pattern) => {
    expect(checkoutErrorMessage(error)).toMatch(pattern)
  })
})
