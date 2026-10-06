import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { authSessionResponseSchema, createOrderRequestSchema, formatOrderReference, orderConfirmationSchema, orderDtoSchema,
  publicCatalogResponseSchema, type CreateOrderRequest, type OrderDto, type ProductDto } from '../../shared/contracts/index.js'
import { apiHeaders, openActor, type Actor } from '../support/actors.js'
import { readCredentials, readDestination, type Credentials, type Destination } from '../support/env.js'
import { addProduct, adminLogin, customerLogin, preparePickupCheckout, submittedOrderId } from '../support/flows.js'
import { openOwnerApi, type OwnerApi } from '../support/ownerApi.js'
import { createRuntime, saveRuntime, type RuntimeRecord } from '../support/runtime.js'

const customerPair = (): Credentials['customer'][] => {
  const pairs = [['SMOKE_ME_CUSTOMER_PHONE', 'SMOKE_ME_CUSTOMER_PASSWORD'], ['SMOKE_ME_SECOND_CUSTOMER_PHONE', 'SMOKE_ME_SECOND_CUSTOMER_PASSWORD']]
  const missing = pairs.flat().filter((key) => !process.env[key])
  if (missing.length) throw new Error(`Faltan cuentas técnicas ME en clone por auth real: ${missing.join(', ')}`)
  return pairs.map(([phone, password]) => ({ phone: process.env[phone!]!, password: process.env[password!]! }))
}

