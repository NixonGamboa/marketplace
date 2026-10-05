import { expect, test, type Locator, type Page } from '@playwright/test'
import { apiHeaders, fillSecret, openActor, type Actor } from '../support/actors.js'
import { readCredentials, readDestination, nationalPhoneDigits, type Credentials, type Destination } from '../support/env.js'
import { checkHealth } from '../support/ownerApi.js'

// PM-01: señal visible y accesible al enviar formularios inválidos. Usa solo las cuentas seed del
// entorno (sin crear cuentas ni datos): el registro se prueba únicamente con envíos inválidos o sin
// enviar, y el ingreso real cierra su sesión al terminar. Ningún valor de credencial se imprime.
const AUTH_POST = /^\/api\/auth\//

/** Registra los POST de autenticación que sale de la página: un envío inválido no debe producir ninguno. */
function watchAuthPosts(page: Page): string[] {
  const posts: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST' && AUTH_POST.test(path)) posts.push(path)
  })
  return posts
}

async function expectInvalid(field: Locator, errorId: string, message: RegExp): Promise<void> {
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(field).toHaveAttribute('aria-describedby', new RegExp(`(^|\\s)${errorId}($|\\s)`))
  await expect(field.page().locator(`#${errorId}`)).toHaveText(message)
}

async function expectValid(field: Locator, errorId: string): Promise<void> {
  await expect(field).toHaveAttribute('aria-invalid', 'false')
  await expect(field.page().locator(`#${errorId}`)).toHaveCount(0)
}

test.describe('formularios de acceso: validación visible @completo', () => {
  let dest: Destination
  let credentials: Credentials
  let customer: Actor
  let admin: Actor

  test.beforeAll(async ({ browser, playwright }) => {
    dest = readDestination()
    credentials = readCredentials()
    expect(await checkHealth(playwright, dest)).toMatchObject({ environment: 'test', database: 'connected' })
    customer = await openActor(browser, dest, 'cliente', null)
    admin = await openActor(browser, dest, 'admin', null)
  })

  test.afterAll(async () => {
    await Promise.allSettled([
      customer?.context.request.post('/api/auth/logout', { headers: apiHeaders(dest) }),
      admin?.context.request.post('/api/auth/logout', { headers: apiHeaders(dest) }),
    ])
    await Promise.allSettled([customer?.context.close(), admin?.context.close()])
  })

  test('registro PWA inválido: errores por campo, foco al primero, sin POST y recuperación al corregir', async () => {
    const { page } = customer
    const posts = watchAuthPosts(page)
    await page.goto('/auth')
    await page.getByRole('button', { name: '¿Primera vez? Crea tu cuenta' }).click()
    const form = page.getByRole('form', { name: 'Crear cuenta' })
    const name = form.getByLabel('Tu nombre')
    const phone = form.getByLabel('Celular')
    const password = form.getByLabel('Contraseña')

    await form.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
    await expectInvalid(name, 'auth-name-error', /nombre/i)
    await expectInvalid(phone, 'auth-phone-error', /celular colombiano válido/)
    await expectInvalid(password, 'auth-password-error', /Escribe tu contraseña/)
    await expect(name).toBeFocused()
    await expect(form.getByRole('button', { name: 'Crear cuenta', exact: true })).toBeEnabled()

    // Datos inválidos de otro tipo: celular que no empieza por 3 y contraseña por debajo del mínimo.
    await name.fill('Prueba PM01')
    await phone.fill('2001234567')
    await fillSecret(password, 'corta', 'contraseña de prueba inválida')
    await form.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
    await expectValid(name, 'auth-name-error')
    await expectInvalid(phone, 'auth-phone-error', /celular colombiano válido/)
    await expectInvalid(password, 'auth-password-error', /al menos 12 caracteres/)
    await expect(phone).toBeFocused()

    // Corregir cada campo retira su error sin reenviar; el formulario no se envía en esta prueba.
    await phone.fill('3001234567')
    await expectValid(phone, 'auth-phone-error')
    await fillSecret(password, 'una-clave-bastante-larga', 'contraseña de prueba válida')
    await expectValid(password, 'auth-password-error')
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(posts, 'un envío inválido no genera peticiones de autenticación').toEqual([])
    expect(customer.issues).toEqual([])
  })

  test('ingreso PWA: el envío vacío no hace POST y con la cuenta seed ingresa tras corregir', async () => {
    const { page } = customer
    const posts = watchAuthPosts(page)
    await page.goto('/auth')
    const form = page.getByRole('form', { name: 'Ingresar' })
    await form.getByRole('button', { name: 'Ingresar', exact: true }).click()
    await expectInvalid(form.getByLabel('Celular'), 'auth-phone-error', /celular colombiano válido/)
    await expectInvalid(form.getByLabel('Contraseña'), 'auth-password-error', /Escribe tu contraseña/)
    await expect(form.getByLabel('Celular')).toBeFocused()
    expect(posts).toEqual([])

    await form.getByLabel('Celular').fill(nationalPhoneDigits(credentials.customer.phone))
    await fillSecret(form.getByLabel('Contraseña'), credentials.customer.password, 'contraseña del cliente')
    await expectValid(form.getByLabel('Celular'), 'auth-phone-error')
    await expectValid(form.getByLabel('Contraseña'), 'auth-password-error')
    const login = page.waitForResponse((response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname.startsWith('/api/auth/'))
    await form.getByRole('button', { name: 'Ingresar', exact: true }).click()
    expect((await login).ok(), 'ingreso con la cuenta seed').toBe(true)
    await expect(page).not.toHaveURL(/\/auth/)
    expect(customer.issues).toEqual([])
  })

  test('ingreso admin: el envío vacío no hace POST y con la cuenta seed ingresa tras corregir', async () => {
    const { page } = admin
    const posts = watchAuthPosts(page)
    await page.goto('/admin/login')
    const form = page.getByRole('form', { name: 'Formulario de inicio de sesión' })
    const email = form.getByLabel('Correo electrónico')
    const password = form.getByLabel('Contraseña')
    const submit = form.getByRole('button', { name: 'Iniciar sesión' })

    await expect(submit, 'el botón no queda bloqueado por campos vacíos').toBeEnabled()
    await submit.click()
    await expectInvalid(email, 'login-email-error', /Escribe tu correo electrónico/)
    await expectInvalid(password, 'login-password-error', /Escribe tu contraseña/)
    await expect(email).toBeFocused()

    await email.fill('sin-arroba')
    await submit.click()
    await expectInvalid(email, 'login-email-error', /correo válido/)
    await expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(posts, 'un envío inválido no genera peticiones de autenticación').toEqual([])

    await email.fill(credentials.staff.email)
    await fillSecret(password, credentials.staff.password, 'contraseña del personal')
    await expectValid(email, 'login-email-error')
    await expectValid(password, 'login-password-error')
    await submit.click()
    await expect(page).not.toHaveURL(/\/admin\/login/)
    expect(admin.issues).toEqual([])
  })
})
