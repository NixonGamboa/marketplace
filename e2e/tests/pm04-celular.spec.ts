import { expect, test } from '@playwright/test'
import { orderDtoSchema, publicCatalogResponseSchema, type ProductDto } from '../../shared/contracts/index.js'
import { apiHeaders, openActor, type Actor } from '../support/actors.js'
import { readCredentials, readDestination, nationalPhoneDigits, type Credentials, type Destination } from '../support/env.js'
import { TechnicalFixtures } from '../support/fixtures.js'
import { addProduct, customerLogin, preparePickupCheckout, submittedOrderId } from '../support/flows.js'
import { checkHealth, openOwnerApi, type OwnerApi } from '../support/ownerApi.js'
import { createRuntime, saveRuntime, type RuntimeRecord } from '../support/runtime.js'

// PM-04: el campo «Celular para este pedido» muestra y edita diez dígitos locales; el pedido
// persiste con el indicativo 57 una sola vez. Archivo separado de zz-completo.spec.ts.
const PHONE_LABEL = 'Celular para este pedido'
const PASTED_INTERNATIONAL = '+57 311 234 5678'
const PASTED_LOCAL = '3112345678'

test.describe.serial('celular local en checkout @completo', () => {
  let dest: Destination
  let credentials: Credentials
  let runtime: RuntimeRecord
  let owner: OwnerApi
  let fixtures: TechnicalFixtures
  let customer: Actor
  let fixed: ProductDto

  test.beforeAll(async ({ browser, playwright }) => {
    dest = readDestination()
    credentials = readCredentials()
    runtime = createRuntime(dest.previewSha, dest.readyStamp)
    expect(await checkHealth(playwright, dest), 'solo contra la API de test conectada')
      .toMatchObject({ status: 'ok', environment: 'test', database: 'connected' })
    owner = await openOwnerApi(playwright, dest, credentials)
    fixtures = new TechnicalFixtures(owner, runtime)
    await fixtures.restore()
    await owner.restoreInterruptedOverride(runtime)
    customer = await openActor(browser, dest, 'cliente', runtime)
    saveRuntime(runtime, 'started')
  })

  test.afterAll(async () => {
    if (!runtime) return
    const logout = customer?.context.request.post('/api/auth/logout', { headers: apiHeaders(dest) })
    const results = await Promise.allSettled([
      (async () => { await owner?.restoreInterruptedOverride(runtime); await fixtures?.restore(); await owner?.close() })(), Promise.resolve(logout),
    ])
    runtime.sessionsClosed = results.every((result) => result.status === 'fulfilled')
    saveRuntime(runtime, 'finished')
    await Promise.allSettled([customer?.context.close()])
    for (const result of results) if (result.status === 'rejected') throw result.reason
  })

  test('precarga diez dígitos desde el perfil y conserva entradas incompletas', async () => {
    const { page } = customer
    await customerLogin(page, credentials.customer)
    const response = await customer.context.request.get('/api/catalog', { headers: apiHeaders(dest) })
    const { products } = publicCatalogResponseSchema.parse(await response.json())
    fixed = products.find((product) => product.inStock && !product.is_variable_weight)!
    expect(fixed, 'el seed debe incluir un producto de peso fijo disponible').toBeDefined()
    await addProduct(page, fixed.name_display ?? fixed.name)
    await preparePickupCheckout(page, credentials.customer.phone)
    // El helper termina en Pago (paso 3); el celular vive en Entrega (paso 2).
    await page.getByRole('button', { name: 'Volver al paso anterior' }).click()

    const phone = page.getByLabel(PHONE_LABEL)
    await expect(phone).toHaveValue(nationalPhoneDigits(credentials.customer.phone))
    await expect(phone).toHaveAttribute('inputmode', 'numeric')

    // Una entrada incompleta no se reescribe y bloquea el avance hasta corregirla.
    const editable = page.getByLabel(PHONE_LABEL)
    await editable.fill('311')
    await expect(editable).toHaveValue('311')
    await expect(editable).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled()
  })

  test('un número internacional pegado se muestra local y el pedido persiste un solo 57', async () => {
    const { page } = customer
    const phone = page.getByLabel(PHONE_LABEL)
    await phone.fill(PASTED_INTERNATIONAL)
    await expect(phone).toHaveValue(PASTED_LOCAL)
    await expect(phone).toHaveAttribute('aria-invalid', 'false')
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await page.getByRole('button', { name: 'Pedir mi Mercado', exact: true }).click()

    const orderId = await submittedOrderId(page)
    // openActor registra la Idempotency-Key del POST y le asocia el ID; sin ese par no hay limpieza identificable.
    await expect.poll(() => runtime.orders.some((order) => order.key && order.orderId === orderId),
      { message: 'pedido registrado en el runtime con su Idempotency-Key', timeout: 10_000 }).toBe(true)
    const stored = await customer.context.request.get(`/api/orders/${encodeURIComponent(orderId)}`, { headers: apiHeaders(dest) })
    expect(stored.status(), 'GET del pedido propio').toBe(200)
    expect(orderDtoSchema.parse(await stored.json()).customerPhone).toBe(`57${PASTED_LOCAL}`)
    expect([...customer.issues], 'sin errores de servidor ni intentos de abrir WhatsApp').toEqual([])
  })
})