// Dos cuentas técnicas propias, distintas del smoke/humanas. API y éxitos reales; solo se controla
// un fallo de transporte PATCH. Las ocho creaciones no comparten el lock de cuota del mismo cliente.
test.describe.serial('ME pago, preparación y referencia reales @completo', () => {
  let dest: Destination, credentials: Credentials, runtime: RuntimeRecord, owner: OwnerApi
  let customer: Actor, admin: Actor, second: APIRequestContext
  let accounts: Credentials['customer'][], identities: string[]
  let fixed: ProductDto, variable: ProductDto, substitute: ProductDto
  let orderId: string, brebId: string, staffIdentity: string, body: CreateOrderRequest, reference: string
  const itemName = (order: OrderDto, id: string) => order.items.find((item) => item.id === id)!.name!
  const checklist = () => admin.page.getByRole('region', { name: 'Lista de preparación' })
  const readOrder = async (id = orderId) => {
    const response = await customer.context.request.get(`/api/orders/${id}`, { headers: apiHeaders(dest) })
    expect(response.status()).toBe(200)
    return orderDtoSchema.parse(await response.json())
  }
  const remember = (key: string, id: string) => {
    const entry = runtime.orders.find((order) => order.key === key)
    if (entry) entry.orderId = id
    else runtime.orders.push({ key, orderId: id })
    saveRuntime(runtime, 'me-created')
  }
  const patch = async (data: unknown) => {
    const response = await owner.request.patch(`/api/orders/${orderId}`, { data })
    expect(response.status()).toBe(200)
    return orderDtoSchema.parse(await response.json())
  }
  const confirm = async (title: string) => {
    await expect(admin.page.getByRole('dialog')).toHaveCount(1)
    await admin.page.getByRole('dialog', { name: title, exact: true }).getByRole('button', { name: 'Confirmar', exact: true }).click()
    await expect(admin.page.getByRole('dialog')).toHaveCount(0)
  }
  const allPicked = async () => {
    const latest = await readOrder()
    for (const item of latest.items) {
      if (item.is_variable_weight) {
        await checklist().getByLabel(`Peso real de ${item.name}`).fill('0.95')
        await checklist().getByLabel(`Peso real de ${item.name}`).press('Tab')
      } else if (!item.picked) await checklist().getByRole('checkbox', { name: item.name!, exact: true }).click()
      await expect(checklist().getByRole('checkbox', { name: item.name!, exact: true })).toBeChecked()
    }
  }

  test.beforeAll(async ({ browser, playwright }) => {
    dest = readDestination(); credentials = readCredentials(); accounts = customerPair()
    expect(new Set(accounts.map((account) => account.phone)).size, 'clientes técnicos independientes').toBe(2)
    expect(accounts.map((account) => account.phone)).not.toContain(credentials.customer.phone)
    runtime = createRuntime(dest.previewSha, dest.readyStamp)
    owner = await openOwnerApi(playwright, dest, credentials)
    customer = await openActor(browser, dest, 'cliente', runtime)
    admin = await openActor(browser, dest, 'admin', runtime)
    await customerLogin(customer.page, accounts[0]!)
    await adminLogin(admin.page, credentials.staff)
    staffIdentity = authSessionResponseSchema.parse(await (await admin.context.request.get('/api/auth/session', { headers: apiHeaders(dest) })).json()).account.id
    second = await playwright.request.newContext({ baseURL: dest.origin, extraHTTPHeaders: apiHeaders(dest) })
    const login = await second.post('/api/auth/login', { data: { method: 'phone', ...accounts[1] } })
    expect(login.status()).toBe(200)
    const secondSession = authSessionResponseSchema.parse(await login.json())
    expect(secondSession.account.role).toBe('customer')
    const firstSession = authSessionResponseSchema.parse(await (await customer.context.request.get('/api/auth/session', { headers: apiHeaders(dest) })).json())
    expect(firstSession.account.role).toBe('customer')
    identities = [firstSession.account.id, secondSession.account.id]
    expect(identities[0]).not.toBe(identities[1])
    const catalog = publicCatalogResponseSchema.parse(await (await owner.request.get('/api/catalog')).json())
    const available = catalog.products.filter((product) => product.inStock)
    expect(available.filter((product) => !product.is_variable_weight).length).toBeGreaterThanOrEqual(2)
    fixed = available.find((product) => !product.is_variable_weight)!
    substitute = available.filter((product) => !product.is_variable_weight)[1]!
    variable = available.find((product) => product.is_variable_weight)!
    expect(variable).toBeDefined()
  })

  test.afterAll(async () => {
    const logouts = await Promise.allSettled([owner?.close(), customer?.context.request.post('/api/auth/logout', { headers: apiHeaders(dest) }),
      admin?.context.request.post('/api/auth/logout', { headers: apiHeaders(dest) }), second?.post('/api/auth/logout')])
    const closures = await Promise.allSettled([customer?.context.close(), admin?.context.close(), second?.dispose()])
    if (runtime) {
      runtime.sessionsClosed = [...logouts, ...closures].every((result) => result.status === 'fulfilled' &&
        (!result.value || !('ok' in result.value) || result.value.ok()))
      if (!runtime.sessionsClosed) runtime.findings.push('No se confirmó el cierre de todas las sesiones ME')
      saveRuntime(runtime, 'me-finished')
      expect(runtime.sessionsClosed).toBe(true)
    }
  })

  test('QR accesible se conserva entre pasos y persiste con la misma referencia en PWA/admin/comprobantes', async () => {
    await addProduct(customer.page, fixed.name_display ?? fixed.name)
    await addProduct(customer.page, variable.name_display ?? variable.name, 0.75)
    await preparePickupCheckout(customer.page, accounts[0]!.phone, 'call_me')
    const group = customer.page.getByRole('group', { name: '¿Cómo quieres pagar?' })
    await expect(group.getByRole('radio', { name: /^Efectivo/ })).toBeChecked()
    await group.getByRole('radio', { name: /^Efectivo/ }).focus()
    await group.getByRole('radio', { name: /^Efectivo/ }).press('ArrowRight')
    await expect(group.getByRole('radio', { name: /^Código QR/ })).toBeChecked()
    await customer.page.getByRole('button', { name: 'Volver al paso anterior' }).click()
    await customer.page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(customer.page.getByRole('radio', { name: /^Código QR/ })).toBeChecked()
    await expect(customer.page.getByText('Pago: Código QR', { exact: true })).toBeVisible()
    await expect(customer.page.locator('body')).not.toContainText(/Pago seguro|\bpagado\b/i)
    const sent = customer.page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/orders')
    await customer.page.getByRole('button', { name: 'Pedir mi Mercado', exact: true }).click()
    orderId = await submittedOrderId(customer.page)
    const request = await sent
    expect(request.headers()['x-maui-contract'], 'opt-in de la app sin forzar headers de browser').toBe('2')
    body = createOrderRequestSchema.parse(request.postDataJSON())
    const order = await readOrder()
    expect(order.paymentMethod).toBe('qr'); expect(order.reference).toBeGreaterThan(0)
    reference = formatOrderReference(order.reference!)
    const legacy = await customer.context.request.get(`/api/orders/${orderId}`, { headers: {
      Origin: dest.authOrigin, ...(dest.bypassToken ? { 'x-vercel-protection-bypass': dest.bypassToken } : {}),
    } })
    expect(legacy.status()).toBe(200)
    const oldDto = await legacy.json()
    expect(oldDto).not.toHaveProperty('reference'); expect(oldDto).not.toHaveProperty('paymentMethod')
    expect(oldDto.items.every((item: Record<string, unknown>) => !Object.hasOwn(item, 'picked'))).toBe(true)
    await expect(customer.page.getByRole('heading', { name: reference, exact: true })).toBeVisible()
    await expect(customer.page.locator('body')).not.toContainText(orderId)
    await customer.page.getByRole('button', { name: 'Ver comprobante' }).click()
    await expect(customer.page.getByRole('region', { name: 'Comprobante del pedido' })).toContainText('Código QR')
    await expect(customer.page.getByRole('region', { name: 'Comprobante del pedido' })).toContainText(reference)
    await admin.page.goto(`/admin/pedidos/${orderId}`)
    await expect(admin.page.getByRole('heading', { name: reference, exact: true })).toBeVisible()
    await expect(admin.page.locator('body')).toContainText('Código QR')
    await expect(admin.page.locator('body')).not.toContainText(orderId)
    await admin.page.getByRole('tab', { name: 'Comprobante', exact: true }).click()
    await expect(admin.page.getByRole('region', { name: 'Comprobante del pedido' })).toContainText(reference)
    await expect(admin.page.getByRole('region', { name: 'Comprobante del pedido' })).toContainText('Código QR')
    await admin.page.getByRole('tab', { name: 'Detalle', exact: true }).click()
    await admin.page.getByRole('button', { name: 'Confirmar pedido' }).click()
    await expect(admin.page.getByRole('dialog')).toHaveCount(0)
    await admin.page.getByRole('button', { name: 'Comenzar preparación' }).click()
    await expect(admin.page.getByRole('dialog')).toHaveCount(0)
    await expect(checklist()).toBeVisible()
  })

  test('autosave, fallo visible/retry, marcas y pesos sobreviven recarga; pendientes bloquean Listo', async () => {
    const order = await readOrder(), fixedName = itemName(order, fixed.id), variableName = itemName(order, variable.id)
    await expect(admin.page.getByRole('button', { name: 'Marcar como listo' })).toBeDisabled()
    await expect(admin.page.getByRole('button', { name: /^Faltan 2:/ })).toBeVisible()
    let failed = false
    const path = `/api/orders/${orderId}`
    const matcher = (url: URL) => url.pathname === path
    admin.controlledFailures.add(`PATCH ${path} 503`)
    await admin.context.route(matcher, async (route) => {
      if (route.request().method() === 'PATCH' && !failed) { failed = true; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Fallo técnico de transporte E2E' } }) }) }
      else await route.fallback()
    })
    await checklist().getByRole('checkbox', { name: fixedName, exact: true }).click()
    await expect(checklist().getByRole('alert')).toContainText('No se guardó')
    await expect(checklist().getByRole('checkbox', { name: fixedName, exact: true })).not.toBeChecked()
    await checklist().getByRole('button', { name: 'Reintentar', exact: true }).click()
    await expect(checklist().getByRole('checkbox', { name: fixedName, exact: true })).toBeChecked()
    await admin.context.unroute(matcher)
    const weight = checklist().getByLabel(`Peso real de ${variableName}`)
    await weight.fill('0.9'); await weight.press('Tab')
    await expect(checklist().getByRole('checkbox', { name: variableName, exact: true })).toBeChecked()
    await checklist().getByRole('checkbox', { name: variableName, exact: true }).click()
    await expect(checklist().getByRole('checkbox', { name: variableName, exact: true })).not.toBeChecked()
    expect((await readOrder()).items.find((item) => item.id === variable.id)?.kilosReal).toBe(0.9)
    await weight.fill(''); await weight.press('Tab')
    await expect.poll(async () => (await readOrder()).items.find((item) => item.id === variable.id)?.kilosReal).toBeUndefined()
    await weight.fill('0.95'); await weight.press('Tab')
    await expect(checklist().getByRole('checkbox', { name: variableName, exact: true })).toBeChecked()
    await admin.page.reload()
    await expect(checklist().getByRole('status')).toContainText('2 de 2 alistados')
    await expect(checklist().getByLabel(`Peso real de ${variableName}`)).toHaveValue('0.95')
  })

  test('polling del mismo peso no borra draft ni sobrescribe silenciosamente el cambio de otro operador', async () => {
    const initial = await readOrder(), name = itemName(initial, variable.id)
    const weight = checklist().getByLabel(`Peso real de ${name}`)
    await weight.fill('1.2') // no blur: aún es un borrador local
    const polled = admin.page.waitForResponse(async (response) => response.request().method() === 'GET' &&
      new URL(response.url()).pathname === `/api/orders/${orderId}` && response.ok() &&
      orderDtoSchema.parse(await response.json()).items.some((item) => item.id === variable.id && item.kilosReal === 1.1), { timeout: 75_000 })
    await patch({ expectedVersion: initial.version, changes: [{ type: 'weight', itemId: variable.id, kilosReal: 1.1 }] })
    await polled
    await expect(weight).toHaveValue('1.2')
    await weight.press('Tab')
    await expect(checklist().getByRole('alert')).toContainText('No se guardó')
    await expect(weight).toHaveValue('1.2')
    expect((await readOrder()).items.find((item) => item.id === variable.id)?.kilosReal).toBe(1.1)
    await checklist().getByRole('button', { name: 'Reintentar', exact: true }).click()
    await expect.poll(async () => (await readOrder()).items.find((item) => item.id === variable.id)?.kilosReal).toBe(1.2)
    // Otro producto actualizado en paralelo sí se puede rebasar sin perder el peso que se escribe.
    const current = await readOrder(); await weight.fill('1.25')
    await patch({ expectedVersion: current.version, changes: [{ type: 'pick', itemId: fixed.id, picked: false }] })
    await weight.press('Tab')
    await expect.poll(async () => (await readOrder()).items.find((item) => item.id === variable.id)?.kilosReal).toBe(1.25)
    await expect(weight).toHaveValue('1.25')
  })

  test('contacto sin decisión no alista; sustituto sin marcar, Listo con una confirmación y reapertura conserva audit', async () => {
    const order = await readOrder()
    await admin.page.getByRole('button', { name: `Falta ${itemName(order, fixed.id)}`, exact: true }).click()
    const missing = admin.page.getByRole('dialog', { name: 'Producto faltante' })
    await missing.getByRole('checkbox', { name: /Hablé con el cliente/ }).check()
    await missing.getByRole('button', { name: 'Aplicar cambio' }).click()
    await expect(missing.getByRole('alert')).toContainText('Elige el producto sustituto')
    expect((await readOrder()).items.find((item) => item.id === fixed.id)?.picked).not.toBe(true)
    await missing.getByLabel('Producto sustituto').selectOption(substitute.id)
    await missing.getByRole('button', { name: 'Aplicar cambio' }).click()
    await expect(missing).toHaveCount(0)
    const changed = await readOrder(), substituteName = itemName(changed, substitute.id)
    expect(changed.items.find((item) => item.id === substitute.id)?.picked).not.toBe(true)
    await expect(checklist().getByRole('list', { name: 'Productos sustituidos o retirados' })).toContainText('Sustituido por')
    await expect(admin.page.getByRole('button', { name: 'Marcar como listo' })).toBeDisabled()
    await allPicked()
    await admin.page.getByRole('button', { name: `Falta ${substituteName}`, exact: true }).click()
    await missing.getByRole('radio', { name: 'Quitar del pedido' }).click()
    await missing.getByRole('checkbox', { name: /Hablé con el cliente/ }).check()
    // Todas las filas estaban alistadas: el bloqueo siguiente debe venir del cambio estructural
    // pendiente. La petición se retiene y luego continúa hasta la API real sin simular su respuesta.
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const matcher = (url: URL) => url.pathname === `/api/orders/${orderId}`
    await admin.context.route(matcher, async (route) => {
      if (route.request().method() === 'PATCH') {
        expect(route.request().headers()['x-maui-contract']).toBe('2')
        await pending
      }
      await route.fallback()
    })
    try {
      await missing.getByRole('button', { name: 'Aplicar cambio' }).click()
      await expect(missing.getByRole('button', { name: /Guardando|Aplicar cambio/ })).toBeDisabled()
      await expect(admin.page.getByRole('group', { name: 'Acciones del pedido' }).getByRole('button', { name: /^(Marcar como listo|Guardando…)$/ })).toBeDisabled()
    } finally { release() }
    await expect(missing).toHaveCount(0)
    await admin.context.unroute(matcher)
    await expect(checklist().getByRole('status')).toContainText('1 de 1 alistados')
    const before = await readOrder()
    await admin.page.getByRole('button', { name: 'Marcar como listo' }).click(); await confirm('Marcar pedido como listo')
    await expect(admin.page.getByRole('button', { name: 'Cliente recogió' })).toBeVisible()
    await expect(admin.page.getByRole('button', { name: 'Salió a domicilio' })).toHaveCount(0)
    const ready = await readOrder(), auditBefore = await owner.orderAudit(orderId)
    const denied = await customer.context.request.patch(`/api/orders/${orderId}/status`, { headers: apiHeaders(dest), data: { status: 'preparing', expectedVersion: ready.version } })
    expect(denied.status()).toBe(403)
    const stale = await owner.request.patch(`/api/orders/${orderId}/status`, { data: { status: 'preparing', expectedVersion: before.version } })
    expect(stale.status()).toBe(409)
    await admin.page.getByRole('button', { name: 'Reabrir preparación' }).click()
    await expect(checklist()).toBeVisible()
    const reopened = await readOrder(), events = await owner.orderAudit(orderId)
    expect(reopened.items).toEqual(ready.items); expect(reopened.originalItems).toEqual(ready.originalItems)
    expect(reopened.reference).toBe(ready.reference)
    expect(events.map((event) => event.id)).toEqual(expect.arrayContaining(auditBefore.map((event) => event.id)))
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ actorKind: 'account', actorId: staffIdentity,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), metadata: expect.objectContaining({ previousStatus: 'ready', status: 'preparing' }) })]))
    await admin.page.getByRole('button', { name: 'Marcar como listo' }).click(); await confirm('Marcar pedido como listo')
    await admin.page.getByRole('button', { name: 'Cliente recogió' }).click(); await confirm('Confirmar recogida')
    await expect(admin.page.getByRole('button', { name: 'Reabrir preparación' })).toHaveCount(0)
    const delivered = await readOrder()
    const forbidden = await owner.request.patch(`/api/orders/${orderId}/status`, { data: { status: 'preparing', expectedVersion: delivered.version } })
    // Pedido terminal con la versión actual: el servidor lo rechaza por validación (400); 409 es solo versión/estado vencidos.
    expect(forbidden.status()).toBe(400)
  })

  test('ocho POST concurrentes de dos clientes: números únicos por tienda, retry estable y acceso cruzado denegado', async () => {
    const clients = [customer.context.request, second]
    const entries = Array.from({ length: 8 }, (_, index) => ({ client: index % 2, key: `me-counter.${randomUUID()}` }))
    runtime.orders.push(...entries.map(({ key }) => ({ key }))); saveRuntime(runtime, 'me-contention-before-post')
    const results = await Promise.all(entries.map(async (entry) => {
      const payload = { ...body, userId: identities[entry.client], customerPhone: accounts[entry.client]!.phone, paymentMethod: 'bre_b' }
      const response = await clients[entry.client]!.post('/api/orders', { headers: { ...apiHeaders(dest), 'Idempotency-Key': entry.key }, data: payload })
      expect(response.status()).toBe(201)
      const confirmation = orderConfirmationSchema.parse(await response.json()); remember(entry.key, confirmation.orderId)
      return { ...entry, payload, confirmation }
    }))
    expect(new Set(results.map((entry) => entry.confirmation.orderId)).size).toBe(8)
    expect(new Set(results.map((entry) => entry.confirmation.reference)).size).toBe(8)
    expect(results.every((entry) => Number.isInteger(entry.confirmation.reference))).toBe(true)
    for (const entry of results) {
      const retry = await clients[entry.client]!.post('/api/orders', { headers: { ...apiHeaders(dest), 'Idempotency-Key': entry.key }, data: entry.payload })
      expect(retry.status()).toBe(200)
      expect(orderConfirmationSchema.parse(await retry.json())).toEqual(entry.confirmation)
      const other = clients[1 - entry.client]!
      expect([403, 404]).toContain((await other.get(`/api/orders/${entry.confirmation.orderId}`, { headers: apiHeaders(dest) })).status())
      expect([400, 403, 404]).toContain((await other.get(`/api/orders/${entry.confirmation.reference}`, { headers: apiHeaders(dest) })).status())
    }
    // Bre-B viene de la API real, y el enlace de contacto mantiene la referencia comercial visible.
    for (const entry of results.slice(0, 2)) {
      const response = await clients[entry.client]!.get(`/api/orders/${entry.confirmation.orderId}`, { headers: apiHeaders(dest) })
      const created = orderDtoSchema.parse(await response.json())
      expect(created.paymentMethod).toBe('bre_b')
      const contact = new URL((await admin.page.locator('a[href^="https://wa.me/"]').first().getAttribute('href'))!)
      expect(contact.searchParams.get('text')).toContain(reference)
    }
  })

  test('Bre-B elegido en browser sobrevive al error de envío y se ve en ambos comprobantes reales', async () => {
    await addProduct(customer.page, fixed.name_display ?? fixed.name)
    await preparePickupCheckout(customer.page, accounts[0]!.phone)
    await customer.page.getByRole('radio', { name: /^Transferencia Bre-B/ }).click()
    let failed = false
    const matcher = (url: URL) => url.pathname === '/api/orders'
    customer.controlledFailures.add('POST /api/orders 503')
    await customer.context.route(matcher, async (route) => {
      if (route.request().method() === 'POST' && !failed) { failed = true; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Fallo técnico de transporte E2E' } }) }) }
      else await route.fallback()
    })
    await customer.page.getByRole('button', { name: 'Pedir mi Mercado', exact: true }).click()
    await expect(customer.page.getByRole('alert')).toBeVisible()
    await expect(customer.page.getByRole('radio', { name: /^Transferencia Bre-B/ })).toBeChecked()
    await customer.context.unroute(matcher)
    await customer.page.getByRole('button', { name: 'Pedir mi Mercado', exact: true }).click()
    const id = await submittedOrderId(customer.page), order = await readOrder(id)
    brebId = id
    expect(order.paymentMethod).toBe('bre_b')
    await customer.page.getByRole('button', { name: 'Ver comprobante' }).click()
    await expect(customer.page.getByRole('region', { name: 'Comprobante del pedido' })).toContainText('Transferencia Bre-B')
    await admin.page.goto(`/admin/pedidos/${id}`)
    await expect(admin.page.locator('body')).toContainText(formatOrderReference(order.reference!))
    await admin.page.getByRole('tab', { name: 'Comprobante', exact: true }).click()
    await expect(admin.page.getByRole('region', { name: 'Comprobante del pedido' })).toContainText('Transferencia Bre-B')
    expect([...customer.issues, ...admin.issues]).toEqual([])
  })

  test('domicilio usa Salió a domicilio; En camino no cancela/reabre y entregar confirma una sola vez', async () => {
    const key = `me-delivery.${randomUUID()}`
    runtime.orders.push({ key }); saveRuntime(runtime, 'me-delivery-before-post')
    const payload = { ...body, deliveryType: 'delivery', deliveryData: { address: 'Entrega técnica E2E en copia aislada', lat: 4.711, lng: -74.072 },
      items: body.items.filter((item) => item.id === fixed.id), paymentMethod: 'cash' }
    const response = await customer.context.request.post('/api/orders', { headers: { ...apiHeaders(dest), 'Idempotency-Key': key }, data: payload })
    expect(response.status()).toBe(201)
    const created = orderConfirmationSchema.parse(await response.json()); remember(key, created.orderId)
    await admin.page.goto(`/admin/pedidos/${created.orderId}`)
    await admin.page.getByRole('button', { name: 'Confirmar pedido' }).click()
    await admin.page.getByRole('button', { name: 'Comenzar preparación' }).click()
    const order = await readOrder(created.orderId)
    await checklist().getByRole('checkbox', { name: order.items[0]!.name!, exact: true }).click()
    await expect(admin.page.getByRole('button', { name: 'Marcar como listo' })).toBeEnabled()
    await admin.page.getByRole('button', { name: 'Marcar como listo' }).click(); await confirm('Marcar pedido como listo')
    await expect(admin.page.getByRole('button', { name: 'Salió a domicilio' })).toBeVisible()
    await expect(admin.page.getByRole('button', { name: 'Cliente recogió' })).toHaveCount(0)
    await admin.page.getByRole('button', { name: 'Salió a domicilio' }).click()
    await expect(admin.page.getByRole('dialog')).toHaveCount(0)
    await expect(admin.page.getByRole('button', { name: 'Cancelar pedido', exact: true })).toHaveCount(0)
    await expect(admin.page.getByRole('button', { name: 'Reabrir preparación' })).toHaveCount(0)
    const onWay = await readOrder(created.orderId)
    expect(onWay.status).toBe('in_delivery')
    const denied = await owner.request.patch(`/api/orders/${created.orderId}/status`, { data: { status: 'preparing', expectedVersion: onWay.version } })
    expect([400, 409]).toContain(denied.status())
    await admin.page.getByRole('button', { name: 'Confirmar entrega' }).click(); await confirm('Confirmar entrega')
    await expect(admin.page.getByRole('group', { name: 'Acciones del pedido' })).toHaveCount(0)
    await expect(admin.page.getByRole('button', { name: 'Reabrir preparación' })).toHaveCount(0)
    expect((await readOrder(created.orderId)).status).toBe('delivered')
    expect(brebId, 'pedido Bre-B propio para la negativa Cancelado').toBeDefined()
    const cancelledOrder = await readOrder(brebId)
    const cancelled = await owner.request.patch(`/api/orders/${cancelledOrder.orderId}/status`, { data: { status: 'cancelled', expectedVersion: cancelledOrder.version, reason: 'Cierre de pedido propio de la prueba técnica' } })
    expect(cancelled.status()).toBe(200)
    const cancelledDto = orderDtoSchema.parse(await cancelled.json())
    expect([400, 409]).toContain((await owner.request.patch(`/api/orders/${cancelledDto.orderId}/status`, { data: { status: 'preparing', expectedVersion: cancelledDto.version } })).status())
    await admin.page.goto(`/admin/pedidos/${cancelledDto.orderId}`)
    await expect(admin.page.getByRole('button', { name: 'Reabrir preparación' })).toHaveCount(0)
    await expect(admin.page.getByRole('region', { name: 'Comprobante del pedido' })).toBeVisible()
  })
})
