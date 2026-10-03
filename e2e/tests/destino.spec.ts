import { expect, test } from '@playwright/test'
import { openActor } from '../support/actors.js'
import { readDestination, type Destination } from '../support/env.js'
import { checkHealth } from '../support/ownerApi.js'

// Comprobación de solo lectura (sin credenciales ni escrituras): el destino debe ser la API de test
// conectada y las dos apps deben correr en modo REAL, nunca demo. `npm run e2e:check` ejecuta @destino.
test.describe('destino real @destino', () => {
  let dest: Destination
  test.beforeAll(() => { dest = readDestination() })

  test('la API es de test y la base de datos está conectada', async ({ playwright }) => {
    expect(await checkHealth(playwright, dest)).toMatchObject({ status: 'ok', environment: 'test', database: 'connected' })
  })

  test('la PWA y el admin corren en modo REAL (no demo)', async ({ browser }) => {
    const customer = await openActor(browser, dest, 'cliente', null)
    const admin = await openActor(browser, dest, 'admin', null)
    try {
      const publicApi = customer.page.waitForResponse((response) => /^\/api\/(catalog|store)/.test(new URL(response.url()).pathname))
      await customer.page.goto('/')
      expect((await publicApi).status(), 'la PWA consume la API real de catálogo/tienda').toBe(200)

      // En modo real las rutas privadas exigen la sesión del servidor; el demo no interpone nada.
      await customer.page.goto('/pedidos')
      await expect(customer.page).toHaveURL(/\/auth$/)
      await expect(customer.page.getByRole('heading', { name: 'Ingresa a tu cuenta' })).toBeVisible()

      await admin.page.goto('/admin/login')
      const email = admin.page.getByLabel('Correo electrónico')
      await expect(email).toBeVisible()
      await expect(email, 'el login demo del admin precarga un correo de ejemplo').not.toHaveAttribute('placeholder', /demo/i)
      expect([...customer.issues, ...admin.issues]).toEqual([])
    } finally {
      await Promise.all([customer.context.close(), admin.context.close()])
    }
  })
})
