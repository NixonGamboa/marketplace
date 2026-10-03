import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  apiErrorSchema, auditListResponseSchema, authSessionResponseSchema, categoryDtoSchema, orderConfirmationSchema, orderDtoSchema,
  orderListResponseSchema, productDtoSchema, publicCatalogResponseSchema, staffCatalogResponseSchema, staffProductDtoSchema, storeDtoSchema,
  type OrderDto,
} from '../../../shared/contracts/index.js'
import { customerReceiptFrom, staffReceiptFrom } from '../../../shared/receipts/index.js'
import { STORE, startHttpWorld, type Actor, type HttpWorld, type WireResponse } from './httpWorld.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })

/**
 * Contratos entre las dos apps y la API con handlers reales y PostgreSQL embebido. Cada cuerpo se
 * serializa a JSON antes de llegar al esquema, como hace `response.json()` en el ApiClient de las
 * apps, y los paths son los que construyen sus adapters, resueltos con los `rewrites` de
 * `vercel.json`. Las referencias a los adapters se leen, no se importan: el runtime de cada app no
 * forma parte de este paquete. No contacta Neon ni Vercel.
 */
describe('contratos serializados entre PWA, admin y API', () => {
  let world: HttpWorld
  let actors: HttpWorld['actors']
  beforeAll(async () => {
    world = await startHttpWorld()
    actors = world.actors
  })
  afterAll(async () => { await world?.close() })

  const read = <T>(schema: { parse(value: unknown): T }, response: WireResponse, status = 200): T => {
    expect(response.status, JSON.stringify(response.body)).toBe(status)
    return schema.parse(response.body)
  }
  const get = (path: string, actor?: Actor) => world.fetch('GET', path, { cookie: actor?.cookie })
  const send = (method: string, path: string, actor: Actor, body?: unknown, headers?: Record<string, string>) =>
    world.fetch(method, path, { cookie: actor.cookie, body, ...(headers ? { headers } : {}) })
  const order = async (actor: Actor, id: string, viewer = actor): Promise<OrderDto> => read(orderDtoSchema, await get(`/api/orders/${encodeURIComponent(id)}`, viewer))
  const place = async (actor: Actor, body: Record<string, unknown> = {}): Promise<string> =>
    read(orderConfirmationSchema, await world.placeOrder(actor, body), 201).orderId
  const patchStatus = async (id: string, actor: Actor, expectedVersion: number, extra: Record<string, unknown>) =>
    read(orderDtoSchema, await send('PATCH', `/api/orders/${id}/status`, actor, { expectedVersion, ...extra }))
  const categoryId = async (): Promise<string> => read(staffCatalogResponseSchema, await get('/api/catalog/staff', actors.owner)).categories[0]!.id

  it('seguimiento entre apps: lo que crea la PWA lo ve el admin con su versión y el cambio del admin vuelve a la PWA', async () => {
    // PWA (realCatalogService / realAuthService): lecturas públicas y sesión del cliente.
    const catalog = read(publicCatalogResponseSchema, await get('/api/catalog'))
    expect(catalog.products.map(product => product.id)).toEqual(expect.arrayContaining(['prod_leche', 'prod_carne']))
    read(productDtoSchema, await get('/api/catalog/products/prod_leche'))
    expect(read(storeDtoSchema, await get('/api/store')).storeId).toBe(STORE)
    expect(read(authSessionResponseSchema, await get('/api/auth/session', actors.customer)).account).toMatchObject({ id: actors.customer.id, role: 'customer' })

    // PWA (createOrderRequestFrom): domicilio con GPS, referencia y franja; envío y total los fija el servidor.
    const delivery = { deliveryType: 'delivery', deliveryData: { address: 'Casa azul junto a la plaza', lat: 3.5271, lng: -74.8977, timeSlot: 'morning' }, items: [{ id: 'prod_leche', qty: 1 }] }
    const id = await place(actors.customer, delivery)
    const created = await order(actors.customer, id)
    expect(created).toMatchObject({ status: 'received', version: 1, shippingCost: 3000, estimatedTotal: 7500, deliveryData: delivery.deliveryData, userId: actors.customer.id, customerPhone: '573001234567' })
    expect(created).not.toHaveProperty('storeId')

    // Admin (orderListQueryFrom): ventana ISO + estado + prefijo de ID, `limit` como texto de query.
    const query = new URLSearchParams({ status: 'received', q: id.slice(0, 10), from: new Date(Date.now() - 864e5).toISOString(), to: new Date(Date.now() + 864e5).toISOString(), limit: '100' })
    const staffList = read(orderListResponseSchema, await get(`/api/orders?${query}`, actors.operator))
    expect(staffList.items.map(item => item.orderId)).toEqual([id])
    expect(staffList.nextCursor).toBeNull()

    // Admin (updateStatus): PATCH con la versión leída; la PWA lo ve por detalle e historial.
    const confirmed = await patchStatus(id, actors.operator, staffList.items[0]!.version!, { status: 'confirmed' })
    expect(confirmed).toMatchObject({ status: 'confirmed', version: 2 })
    expect(await order(actors.customer, id)).toMatchObject({ status: 'confirmed', version: 2 })
    const history = read(orderListResponseSchema, await get('/api/orders?limit=100&status=confirmed', actors.customer))
    expect(history.items.find(item => item.orderId === id)).toMatchObject({ version: 2, status: 'confirmed' })

    // Otro cliente y personal de otra tienda reciben el mismo 404 con envelope.
    for (const stranger of [actors.other, actors.foreign]) {
      const hidden = await get(`/api/orders/${id}`, stranger)
      expect(hidden.status).toBe(404)
      expect(apiErrorSchema.parse(hidden.body).error).toBeTruthy()
    }
  })

  it('catálogo del admin: formulario completo con nulls, alta con todos los campos, archivar y restaurar', async () => {
    const category = await categoryId()
    // realCatalogRepository.upsertProduct (createProductRequestFrom): alta con todos los opcionales.
    const full = {
      name: 'Queso campesino 250 g', name_display: 'Queso campesino', name_legal: 'Queso campesino pasteurizado 250 g', price: 9000, originalPrice: 9900,
      unit: '250 g', imageUrl: '/queso.png', categoryId: category, inStock: true, is_variable_weight: false, badge: 'Nuevo', currency: 'COP',
      description: 'Fresco del día', nutritionalInfo: { calories: 300, protein: '18 g', fat: '22 g', carbs: '2 g', serving: '30 g' }, availability: 'Lunes a sábado',
    }
    const created = read(staffProductDtoSchema, await send('POST', '/api/catalog/products', actors.owner, full), 201)
    expect(created).toMatchObject({ originalPrice: 9900, badge: 'Nuevo', version: 1, active: true, archived: false })

    // updateProductRequestFrom: edición completa; lo ausente viaja como null para borrarlo.
    const form = {
      name: 'Queso campesino 250 g', name_display: null, name_legal: null, price: 9500, originalPrice: null, unit: '250 g', imageUrl: '/queso.png',
      categoryId: category, inStock: true, is_variable_weight: false, badge: null, description: null, nutritionalInfo: null, availability: null,
    }
    const edited = read(staffProductDtoSchema, await send('PATCH', `/api/catalog/products/${created.id}`, actors.owner, form))
    expect(edited).toMatchObject({ price: 9500, version: 2 })
    for (const cleared of ['name_display', 'name_legal', 'originalPrice', 'badge', 'description', 'nutritionalInfo', 'availability']) expect(edited).not.toHaveProperty(cleared)
    const audit = read(auditListResponseSchema, await get(`/api/audit?entity=product&entityId=${created.id}&action=updated`, actors.owner))
    expect(audit.items[0]).toMatchObject({ actorId: actors.owner.id, metadata: { previousVersion: 1, version: 2, fields: Object.keys(form) } })

    // deleteProduct archiva (`{ archived: true }`): la PWA deja de verlo y el admin lo conserva; restaurar lo devuelve.
    read(staffProductDtoSchema, await send('PATCH', `/api/catalog/products/${created.id}`, actors.owner, { archived: true }))
    expect(read(publicCatalogResponseSchema, await get('/api/catalog')).products.some(product => product.id === created.id)).toBe(false)
    expect((await get(`/api/catalog/products/${created.id}`)).status).toBe(404)
    expect(read(staffCatalogResponseSchema, await get('/api/catalog/staff', actors.owner)).products.find(product => product.id === created.id)).toMatchObject({ archived: true })
    read(staffProductDtoSchema, await send('PATCH', `/api/catalog/products/${created.id}`, actors.owner, { archived: false, inStock: false }))
    const visible = read(publicCatalogResponseSchema, await get('/api/catalog')).products.find(product => product.id === created.id)
    expect(visible).toMatchObject({ inStock: false })
    expect(read(productDtoSchema, await get(`/api/catalog/products/${created.id}`))).toMatchObject({ id: created.id, inStock: false })

    // Categoría: alta compacta, edición completa con nulls y borrado 204 sin cuerpo (ApiClient exige 204 sin esquema).
    const newCategory = read(categoryDtoSchema, await send('POST', '/api/catalog/categories', actors.owner, { name: 'Lácteos', icon: 'milk', slug: 'lacteos', order: 3 }), 201)
    expect(newCategory).toMatchObject({ slug: 'lacteos', order: 3 })
    const cleared = read(categoryDtoSchema, await send('PATCH', `/api/catalog/categories/${newCategory.id}`, actors.owner, { name: 'Lácteos y huevos', icon: null, slug: null, illustrationUrl: null, order: null }))
    expect(cleared).toMatchObject({ name: 'Lácteos y huevos' })
    for (const optional of ['icon', 'slug', 'illustrationUrl', 'order']) expect(cleared).not.toHaveProperty(optional)
    const inUse = await send('DELETE', `/api/catalog/categories/${category}`, actors.owner)
    expect(inUse.status).toBe(409)
    expect(apiErrorSchema.parse(inUse.body).error).toBe('CATEGORY_IN_USE')
    const removed = await send('DELETE', `/api/catalog/categories/${newCategory.id}`, actors.owner)
    expect(removed).toMatchObject({ status: 204, body: null })
  })

  it('tienda del admin: aliado, estado y horario por /api/store/staff llegan a la PWA y al comprobante', async () => {
    const staffStore = read(storeDtoSchema, await get('/api/store/staff', actors.operator))
    expect(staffStore.contactPhone).toBeNull()
    // merchantPatchFrom con WhatsApp vacío: null explícito, no un teléfono ficticio.
    const blank = read(storeDtoSchema, await send('PATCH', '/api/store/staff', actors.owner, { name: 'Leche y Miel', contactPhone: null, address: 'Calle 5 # 4-12, Dolores, Tolima' }))
    expect(blank.contactPhone).toBeNull()
    // storeStatusFrom: override y horario; la PWA ve la disponibilidad que calcula el servidor.
    const closed = read(storeDtoSchema, await send('PATCH', '/api/store/staff', actors.owner, { scheduleOverride: 'closed' }))
    expect(closed).toMatchObject({ scheduleOverride: 'closed', availability: { isOpen: false } })
    expect(read(storeDtoSchema, await get('/api/store')).availability.isOpen).toBe(false)
    read(storeDtoSchema, await send('PATCH', '/api/store/staff', actors.owner, { scheduleOverride: 'open', weeklySchedule: staffStore.weeklySchedule }))
    // WhatsApp con formato de formulario: se guarda canónico y el cliente lo ve igual en `/api/store`.
    const phoned = read(storeDtoSchema, await send('PATCH', '/api/store/staff', actors.owner, { contactPhone: '+57 310 765 4321' }))
    expect(phoned.contactPhone).toBe('573107654321')
    expect(read(storeDtoSchema, await get('/api/store')).contactPhone).toBe('573107654321')
    expect((await send('PATCH', '/api/store/staff', actors.operator, { name: 'Operador' })).status).toBe(403)
    expect((await send('PATCH', '/api/store/staff', actors.owner, { contactPhone: '12345' })).status).toBe(400)
  })

  describe('comprobante y enlaces sobre pedidos persistidos', () => {
    const waTarget = (url: string) => {
      const parsed = new URL(url)
      return { origin: parsed.origin, phone: parsed.pathname.slice(1), text: parsed.searchParams.get('text') ?? '' }
    }

    it('pedido con peso real y sustitución: estimado original, ítems vigentes y total final del servidor', async () => {
      const id = await place(actors.customer)
      await patchStatus(id, actors.operator, 1, { status: 'confirmed' })
      await patchStatus(id, actors.operator, 2, { status: 'preparing' })
      const category = await categoryId()
      const substitute = read(staffProductDtoSchema, await send('POST', '/api/catalog/products', actors.owner, {
        name: 'Leche deslactosada 1L', price: 4800, unit: '1 L', imageUrl: '/d.png', categoryId: category, is_variable_weight: false,
      }), 201)
      read(orderDtoSchema, await send('PATCH', `/api/orders/${id}`, actors.operator, { expectedVersion: 3, changes: [
        { type: 'weight', itemId: 'prod_carne', kilosReal: 1.234 },
        { type: 'substitute', itemId: 'prod_leche', productId: substitute.id, qty: 2 },
      ] }))
      await patchStatus(id, actors.operator, 4, { status: 'ready' })

      const dto = await order(actors.customer, id)
      // 2 × 4.800 + 22.000 × 1,234 kg = 9.600 + 27.148; la estimación original conserva 2 × 4.500 + 22.000.
      expect(dto).toMatchObject({ status: 'ready', estimatedTotal: 31000, finalTotal: 36748 })
      const store = read(storeDtoSchema, await get('/api/store'))

      const customer = customerReceiptFrom(dto, store)
      expect(customer.receipt).toMatchObject({ orderId: id, status: 'ready', estimatedTotal: 31000, finalTotal: 36748 })
      expect(customer.receipt.text).toContain(`Pedido ${id}`)
      expect(customer.receipt.text).toContain('Estado: Listo')
      expect(customer.receipt.text).toMatch(/Total estimado original: \$\s?31\.000/)
      expect(customer.receipt.text).toMatch(/Total final: \$\s?36\.748/)
      expect(customer.receipt.text).toMatch(/Leche entera 1L: 2 × 1 L; \$\s?4\.500 por unidad — \$\s?9\.000/)
      expect(customer.receipt.text).toMatch(/Leche deslactosada 1L: 2 × 1 L; \$\s?4\.800 por unidad; sustituye producto prod_leche — \$\s?9\.600/)
      expect(customer.receipt.text).toMatch(/Carne molida: 1 kg solicitados; 1,234 kg reales; \$\s?22\.000\/kg — \$\s?27\.148/)
      expect(customer.receipt.text).toContain('Los ítems vigentes reflejan sustituciones o retiros realizados por la tienda.')
      expect(customer.receipt.text).not.toMatch(/3001234567|573001234567|Dolores/)

      // PWA contacta a la tienda configurada; admin al cliente del pedido, con el mismo texto del comprobante.
      const toStore = waTarget(customer.contact!.url)
      expect(toStore).toMatchObject({ origin: 'https://wa.me', phone: '573107654321' })
      expect(toStore.text).toBe(`Hola, consulto por este pedido de MAUI:\n${customer.receipt.text}`)
      const staff = staffReceiptFrom(read(orderDtoSchema, await get(`/api/orders/${id}`, actors.operator)))
      expect(waTarget(staff.contact!.url)).toMatchObject({ origin: 'https://wa.me', phone: '573001234567' })
      expect(staff.receipt.text).toBe(customer.receipt.text)
      expect(staff.contact!.label).toBe('Contactar al cliente')
    })

    it('pedido cancelado con motivo y sin contacto de tienda: importes de referencia y enlace oculto', async () => {
      const id = await place(actors.other, { customerPhone: '300 987 6543' })
      const cancelled = await patchStatus(id, actors.owner, 1, { status: 'cancelled', reason: 'Cliente no responde la llamada' })
      expect(cancelled).toMatchObject({ status: 'cancelled', cancellationReason: 'Cliente no responde la llamada' })
      const receipt = customerReceiptFrom(await order(actors.other, id), { contactPhone: null })
      expect(receipt.receipt.text).toContain('Pedido cancelado. Los importes son de referencia.')
      expect(receipt.receipt.text).toContain('Motivo: Cliente no responde la llamada')
      expect(receipt.receipt.text).toContain('Total final: pendiente de confirmación de la tienda')
      expect(receipt.contact).toBeNull()
      expect(waTarget(staffReceiptFrom(await order(actors.other, id, actors.owner)).contact!.url).phone).toBe('573009876543')
    })
  })

  describe('envelope de errores que interpreta el ApiClient de las dos apps', () => {
    const foreignOrderId = async () => place(actors.customer)
    const cases: [string, () => Promise<WireResponse>, number][] = [
      ['sin sesión', () => get('/api/orders'), 401],
      ['cliente en ruta de personal', () => get('/api/audit', actors.customer), 403],
      ['operator sobre catálogo de owner', () => send('POST', '/api/catalog/categories', actors.operator, { name: 'No' }), 403],
      ['origen ajeno en mutación', () => send('PATCH', '/api/store/staff', actors.owner, { name: 'Leche y Miel' }, { origin: 'https://evil.example' }), 403],
      ['pedido de otro cliente', async () => get(`/api/orders/${await foreignOrderId()}`, actors.other), 404],
      ['ruta desconocida', () => get('/api/catalog/products/x/extra'), 404],
      ['método no permitido', () => send('PUT', '/api/audit', actors.owner), 405],
      ['validación con issues', () => send('POST', '/api/catalog/categories', actors.owner, { name: '' }), 400],
      ['versión desactualizada', async () => { const id = await foreignOrderId(); await patchStatus(id, actors.owner, 1, { status: 'confirmed' }); return send('PATCH', `/api/orders/${id}/status`, actors.owner, { status: 'preparing', expectedVersion: 1 }) }, 409],
      ['cuerpo excesivo', () => send('POST', '/api/catalog/categories', actors.owner, { name: 'x' }, { 'content-length': '10000000' }), 413],
      ['tipo de contenido', () => send('POST', '/api/catalog/categories', actors.owner, { name: 'x' }, { 'content-type': 'text/plain' }), 415],
    ]
    it.each(cases)('%s: envelope estricto, estado %i y cabeceras de no caché', async (_name, run, status) => {
      const response = await run()
      expect(response.status, JSON.stringify(response.body)).toBe(status)
      const envelope = apiErrorSchema.parse(response.body)
      expect(envelope.message.length).toBeGreaterThan(0)
      expect(response.header('Content-Type')).toMatch(/^application\/json/)
      if (status === 400) expect(envelope.issues?.length).toBeGreaterThan(0)
      if (status === 405) expect(response.header('Allow')).toBeTruthy()
      expect(JSON.stringify(response.body)).not.toMatch(/SQL|select |insert |stack|password|3001234567/i)
    })

    it('reutilizar la clave de idempotencia con otra intención es un 409 definitivo con código estable', async () => {
      const key = randomUUID()
      read(orderConfirmationSchema, await world.placeOrder(actors.customer, {}, key), 201)
      const reused = await world.placeOrder(actors.customer, { items: [{ id: 'prod_leche', qty: 3 }] }, key)
      expect(reused.status).toBe(409)
      expect(apiErrorSchema.parse(reused.body).error).toBe('IDEMPOTENCY_KEY_REUSED')
    })
  })
})
