import { expect, test, type Locator, type Page, type Response, type Route } from '@playwright/test'
import {
  WEEKDAY_KEYS, authSessionResponseSchema, orderConfirmationSchema, orderDtoSchema, orderListResponseSchema,
  publicCatalogResponseSchema, type CreateOrderRequest, type ProductDto, type TimeSlotConfigDto, type WeeklyScheduleDto,
} from '../../shared/contracts/index.js'
import { apiHeaders, getWithRetry, openActor, type Actor } from '../support/actors.js'
import { readCredentials, readDestination, type Credentials, type Destination } from '../support/env.js'
import { TechnicalFixtures } from '../support/fixtures.js'
import {
  addProduct, adminLogin, adminOpenOrderFromList, customerLogin,
  digitsOf, expectAmount, preparePickupCheckout, submittedOrderId,
} from '../support/flows.js'
import { checkHealth, openOwnerApi, type OwnerApi } from '../support/ownerApi.js'
import { redact } from '../support/redact.js'
import { createRuntime, saveRuntime, type RuntimeRecord } from '../support/runtime.js'

const ORDERS = '**/api/orders'
const INTENT_STORAGE_KEY = 'maui-checkout-intent-v1'
const displayName = (product: ProductDto): string => product.name_display ?? product.name
const isOrderPost = (response: Response): boolean => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/orders'
/** Varias alertas pueden coexistir (reglas de tienda + error de envío): se elige la del mensaje esperado. */
const alertWith = (page: Page, text: RegExp): Locator => page.getByRole('alert').filter({ hasText: text }).first()

