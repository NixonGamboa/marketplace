import { expect, test, type Page } from '@playwright/test'
import {
  authSessionResponseSchema, calculateOrderTotals, orderDtoSchema, publicCatalogResponseSchema, storeDtoSchema,
  type OrderDto, type ProductDto,
} from '../../shared/contracts/index.js'
import { apiHeaders, expectSessionClosed, openActor, sanitizedShot, type Actor } from '../support/actors.js'
import { readCredentials, readDestination, type Credentials, type Destination } from '../support/env.js'
import {
  adminLogin, adminLogout, adminOpenOrderFromList, addProduct, customerLogin, customerLogout, customerStatusStep,
  expectAmount, placePickupOrder,
} from '../support/flows.js'
import { checkHealth, openOwnerApi, type OwnerApi } from '../support/ownerApi.js'
import { createRuntime, saveRuntime, type RuntimeRecord } from '../support/runtime.js'
import { TechnicalFixtures } from '../support/fixtures.js'

// Smoke de navegador T-22 (parcial hasta T-15/T-20/T-21): un pedido NUEVO y propio recorre
// cliente → recepción → pesos reales → entrega con dos contextos independientes contra la API real.
// Los pedidos del seed o manuales nunca se tocan. Solo `npm run e2e:smoke` (con ready de root).
const VARIABLE_KILOS = 0.75
const REAL_KILOS = 0.9
// Los sondeos de las apps corren cada 30 s; el margen cubre un ciclo completo más la latencia.
const POLL_TIMEOUT = 75_000

interface Scenario {
  fixed: ProductDto
  variable: ProductDto
  orderId: string
  estimatedTotal: number
  finalTotal: number
  contactPhone: string | null
}

