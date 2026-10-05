import { expect, test, type Page } from '@playwright/test'
import { orderDtoSchema, publicCatalogResponseSchema, type CreateOrderRequest, type ProductDto } from '../../shared/contracts/index.js'
import { apiHeaders, getWithRetry, openActor, type Actor } from '../support/actors.js'
import { nationalPhoneDigits, readCredentials, readDestination, type Credentials, type Destination } from '../support/env.js'
import { addProduct, adminLogin, adminOpenOrderFromList, customerLogin, submittedOrderId } from '../support/flows.js'
import { checkHealth, openOwnerApi, type OwnerApi } from '../support/ownerApi.js'
import { createRuntime, saveRuntime, type RuntimeRecord } from '../support/runtime.js'

// PM-02: el selector «Si necesitamos hacer un cambio» cierra con cualquier opción, conserva la
// preferencia y se opera con teclado. Navegador real contra la PWA y API/Postgres reales; el único
// pedido se crea y se cancela por UI. No hay mocks de pedidos ni envío de WhatsApp.
const TRIGGER = 'button[aria-controls="substitution-options"]'
const isOrderPost = (request: { method(): string; url(): string }): boolean =>
  request.method() === 'POST' && new URL(request.url()).pathname === '/api/orders'

test.describe('selector de sustituciones PM-02 @completo', () => {
  let dest: Destination
  let credentials: Credentials
  let owner: OwnerApi
  let customer: Actor
  let admin: Actor
  let runtime: RuntimeRecord
  let restoreStore: () => Promise<void> = async () => undefined
  let product: ProductDto

  const trigger = (page: Page) => page.locator(TRIGGER)
  const options = (page: Page) => page.getByRole('radiogroup', { name: 'Si necesitamos hacer un cambio' })
  const pickWithMouse = async (page: Page, value: 'similar' | 'call_me' | 'remove') => {
    await trigger(page).click()
    await expect(options(page)).toBeVisible()
    await page.locator(`label[for="substitution-${value}"]`).click()
    await expect(options(page)).toHaveCount(0)
    await expect(trigger(page), 'el foco vuelve al disparador').toBeFocused()
  }

  test.beforeAll(async ({ browser, playwright }) => {
    dest = readDestination()
    credentials = readCredentials()
    expect(await checkHealth(playwright, dest)).toMatchObject({ environment: 'test', database: 'connected' })
    runtime = createRuntime(dest.previewSha, dest.readyStamp)
    owner = await openOwnerApi(playwright, dest, credentials)
    restoreStore = await owner.ensureStoreOpen(runtime)
    customer = await openActor(browser, dest, 'cliente', runtime)
    admin = await openActor(browser, dest, 'admin', runtime)
    await customerLogin(customer.page, credentials.customer)
    await adminLogin(admin.page, credentials.staff)
    const catalog = await owner.request.get('/api/catalog')
    expect(catalog.status()).toBe(200)
    const candidate = publicCatalogResponseSchema.parse(await catalog.json()).products.find((item) => item.inStock && !item.is_variable_weight)
    expect(candidate, 'el seed debe tener un producto de peso fijo disponible').toBeDefined()
    product = candidate!
    saveRuntime(runtime, 'pm02-started')
  })

  test.afterAll(async () => {
    if (!runtime) return
    const cleanup = await Promise.allSettled([
      (async () => { await restoreStore(); await owner?.close() })(),
      customer?.context.request.post('/api/auth/logout', { headers: apiHeaders(dest) }),
      admin?.context.request.post('/api/auth/logout', { headers: apiHeaders(dest) }),
    ])
    runtime.sessionsClosed = cleanup.every((result) => result.status === 'fulfilled')
    saveRuntime(runtime, cleanup.some((result) => result.status === 'rejected') ? 'cleanup-failed' : 'finished')
    await Promise.allSettled([customer?.context.close(), admin?.context.close()])
    for (const result of cleanup) if (result.status === 'rejected') throw result.reason
  })

  test('repetir, cambiar y operar con teclado cierra el menú y el pedido persiste la preferencia elegida', async () => {
    const page = customer.page
    await page.goto('/')
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
    await addProduct(page, product.name_display ?? product.name)
    await page.goto('/cart')
    await page.getByRole('button', { name: /^Pedir mi Mercado/ }).click()
    await expect(page).toHaveURL(/\/checkout/)

    // Repetir la opción actual (por defecto «Avisarme antes de cambiar») debe cerrar y conservarla.
    await expect(trigger(page)).toContainText('Avisarme antes de cambiar')
    await pickWithMouse(page, 'call_me')
    await expect(trigger(page)).toContainText('Avisarme antes de cambiar')

    // Otra opción cierra y se refleja en el disparador.
    await pickWithMouse(page, 'remove')
    await expect(trigger(page)).toContainText('Quitar el producto')

    // Teclado: Enter abre y enfoca la opción actual; las flechas mueven sin cerrar; Enter confirma.
    await trigger(page).focus()
    await page.keyboard.press('Enter')
    await expect(options(page)).toBeVisible()
    await expect(page.getByRole('radio', { name: /Quitar el producto/ })).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(options(page), 'las flechas no cierran el menú').toBeVisible()
    await expect(page.getByRole('radio', { name: /Avisarme antes de cambiar/ })).toBeChecked()
    await page.keyboard.press('Enter')
    await expect(options(page)).toHaveCount(0)
    await expect(trigger(page)).toBeFocused()
    await expect(trigger(page)).toContainText('Avisarme antes de cambiar')

    // Space sobre la opción actual también confirma y no reabre el menú al soltar la tecla.
    await page.keyboard.press('Enter')
    await expect(options(page)).toBeVisible()
    await page.keyboard.press('Space')
    await expect(options(page)).toHaveCount(0)
    await expect(trigger(page)).toBeFocused()

    // Elegir «Quitar el producto» con teclado (flechas + Space) y comprobar el payload real del pedido.
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Space')
    await expect(trigger(page)).toContainText('Quitar el producto')

    // La preferencia elegida con teclado llega al POST real y queda persistida en Postgres.
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await page.getByRole('radio', { name: /Recoger en tienda/ }).click()
    const slots = page.getByRole('radiogroup', { name: 'Franja horaria de recogida' })
    await expect(slots, 'la tienda debe ofrecer franjas de recogida').toBeVisible()
    await slots.getByRole('radio').first().click()
    const phone = page.getByLabel('Celular para este pedido')
    if (await phone.inputValue() === '') await phone.fill(nationalPhoneDigits(credentials.customer.phone))
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    const posted = page.waitForRequest(isOrderPost)
    await page.getByRole('button', { name: 'Pedir mi Mercado', exact: true }).click()
    const sent = (await posted).postDataJSON() as CreateOrderRequest
    expect(sent.substitutionPreference).toBe('remove')
    const orderId = await submittedOrderId(page)
    runtime.orders.push({ key: 'pm02-sustituciones', orderId })
    saveRuntime(runtime, 'created')
    const response = await getWithRetry(customer.context.request, `/api/orders/${encodeURIComponent(orderId)}`, apiHeaders(dest))
    expect(response.status(), 'GET del pedido propio').toBe(200)
    expect(orderDtoSchema.parse(await response.json()).substitutionPreference).toBe('remove')

    // Limpieza por UI: solo se cancela el pedido propio de este escenario.
    await adminOpenOrderFromList(admin.page, orderId)
    await admin.page.getByRole('button', { name: 'Cancelar pedido', exact: true }).click()
    await admin.page.getByLabel('Motivo de cancelación').fill('Cancelación técnica de escenario PM-02')
    await admin.page.getByRole('button', { name: 'Confirmar cancelación' }).click()
    await expect(admin.page.getByText('Pedido cancelado').first()).toBeVisible()
  })
})