// Las respuestas de éxito siempre vienen de API/Postgres. Solo se introducen fallos de transporte
// explícitos (429/503/timeout); el timeout envía primero el POST real, que persiste el pedido.
// Cada prueba parte de canasta vacía y sesiones vigentes: un fallo no oculta las demás (Playwright
// reinicia el worker y vuelve a ejecutar beforeAll/afterAll, que restauran los fixtures).
test.describe('resiliencia y reglas reales @completo', () => {
  let dest: Destination
  let credentials: Credentials
  let customer: Actor
  let admin: Actor
  let owner: OwnerApi
  let runtime: RuntimeRecord
  let fixtures: TechnicalFixtures
  let fixed: ProductDto
  let substitute: ProductDto
  let latestOrderId: string

  const readOrder = async (id: string) => {
    const response = await getWithRetry(customer.context.request, `/api/orders/${encodeURIComponent(id)}`, apiHeaders(dest))
    expect(response.status(), 'GET del pedido propio').toBe(200)
    return orderDtoSchema.parse(await response.json())
  }
  const ownIds = async (): Promise<string[]> => {
    const response = await getWithRetry(customer.context.request, '/api/orders?limit=100', apiHeaders(dest))
    expect(response.status()).toBe(200)
    const result = orderListResponseSchema.parse(await response.json())
    expect(result.nextCursor, 'el seed acotado debe caber en esta página').toBeNull()
    return result.items.map((order) => order.orderId)
  }
  const sessionOk = async (actor: Actor) =>
    (await getWithRetry(actor.context.request, '/api/auth/session', apiHeaders(dest))).ok()
  const checkout = async (preference: 'similar' | 'call_me' | 'remove' = 'similar') => {
    await addProduct(customer.page, displayName(fixed))
    await preparePickupCheckout(customer.page, credentials.customer.phone, preference)
  }
  const remember = (key: string, orderId: string) => {
    const record = runtime.orders.find((order) => order.key === key)
    if (record) record.orderId = orderId
    else runtime.orders.push({ key, orderId })
    saveRuntime(runtime, 'created')
  }
  /** El ID ya se asocia a su clave desde la respuesta del POST; esto solo comprueba que quedó registrado. */
  const rememberPending = (orderId: string) =>
    expect.poll(() => runtime.orders.some((order) => order.orderId === orderId), { message: 'pedido registrado en el runtime con su clave', timeout: 10_000 }).toBe(true)
  const submitButton = () => customer.page.getByRole('button', { name: 'Pedir mi Mercado', exact: true })
  const submit = async () => {
    await submitButton().click()
    latestOrderId = await submittedOrderId(customer.page)
    await rememberPending(latestOrderId)
    return latestOrderId
  }
  const cancelOnCurrentPage = async (reason: string) => {
    await admin.page.getByRole('button', { name: 'Cancelar pedido', exact: true }).click()
    await admin.page.getByLabel('Motivo de cancelación').fill(reason)
    await admin.page.getByRole('button', { name: 'Confirmar cancelación' }).click()
    await expect(admin.page.getByText('Pedido cancelado').first()).toBeVisible()
  }
  const cancel = async (id: string) => {
    await adminOpenOrderFromList(admin.page, id)
    await cancelOnCurrentPage('Cancelación técnica de escenario E2E')
    expect((await readOrder(id)).status).toBe('cancelled')
  }
  const cartHasProduct = async () => {
    await customer.page.goto('/cart')
    await expect(customer.page.getByText(displayName(fixed), { exact: true }).first()).toBeVisible()
  }
  const expectNoNewOrders = async (before: string[]) => expect(await ownIds(), 'ningún pedido nuevo').toEqual(before)

  test.beforeAll(async ({ browser, playwright }) => {
    dest = readDestination()
    credentials = readCredentials()
    expect(await checkHealth(playwright, dest)).toMatchObject({ environment: 'test', database: 'connected' })
    runtime = createRuntime(dest.previewSha, dest.readyStamp)
    owner = await openOwnerApi(playwright, dest, credentials)
    fixtures = new TechnicalFixtures(owner, runtime)
    await fixtures.restore() // cambios técnicos que una corrida interrumpida dejó sin devolver
    await owner.restoreInterruptedOverride(runtime)
    customer = await openActor(browser, dest, 'cliente', runtime)
    admin = await openActor(browser, dest, 'admin', runtime)
    await customerLogin(customer.page, credentials.customer)
    await adminLogin(admin.page, credentials.staff)
    const catalog = await owner.request.get('/api/catalog')
    expect(catalog.status()).toBe(200)
    const fixedProducts = publicCatalogResponseSchema.parse(await catalog.json()).products
      .filter((product) => product.inStock && !product.is_variable_weight)
    expect(fixedProducts.length, 'el seed debe tener al menos dos productos de peso fijo disponibles').toBeGreaterThanOrEqual(2)
    fixed = fixedProducts[0]!
    substitute = fixedProducts[1]!
    saveRuntime(runtime, 'completo-started')
  })

  test.beforeEach(async () => {
    if (!(await sessionOk(customer))) await customerLogin(customer.page, credentials.customer)
    if (!(await sessionOk(admin))) await adminLogin(admin.page, credentials.staff)
    await customer.page.goto('/')
    await customer.page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  })

  test.afterAll(async () => {
    if (!runtime) return
    // Todo se intenta aunque un paso falle: fixtures, override de tienda, sesiones y contextos.
    const cleanup = await Promise.allSettled([
      (async () => { await fixtures?.restore(); await owner?.close() })(),
      customer?.context.request.post('/api/auth/logout', { headers: apiHeaders(dest) }),
      admin?.context.request.post('/api/auth/logout', { headers: apiHeaders(dest) }),
    ])
    runtime.sessionsClosed = cleanup.every((result) => result.status === 'fulfilled')
    saveRuntime(runtime, cleanup.some((result) => result.status === 'rejected') ? 'cleanup-failed' : 'finished')
    await Promise.allSettled([customer?.context.close(), admin?.context.close()])
    for (const result of cleanup) if (result.status === 'rejected') throw result.reason
  })

  test('sesiones aisladas, permisos cruzados, cabeceras de caché y X-Request-ID', async ({ playwright }) => {
    const customerSession = authSessionResponseSchema.parse(await (await customer.context.request.get('/api/auth/session', { headers: apiHeaders(dest) })).json())
    expect(customerSession.account.role).toBe('customer')
    for (const path of ['/api/catalog/staff', '/api/store/staff', '/api/audit']) {
      const response = await customer.context.request.get(path, { headers: apiHeaders(dest) })
      expect(response.status(), `cliente no puede leer ${path}`).toBe(403)
    }
    const listed = await owner.request.get('/api/orders?limit=100')
    expect(listed.status()).toBe(200)
    const foreign = orderListResponseSchema.parse(await listed.json()).items.find((order) => order.userId !== customerSession.account.id)
    expect(foreign, 'el seed incluye pedido de otro cliente para verificar aislamiento').toBeDefined()
    const denied = await customer.context.request.get(`/api/orders/${foreign!.orderId}`, { headers: apiHeaders(dest) })
    expect([403, 404], 'ID ajeno no expone el pedido').toContain(denied.status())
    expect(await denied.text()).not.toContain('"items"')
    await customer.page.goto(`/pedidos/${foreign!.orderId}`)
    await expect(customer.page.getByRole('region', { name: 'Resumen del pedido' })).toHaveCount(0)
    await customer.page.goto('/admin/pedidos')
    await expect(customer.page).toHaveURL(/\/admin\/login/)
    await customer.page.goto('/perfil')
    await expect(customer.page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()

    // Operator: ve pedidos pero no administra tienda ni catálogo (el cuerpo inválido evita mutar si la guarda fallara).
    if (credentials.operator) {
      const operator = await playwright.request.newContext({ baseURL: dest.origin, extraHTTPHeaders: apiHeaders(dest) })
      try {
        const login = await operator.post('/api/auth/login', { data: { method: 'email', ...credentials.operator } })
        expect(login.status(), 'login del operator').toBe(200)
        expect(authSessionResponseSchema.parse(await login.json()).account.role).toBe('operator')
        expect((await operator.get('/api/orders?limit=1')).status()).toBe(200)
        expect((await operator.patch('/api/store/staff', { data: { name: '' } })).status(), 'operator no edita la tienda').toBe(403)
        expect((await operator.patch(`/api/catalog/products/${encodeURIComponent(fixed.id)}`, { data: { price: -1 } })).status(), 'operator no edita el catálogo').toBe(403)
      } finally {
        await operator.post('/api/auth/logout').catch(() => undefined)
        await operator.dispose()
      }
    } else {
      runtime.findings.push('SMOKE_OPERATOR_* ausente: permisos del operator no verificados')
    }

    // T-20/T-21: catálogo público revalidable por origen, datos privados sin almacenar y correlación por request.
    const publicResponse = await customer.context.request.get('/api/catalog', { headers: apiHeaders(dest) })
    expect(publicResponse.headers()['cache-control'], 'catálogo público').toMatch(/no-cache/)
    expect(publicResponse.headers()['vary'], 'catálogo público varía por origen').toMatch(/origin/i)
    const privateResponses = [
      await customer.context.request.get('/api/auth/session', { headers: apiHeaders(dest) }),
      await customer.context.request.get('/api/orders?limit=1', { headers: apiHeaders(dest) }),
      await owner.request.get('/api/store/staff'),
      await owner.request.get('/api/catalog/staff'),
    ]
    for (const response of privateResponses) {
      expect(response.headers()['cache-control'], `${new URL(response.url()).pathname} privado`).toMatch(/no-store/)
    }
    for (const response of [publicResponse, ...privateResponses]) {
      expect(response.headers()['x-request-id'], `${new URL(response.url()).pathname} con X-Request-ID`).toBeTruthy()
    }
  })

  test('pedido entregado del smoke persiste en una sesión nueva de cliente', async ({ browser }) => {
    const delivered = runtime.orders.find((order) => order.orderId)
    expect(delivered, 'full ejecuta primero el smoke y conserva sus IDs').toBeDefined()
    const order = await readOrder(delivered!.orderId!)
    expect(order.status).toBe('delivered')
    expect(order.finalTotal).toBeDefined()
    const fresh = await openActor(browser, dest, 'cliente', runtime)
    try {
      await customerLogin(fresh.page, credentials.customer)
      await fresh.page.goto(`/pedidos/${order.orderId}`)
      const summary = fresh.page.getByRole('region', { name: 'Resumen del pedido' })
      await expectAmount(summary.getByText(/Total final/), order.finalTotal!, 'total final persistente en sesión nueva')
      await fresh.page.goto('/pedidos')
      await expect(fresh.page.locator(`a[href="/pedidos/${order.orderId}"]`)).toBeVisible()
      expect(fresh.issues).toEqual([])
    } finally {
      await fresh.context.request.post('/api/auth/logout', { headers: apiHeaders(dest) }).catch(() => undefined)
      await fresh.context.close()
    }
  })

  test('precio manipulado y doble clic: un solo pedido con precio autoritativo', async () => {
    const before = await ownIds()
    await checkout()
    const keys: string[] = []
    let sentRequest: CreateOrderRequest | undefined
    const handler = async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      keys.push(route.request().headers()['idempotency-key'] ?? '')
      sentRequest = route.request().postDataJSON() as CreateOrderRequest
      // Se altera solo lo que viaja: precio, nombre y envío; la API real debe ignorarlos.
      const changed = { ...sentRequest, shippingCost: 1, items: sentRequest.items.map((item) => ({ ...item, priceAtMoment: 1, name: 'Precio manipulado E2E' })) }
      return route.fallback({ postData: JSON.stringify(changed) })
    }
    await customer.context.route(ORDERS, handler)
    try {
      await submitButton().dblclick()
      latestOrderId = await submittedOrderId(customer.page)
      await rememberPending(latestOrderId)
      expect(new Set(keys).size, 'todos los envíos comparten la clave de idempotencia').toBe(1)
      if (keys.length > 1) runtime.findings.push(`Doble clic emitió ${keys.length} POST con la misma clave (la API los deduplicó)`)
      expect((await ownIds()).filter((id) => !before.includes(id))).toEqual([latestOrderId])
      const order = await readOrder(latestOrderId)
      expect(order.items[0]!.priceAtMoment, 'precio autoritativo del catálogo').toBe(fixed.price)
      expect(order.items[0]!.name).toBe(fixed.name)
      expect(order.estimatedTotal).toBe(fixed.price)
      expect(order.shippingCost ?? 0).toBe(0)
      const forbidden = await admin.context.request.post('/api/orders', {
        headers: { ...apiHeaders(dest), 'Idempotency-Key': `maui-staff-${crypto.randomUUID()}` }, data: sentRequest,
      })
      expect(forbidden.status(), 'personal no crea pedidos como cliente').toBe(403)
    } finally { await customer.context.unroute(ORDERS, handler) }
    await cancel(latestOrderId)
  })

  /** Envía el pedido real y devuelve la confirmación validada del POST (el aviso viaja en ella y en el detalle). */
  const submitAndConfirm = async () => {
    const response = customer.page.waitForResponse(isOrderPost)
    await submit()
    const created = await response
    expect(created.status(), 'la API registra el pedido fuera de atención').toBe(201)
    return orderConfirmationSchema.parse(await created.json())
  }
  const noticeBanner = () => customer.page.getByRole('status').filter({ hasText: '¡Recibimos tu pedido!' })

  test('tienda cerrada por override: se elige la modalidad, se registra el pedido y el aviso no inventa hora', async () => {
    const before = await ownIds()
    await fixtures.store({ scheduleOverride: 'closed' })
    try {
      // Entrega, Pago y envío funcionan con la tienda cerrada; no aparece ningún aviso antes de persistir.
      await checkout()
      await expect(customer.page.getByRole('alert')).toHaveCount(0)
      await expect(noticeBanner()).toHaveCount(0)
      const confirmation = await submitAndConfirm()
      expect(confirmation.processingNotice).toEqual({ kind: 'unscheduled', reason: 'override_closed' })
      expect(confirmation.timeSlotDate, 'cierre manual: no hay fecha de reapertura, no se inventa fecha de franja').toBeUndefined()
      expect((await ownIds()).filter((id) => !before.includes(id))).toEqual([latestOrderId])
      await expect(noticeBanner()).toContainText('Lo procesaremos cuando retomemos la atención.')
      await expect(noticeBanner()).not.toContainText(/entreg|recog|\d:\d\d/i)
      expect((await readOrder(latestOrderId)).processingNotice).toEqual(confirmation.processingNotice)
    } finally { await fixtures.restore() }
    await cancel(latestOrderId)
  })

  test('día sin atención: el procesamiento se programa para la próxima apertura en America/Bogota', async () => {
    const before = await ownIds()
    const { localDate, weekday } = (await owner.readStaffStore()).availability
    const tomorrow = WEEKDAY_KEYS[(WEEKDAY_KEYS.indexOf(weekday) + 1) % WEEKDAY_KEYS.length]!
    const tomorrowDate = new Date(`${localDate}T12:00:00Z`)
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
    const startsAt = new Date(`${tomorrowDate.toISOString().slice(0, 10)}T08:00:00-05:00`).toISOString()
    // Hoy sin atención y mañana abre a las 08:00; el resto de la semana también cerrado.
    const weeklySchedule = Object.fromEntries(WEEKDAY_KEYS.map((day) => [day, { open: '08:00', close: '18:00', closed: day !== tomorrow }])) as WeeklyScheduleDto
    await fixtures.store({ scheduleOverride: 'auto', weeklySchedule })
    try {
      await checkout()
      expect(await owner.readStaffStore()).toMatchObject({ availability: { isOpen: false, closedReason: 'day_closed' } })
      const confirmation = await submitAndConfirm()
      expect(confirmation.processingNotice).toEqual({ kind: 'scheduled', reason: 'day_closed', startsAt })
      // Mañana abre 08:00–18:00: la franja elegida cae ese día; la fecha la fijó el servidor, no el cliente.
      expect(confirmation.timeSlotDate).toBe(tomorrowDate.toISOString().slice(0, 10))
      expect((await readOrder(latestOrderId)).timeSlotDate).toBe(confirmation.timeSlotDate)
      await expect(noticeBanner()).toContainText('Comenzaremos a procesarlo el')
      await expect(noticeBanner()).toContainText('a las 8:00 a. m.')
      await expect(noticeBanner()).not.toContainText(/entreg|recog/i)
      expect((await readOrder(latestOrderId)).processingNotice).toEqual({ kind: 'scheduled', reason: 'day_closed', startsAt })
      expect((await ownIds()).filter((id) => !before.includes(id))).toEqual([latestOrderId])
    } finally { await fixtures.restore() }
    await cancel(latestOrderId)
  })

  test('atendiendo con la única franja habilitada vencida hoy: se ofrece la fecha siguiente y el pedido se recibe sin aviso', async () => {
    const before = await ownIds()
    // Abierta todo el día (00:00–23:59) y una sola franja 00:00–00:01: hoy ya venció, la de mañana sirve.
    const open = { open: '00:00', close: '23:59', closed: false }
    const weeklySchedule: WeeklyScheduleDto = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: open }
    const timeSlots: TimeSlotConfigDto[] = [
      { id: 'morning', enabled: true, start: '00:00', end: '00:01' },
      { id: 'afternoon', enabled: false, start: '12:00', end: '17:00' },
      { id: 'asap', enabled: false },
    ]
    await fixtures.store({ scheduleOverride: 'auto', weeklySchedule, timeSlots })
    try {
      const { localDate, isOpen, availableTimeSlots, timeSlotsDate } = (await owner.readStaffStore()).availability
      expect(isOpen, 'abierta todo el día (la prueba no cruza la medianoche de Bogotá)').toBe(true)
      expect(availableTimeSlots, 'la única franja habilitada ya venció hoy pero hay una para la próxima fecha').toEqual(['morning'])
      expect(timeSlotsDate).not.toBe(localDate)
      await checkout() // llega a Pago: Entrega ofrece la franja con su fecha, sin bloquear
      const confirmation = await submitAndConfirm()
      expect(confirmation.processingNotice, 'la tienda atendía: sin aviso de procesamiento diferido').toBeUndefined()
      expect(confirmation.timeSlotDate, 'la fecha de la franja es la ofrecida en Entrega y queda en el pedido').toBe(timeSlotsDate)
      expect((await readOrder(latestOrderId)).timeSlotDate).toBe(timeSlotsDate)
      await expect(noticeBanner()).toHaveCount(0)
      expect((await ownIds()).filter((id) => !before.includes(id))).toEqual([latestOrderId])
      expect((await readOrder(latestOrderId)).deliveryData.timeSlot).toBe('morning')
    } finally { await fixtures.restore() }
    await cancel(latestOrderId)
  })

  test('agotado por admin: el servidor rechaza, la PWA lo muestra y la canasta sigue', async () => {
    const before = await ownIds()
    await checkout()
    await fixtures.product(fixed.id, { inStock: false })
    try {
      const response = customer.page.waitForResponse(isOrderPost)
      await submitButton().click()
      const rejected = await response
      expect(rejected.status()).toBe(400)
      expect(JSON.stringify(await rejected.json())).toContain('Producto no disponible')
      await expect(alertWith(customer.page, /disponible/i)).toBeVisible()
      await expectNoNewOrders(before)
      await customer.page.goto(`/search?q=${encodeURIComponent(displayName(fixed))}`)
      await expect(customer.page.getByRole('article', { name: displayName(fixed), exact: true })).toContainText(/agotado|sin stock/i)
      await cartHasProduct()
    } finally { await fixtures.restore() }
    await preparePickupCheckout(customer.page, credentials.customer.phone, 'similar')
    await submit()
    await cancel(latestOrderId)
  })

  test('timeout después de persistir: la clave sobrevive a la recarga y no duplica', async () => {
    const before = await ownIds()
    await checkout()
    let persistedId = ''
    let persistedStatus = 0
    let firstKey = ''
    let intercepted = false
    const handler = async (route: Route) => {
      if (route.request().method() !== 'POST' || intercepted) return route.fallback()
      intercepted = true
      firstKey = route.request().headers()['idempotency-key'] ?? ''
      const response = await route.fetch({ headers: { ...route.request().headers(), ...apiHeaders(dest) } })
      persistedStatus = response.status()
      if (persistedStatus === 201) persistedId = orderConfirmationSchema.parse(await response.json()).orderId
      // DEFAULT_TIMEOUT_MS = 15 s: retener 17 s fuerza el timeout del cliente DESPUÉS del commit.
      await new Promise((resolve) => setTimeout(resolve, 17_000))
      await route.abort('timedout').catch(() => undefined)
    }
    await customer.context.route(ORDERS, handler)
    try {
      await submitButton().click()
      await expect(alertWith(customer.page, /conexión|no se duplicará/i)).toBeVisible({ timeout: 25_000 })
      expect(persistedStatus, 'el servidor sí persistió el pedido').toBe(201)
      remember(firstKey, persistedId)
      expect((await ownIds()).filter((id) => !before.includes(id))).toEqual([persistedId])
      // La intención pendiente no guarda datos personales; si usa huella, es un SHA-256.
      const stored = await customer.page.evaluate((key) => localStorage.getItem(key), INTENT_STORAGE_KEY)
      if (stored) {
        for (const pii of [credentials.customer.phone.replace(/\D/g, '').slice(-10), 'address', 'lat']) expect(stored).not.toContain(pii)
        const fingerprint = (JSON.parse(stored) as { fingerprint?: string }).fingerprint
        if (fingerprint) expect(fingerprint).toMatch(/^(sha256:)?[a-f0-9]{64}$/)
      }
      await customer.page.reload()
    } finally { await customer.context.unroute(ORDERS, handler) }
    await cartHasProduct()
    await preparePickupCheckout(customer.page, credentials.customer.phone, 'similar')
    const retried = customer.page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/orders')
    await submit()
    expect((await retried).headers()['idempotency-key'], 'el reintento reutiliza la clave').toBe(firstKey)
    expect(latestOrderId).toBe(persistedId)
    expect((await ownIds()).filter((id) => !before.includes(id))).toEqual([persistedId])
    await cancel(latestOrderId)
  })

  for (const status of [429, 503]) {
    test(`fallo controlado ${status}: conserva la canasta y el reintento crea un solo pedido real`, async () => {
      const before = await ownIds()
      await checkout()
      let faults = 0
      const failure = `POST /api/orders ${status}`
      customer.controlledFailures.add(failure)
      const handler = async (route: Route) => {
        if (route.request().method() !== 'POST') return route.fallback()
        faults += 1
        await route.fulfill({
          status, contentType: 'application/json', headers: { 'Retry-After': '1', 'Cache-Control': 'no-store' },
          body: JSON.stringify({ error: status === 429 ? 'RATE_LIMITED' : 'UNAVAILABLE', message: 'Fallo técnico controlado E2E' }),
        })
      }
      await customer.context.route(ORDERS, handler)
      try {
        await submitButton().click()
        await expect(alertWith(customer.page, status === 429 ? /intentos|Reintenta/ : /disponible|guardado/)).toBeVisible()
        expect(faults).toBe(1)
        await expectNoNewOrders(before)
        await cartHasProduct()
      } finally { await customer.context.unroute(ORDERS, handler); customer.controlledFailures.delete(failure) }
      await preparePickupCheckout(customer.page, credentials.customer.phone, 'similar')
      await submit()
      expect((await ownIds()).filter((id) => !before.includes(id))).toEqual([latestOrderId])
      await cancel(latestOrderId)
    })
  }

  test('sesión revocada: 401, redirige a ingreso y la canasta sobrevive al reingreso', async () => {
    const before = await ownIds()
    await checkout()
    const logout = await customer.context.request.post('/api/auth/logout', { headers: apiHeaders(dest) })
    expect(logout.ok()).toBe(true)
    const response = customer.page.waitForResponse(isOrderPost)
    await submitButton().click()
    expect((await response).status()).toBe(401)
    await expect(customer.page).toHaveURL(/\/auth/)
    await customerLogin(customer.page, credentials.customer)
    await cartHasProduct()
    await expectNoNewOrders(before)
    await preparePickupCheckout(customer.page, credentials.customer.phone, 'similar')
    await submit()
    await cancel(latestOrderId)
  })

  test('offline con SW activo conserva la canasta sin caché privada y se recupera en 3G', async () => {
    const before = await ownIds()
    await checkout()
    const controlled = () => customer.page.evaluate(() => Boolean(navigator.serviceWorker.controller))
    await customer.page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
    if (!(await controlled())) await customer.page.reload()
    await expect.poll(controlled, { timeout: 30_000 }).toBe(true)
    await customer.context.setOffline(true)
    try {
      await submitButton().click()
      await expect(alertWith(customer.page, /conexión|guardado/i)).toBeVisible()
      // La canasta es pública y local: sobrevive a navegar y recargar sin red.
      await cartHasProduct()
      await customer.page.reload()
      await expect(customer.page.getByText(displayName(fixed), { exact: true }).first()).toBeVisible()
      const privateCachePaths = await customer.page.evaluate(async () => {
        const paths: string[] = []
        for (const name of await caches.keys()) {
          for (const request of await (await caches.open(name)).keys()) {
            const path = new URL(request.url).pathname
            if (/^\/api\/(auth|orders|audit)(\/|$)|^\/admin(?:\/|$)|^\/api\/(?:catalog|store)\/staff/.test(path)) paths.push(path)
          }
        }
        return paths
      })
      expect(privateCachePaths, 'ninguna respuesta privada en Cache Storage').toEqual([])
    } finally { await customer.context.setOffline(false) }
    // Chrome emula latencia y ancho de banda; nunca sustituye respuestas del servidor.
    const cdp = await customer.context.newCDPSession(customer.page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 200_000, uploadThroughput: 90_000 })
    try {
      await customer.page.reload()
      await cartHasProduct()
      await expectNoNewOrders(before)
      await preparePickupCheckout(customer.page, credentials.customer.phone, 'similar')
      await submit()
      expect((await ownIds()).filter((id) => !before.includes(id))).toEqual([latestOrderId])
    } finally {
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
      await cdp.detach()
    }
    await cancel(latestOrderId)
  })

  test('personal sustituye con declaración de contacto y cancela; histórico y audit persisten', async () => {
    await checkout('call_me')
    const id = await submit()
    const original = await readOrder(id)
    await adminOpenOrderFromList(admin.page, id)
    await admin.page.getByRole('button', { name: 'Confirmar pedido' }).click()
    await admin.page.getByRole('button', { name: 'Marcar como preparando' }).click()
    await admin.page.getByRole('button', { name: `Sustituir ${fixed.name}`, exact: true }).click()
    const modal = admin.page.getByRole('dialog')
    await modal.getByLabel('Producto sustituto').selectOption(substitute.id)
    await modal.getByRole('button', { name: 'Aplicar cambio' }).click()
    await expect(modal.getByRole('alert')).toContainText('Confirma que hablaste')
    await modal.getByRole('checkbox', { name: /Hablé con el cliente/ }).check()
    await modal.getByRole('button', { name: 'Aplicar cambio' }).click()
    await expect(modal).toHaveCount(0)
    const changed = await readOrder(id)
    expect(changed.items.find((item) => item.id === substitute.id)).toMatchObject({ substitutedFor: fixed.id, priceAtMoment: substitute.price })
    expect(changed.items.some((item) => item.id === fixed.id)).toBe(false)
    expect(changed.originalItems).toEqual(original.items)
    expect(changed.estimatedTotal, 'la estimación original no cambia').toBe(original.estimatedTotal)
    expect(changed.finalTotal).toBe(substitute.price)
    await admin.page.reload()
    await expect(admin.page.getByText('Sustituto', { exact: true }).first()).toBeVisible()
    await cancelOnCurrentPage('Cancelación después de sustitución técnica E2E')
    await customer.page.reload()
    expect((await readOrder(id)).status).toBe('cancelled')
    await customer.page.goto(`/pedidos/${id}`)
    await expect(customer.page.getByText(/cancelado/i).first()).toBeVisible()
    await customer.page.goto('/pedidos')
    await expect(customer.page.locator(`a[href="/pedidos/${id}"]`)).toBeVisible()
    const actions = (await owner.orderAudit(id)).map((event) => event.action)
    expect(actions).toContain('status_changed')
    expect(actions).toContain('items_changed')
  })

  test('edición de catálogo desde admin persiste y llega a la PWA sin deploy', async () => {
    // El precio previo y la versión real del producto de personal se registran antes de editar por UI.
    await fixtures.watchProduct(fixed.id, ['price'])
    try {
      await admin.page.goto('/admin/catalogo')
      await expect(admin.page.getByRole('heading', { name: 'Catálogo' })).toBeVisible()
      await admin.page.getByLabel('Buscar productos').fill(fixed.name)
      const row = () => admin.page.getByRole('row').filter({ has: admin.page.getByText(fixed.id, { exact: true }) })
      await expect(row()).toBeVisible()
      await row().getByRole('button', { name: 'Editar', exact: true }).click()
      const modal = admin.page.getByRole('dialog')
      const priceField = modal.getByLabel('Precio', { exact: true })
      // El formulario se reinicia si llegan categorías tras abrirlo: se espera a que esté completo y estable.
      await expect.poll(() => modal.getByLabel('Categoría').locator('option').count(), { message: 'categorías cargadas en el formulario' }).toBeGreaterThan(0)
      await expect.poll(async () => digitsOf(await priceField.inputValue()), { message: 'precio actual en el formulario' }).toBe(String(fixed.price))
      const newPrice = fixed.price + 137
      // El campo reformatea al recibir foco: se teclea como una persona (fill concatenaba con el valor previo).
      await priceField.click()
      await priceField.press('Control+A')
      await priceField.pressSequentially(String(newPrice))
      await expect(priceField).toHaveValue(String(newPrice))
      await modal.getByRole('button', { name: 'Guardar', exact: true }).click()
      try {
        await expect(modal).toHaveCount(0)
      } catch {
        // Diagnóstico: avisos de la app (no contienen credenciales) y valor que quedó en el campo.
        const notices = redact((await admin.page.getByRole('status').allInnerTexts()).join(' | ')).slice(0, 300)
        const shown = await priceField.inputValue().catch(() => '?')
        throw new Error(`El formulario no se cerró tras Guardar; avisos: [${notices}]; precio en el campo: ${shown}`)
      }
      await admin.page.reload()
      await admin.page.getByLabel('Buscar productos').fill(fixed.name)
      await expectAmount(row(), newPrice, 'precio editado persistente en admin')
      await customer.page.goto(`/search?q=${encodeURIComponent(displayName(fixed))}`)
      await expectAmount(customer.page.getByRole('article', { name: displayName(fixed), exact: true }), newPrice, 'precio editado visible en la PWA')
    } finally { await fixtures.restore() }
  })

  test('cierre: sin excepciones ni WhatsApp, fixtures devueltos y sesiones cerradas', async () => {
    expect([...customer.issues, ...admin.issues]).toEqual([])
    await fixtures.restore()
    await customer.context.request.post('/api/auth/logout', { headers: apiHeaders(dest) })
    await admin.context.request.post('/api/auth/logout', { headers: apiHeaders(dest) })
    await customer.page.goto('/pedidos')
    await expect(customer.page).toHaveURL(/\/auth/)
    await admin.page.goto('/admin/pedidos')
    await expect(admin.page).toHaveURL(/\/admin\/login/)
    expect((await customer.context.request.get('/api/auth/session', { headers: apiHeaders(dest) })).status()).toBe(401)
    expect(runtime.fixtures?.every((fixture) => fixture.restored) ?? true, 'todos los fixtures restaurados').toBe(true)
    saveRuntime(runtime, 'verified')
  })
})