test.describe.serial('smoke pedido cliente → admin @smoke', () => {
  let dest: Destination
  let credentials: Credentials
  let runtime: RuntimeRecord
  let owner: OwnerApi
  let fixtures: TechnicalFixtures
  let restoreStore: () => Promise<void> = async () => undefined
  let customer: Actor
  let admin: Actor
  let adminIsOwner = false
  const scenario: Partial<Scenario> = {}

  test.beforeAll(async ({ browser, playwright }) => {
    dest = readDestination()
    credentials = readCredentials()
    runtime = createRuntime(dest.previewSha, dest.readyStamp)
    const health = await checkHealth(playwright, dest)
    expect(health, 'solo se ejecuta contra la API de test conectada').toMatchObject({ status: 'ok', environment: 'test', database: 'connected' })
    owner = await openOwnerApi(playwright, dest, credentials)
    fixtures = new TechnicalFixtures(owner, runtime)
    await fixtures.restore() // cambios técnicos que una corrida interrumpida dejó sin devolver
    if (!(await owner.readStaffStore()).contactPhone) await fixtures.store({ contactPhone: '573101234567' })
    restoreStore = await owner.ensureStoreOpen(runtime)
    customer = await openActor(browser, dest, 'cliente', runtime)
    admin = await openActor(browser, dest, 'admin', runtime)
    saveRuntime(runtime, 'started')
  })

  test.afterAll(async () => {
    if (!runtime) return
    // Todo se intenta aunque un paso falle: override de tienda, sesiones y contextos.
    const logout = (actor: Actor | undefined) => actor?.context.request.post('/api/auth/logout', { headers: apiHeaders(dest) })
    const results = await Promise.allSettled([
      (async () => { await restoreStore(); await fixtures?.restore(); await owner?.close() })(), logout(customer), logout(admin),
    ].map((step) => Promise.resolve(step)))
    runtime.sessionsClosed = results.every((result) => result.status === 'fulfilled')
    saveRuntime(runtime, 'finished')
    await Promise.allSettled([customer?.context.close(), admin?.context.close()])
    for (const result of results) if (result.status === 'rejected') throw result.reason
  })

  test('ambas apps corren en modo REAL y la sesión empieza cerrada', async () => {
    await customer.page.goto('/pedidos')
    await expect(customer.page).toHaveURL(/\/auth$/)
    await admin.page.goto('/admin/login')
    await expect(admin.page.getByLabel('Correo electrónico')).not.toHaveAttribute('placeholder', /demo/i)
  })

  test('el catálogo público tiene un producto de peso fijo y uno de peso variable disponibles', async () => {
    const response = await customer.context.request.get('/api/catalog', { headers: apiHeaders(dest) })
    expect(response.status()).toBe(200)
    const { products } = publicCatalogResponseSchema.parse(await response.json())
    const available = products.filter((product) => product.inStock)
    const fixed = available.find((product) => !product.is_variable_weight)
    const variable = available.find((product) => product.is_variable_weight)
    expect(fixed, 'el seed debe incluir un producto de peso fijo disponible').toBeDefined()
    expect(variable, 'el seed debe incluir un producto de peso variable disponible').toBeDefined()
    scenario.fixed = fixed!
    scenario.variable = variable!
    const store = storeDtoSchema.parse(await (await customer.context.request.get('/api/store', { headers: apiHeaders(dest) })).json())
    expect(store.availability.isOpen, 'la tienda debe estar abierta para pedir').toBe(true)
    scenario.contactPhone = store.contactPhone
  })

  test('el cliente inicia sesión, arma la canasta y pide con recogida en tienda', async () => {
    const { page } = customer
    await customerLogin(page, credentials.customer)
    const fixedName = scenario.fixed!.name_display ?? scenario.fixed!.name
    const variableName = scenario.variable!.name_display ?? scenario.variable!.name
    await addProduct(page, fixedName)
    await addProduct(page, variableName, VARIABLE_KILOS)
    scenario.orderId = await placePickupOrder(page, credentials.customer.phone)
    runtime.orders = runtime.orders.map((order) => order.orderId ? order : { ...order, orderId: scenario.orderId! })
    saveRuntime(runtime, 'created')

    const expected = calculateOrderTotals([
      { qty: 1, priceAtMoment: scenario.fixed!.price },
      { qty: 1, priceAtMoment: scenario.variable!.price, is_variable_weight: true, kilosRequested: VARIABLE_KILOS },
    ], 0)
    scenario.estimatedTotal = expected.estimatedTotal
    scenario.finalTotal = calculateOrderTotals([
      { qty: 1, priceAtMoment: scenario.fixed!.price },
      { qty: 1, priceAtMoment: scenario.variable!.price, is_variable_weight: true, kilosRequested: VARIABLE_KILOS, kilosReal: REAL_KILOS },
    ], 0).finalTotal!
    await expectAmount(page.getByRole('region', { name: 'Resumen del pedido' }), scenario.estimatedTotal, 'total estimado en la PWA')
    await expect(customerStatusStep(page, 'Recibido')).toContainText('En curso')
    await sanitizedShot(page, '01-pedido-recibido-cliente')
  })

  test('el admin recibe el pedido nuevo, lo abre y confirma', async () => {
    const { page } = admin
    await adminLogin(page, credentials.staff)
    const session = authSessionResponseSchema.parse(await (await page.context().request.get('/api/auth/session', { headers: apiHeaders(dest) })).json())
    adminIsOwner = session.account.role === 'owner'
    await adminOpenOrderFromList(page, scenario.orderId!)
    await expectAmount(page.getByText(/Total estimado/), scenario.estimatedTotal!, 'total estimado en el admin')
    await page.getByRole('button', { name: 'Confirmar pedido' }).click()
    await expect(page.getByRole('button', { name: 'Marcar como preparando' })).toBeVisible()
    await sanitizedShot(page, '02-pedido-confirmado-admin')
  })

  test('el cliente detecta «Confirmado» sin recargar (sondeo entre dispositivos)', async () => {
    await expect(customerStatusStep(customer.page, 'Confirmado')).toContainText('En curso', { timeout: POLL_TIMEOUT })
  })

  test('el admin prepara, registra el peso real y marca listo', async () => {
    const { page } = admin
    await page.getByRole('button', { name: 'Marcar como preparando' }).click()
    const weight = page.getByLabel('Peso real')
    await expect(weight).toBeEnabled()
    await weight.fill(String(REAL_KILOS))
    await page.getByRole('button', { name: 'Guardar pesos' }).click()
    await expect(page.getByText('Pesos guardados')).toBeVisible()
    await page.getByRole('button', { name: 'Marcar como listo' }).click()
    await expect(page.getByRole('button', { name: 'Marcar como entregado' })).toBeVisible()
    await expectAmount(page.getByText(/Total final/), scenario.finalTotal!, 'total final en el admin')
  })

  test('el cliente ve «Listo» con total final; el estimado original persiste en el servidor', async () => {
    const { page } = customer
    await expect(customerStatusStep(page, 'Listo')).toContainText('En curso', { timeout: POLL_TIMEOUT })
    await expectAmount(page.getByRole('region', { name: 'Resumen del pedido' }).getByText(/Total final/), scenario.finalTotal!, 'total final en la PWA')
    await page.reload()
    await expectAmount(page.getByRole('region', { name: 'Resumen del pedido' }).getByText(/Total final/), scenario.finalTotal!, 'total final tras recargar')
    const order = await readOrder(page, dest, scenario.orderId!)
    expect(order.status).toBe('ready')
    expect(order.estimatedTotal, 'la estimación original no se sobrescribe').toBe(scenario.estimatedTotal)
    expect(order.finalTotal, 'total final calculado por el servidor con el peso real').toBe(scenario.finalTotal)
    expect(order.items.find((item) => item.is_variable_weight)?.kilosReal).toBe(REAL_KILOS)
    await sanitizedShot(page, '03-pedido-listo-cliente')
  })

  test('el admin entrega y el cliente detecta «Entregado» con ambos totales persistentes', async () => {
    await admin.page.getByRole('button', { name: 'Marcar como entregado' }).click()
    await expect(admin.page.getByRole('button', { name: 'Marcar como entregado' })).toHaveCount(0)
    await expect(customerStatusStep(customer.page, 'Entregado')).toContainText(/En curso|Completado/, { timeout: POLL_TIMEOUT })
    await customer.page.reload()
    await expectAmount(customer.page.getByRole('region', { name: 'Resumen del pedido' }).getByText(/Total final/), scenario.finalTotal!, 'total final tras entrega')
    const order = await readOrder(customer.page, dest, scenario.orderId!)
    expect(order.status).toBe('delivered')
    expect({ estimated: order.estimatedTotal, final: order.finalTotal }).toEqual({ estimated: scenario.estimatedTotal, final: scenario.finalTotal })
  })

  test('comprobante, enlaces de contacto (sin enviar WhatsApp) y auditoría', async () => {
    const { page } = customer
    await page.getByRole('button', { name: 'Ver comprobante' }).click()
    const receipt = page.getByRole('region', { name: 'Comprobante del pedido' })
    await expect(receipt).toContainText(scenario.orderId!)
    const contact = receipt.getByRole('link')
    if (scenario.contactPhone) {
      const href = (await contact.getAttribute('href')) ?? ''
      const url = new URL(href)
      expect(`${url.origin}${url.pathname}`).toBe(`https://wa.me/${scenario.contactPhone}`)
      expect(url.searchParams.get('text') ?? '').toContain(scenario.orderId!)
    } else {
      // El seed deja el contacto del negocio en null: sin número real no hay enlace verificable.
      await expect(contact).toHaveCount(0)
      runtime.findings.push('Contacto del negocio null: destino y texto de wa.me del comprobante no verificables con este seed')
    }

    // Enlace de contacto del admin al cliente: destino wa.me con su celular y texto preparado; nunca se abre.
    const adminLink = admin.page.locator('a[href^="https://wa.me/"]').first()
    await expect(adminLink, 'contacto al cliente disponible').toBeVisible()
    {
      const url = new URL((await adminLink.getAttribute('href')) ?? '')
      expect(url.hostname).toBe('wa.me')
      expect(url.pathname).toMatch(/^\/57\d{10}$/)
      expect(url.searchParams.get('text') ?? '').toContain(scenario.orderId!)
    }
    await admin.page.getByRole('tab', { name: 'Comprobante' }).click()
    await expect(admin.page.getByRole('region', { name: 'Comprobante del pedido' })).toContainText(scenario.orderId!)

    const actions = (await owner.orderAudit(scenario.orderId!)).map((event) => event.action)
    expect(actions, 'la auditoría registra el ciclo del pedido').toContain('status_changed')
    if (adminIsOwner) {
      await admin.page.goto('/admin/auditoria')
      await admin.page.getByLabel('ID del recurso').fill(scenario.orderId!)
      await admin.page.getByRole('button', { name: 'Aplicar' }).click()
      await expect(admin.page.getByRole('row').filter({ hasText: scenario.orderId! }).filter({ hasText: 'Cambio de estado' }).first()).toBeVisible()
    }
    expect([...customer.issues, ...admin.issues], 'sin errores de servidor ni intentos de abrir WhatsApp').toEqual([])
  })

  test('cierre de sesión de cliente y admin, y restauración de la tienda', async () => {
    await customerLogout(customer.page)
    await adminLogout(admin.page)
    await expectSessionClosed(customer, dest)
    await expectSessionClosed(admin, dest)
    await restoreStore()
    const store = await owner.readStaffStore()
    if (runtime.override) expect(store.scheduleOverride, 'override de tienda restaurado').toBe(runtime.override.original)
    runtime.sessionsClosed = true
    saveRuntime(runtime, 'verified')
  })
})

async function readOrder(page: Page, dest: Destination, orderId: string): Promise<OrderDto> {
  const response = await page.context().request.get(`/api/orders/${encodeURIComponent(orderId)}`, { headers: apiHeaders(dest) })
  expect(response.status(), 'GET del pedido propio').toBe(200)
  return orderDtoSchema.parse(await response.json())
}
