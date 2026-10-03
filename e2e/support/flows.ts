/**
 * Pasos de interfaz reutilizables del smoke. Todos usan roles y etiquetas accesibles de las apps
 * reales; ninguno simula auth, catálogo ni pedidos.
 */
import { expect, type Locator, type Page } from '@playwright/test'
import { fillSecret } from './actors.js'
import { nationalPhoneDigits, type Credentials } from './env.js'

export const digitsOf = (text: string): string => text.replace(/\D/g, '')

/** Los importes se comparan por dígitos: el separador de miles depende del ICU del navegador. */
export async function expectAmount(locator: Locator, amount: number, description: string): Promise<void> {
  await expect.poll(async () => digitsOf(await locator.innerText()), { message: description, timeout: 20_000 })
    .toContain(String(amount))
}

export async function customerLogin(page: Page, credentials: Credentials['customer']): Promise<void> {
  await page.goto('/auth')
  const form = page.getByRole('form', { name: 'Ingresar' })
  await expect(page.getByRole('heading', { name: 'Ingresa a tu cuenta' })).toBeVisible()
  await form.getByLabel('Celular').fill(nationalPhoneDigits(credentials.phone))
  await fillSecret(form.getByLabel('Contraseña'), credentials.password, 'contraseña del cliente')
  await form.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(page).not.toHaveURL(/\/auth/)
}

export async function customerLogout(page: Page): Promise<void> {
  await page.goto('/perfil')
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/($|\?)/)
}

export async function adminLogin(page: Page, credentials: Credentials['staff']): Promise<void> {
  await page.goto('/admin/login')
  const form = page.getByRole('form', { name: 'Formulario de inicio de sesión' })
  await form.getByLabel('Correo electrónico').fill(credentials.email)
  await fillSecret(form.getByLabel('Contraseña'), credentials.password, 'contraseña del personal')
  await form.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).not.toHaveURL(/\/admin\/login/)
}

export async function adminLogout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/admin\/login/)
}

/** Busca el producto por nombre y lo agrega; el de peso variable pide kilos en su hoja de selección. */
export async function addProduct(page: Page, name: string, variableKilos?: number): Promise<void> {
  await page.goto(`/search?q=${encodeURIComponent(name)}`)
  const card = page.getByRole('article', { name, exact: true })
  await expect(card, `producto «${name}» visible en la búsqueda`).toBeVisible()
  await card.getByRole('button', { name: `Agregar ${name}`, exact: true }).click()
  if (variableKilos === undefined) {
    await expect(card.getByRole('button', { name: 'Aumentar cantidad' })).toBeVisible()
    return
  }
  const sheet = page.getByRole('dialog')
  // La hoja parte en 0,5 kg y avanza de 0,25 en 0,25.
  const steps = Math.round((variableKilos - 0.5) / 0.25)
  for (let index = 0; index < steps; index += 1) await sheet.getByRole('button', { name: 'Aumentar kilogramos' }).click()
  await sheet.getByRole('button', { name: `Agregar ${variableKilos} kg`, exact: true }).click()
  await expect(card.getByText(`${variableKilos} kg`)).toBeVisible()
}

/** Carrito → checkout con recogida en tienda y la primera franja disponible; devuelve el ID del pedido. */
export async function placePickupOrder(page: Page, customerPhone: string): Promise<string> {
  await preparePickupCheckout(page, customerPhone)
  await page.getByRole('button', { name: 'Pedir mi Mercado', exact: true }).click()
  return submittedOrderId(page)
}

/** Llega hasta el botón final; permite introducir fallos sin simular la respuesta exitosa. */
export async function preparePickupCheckout(page: Page, customerPhone: string, substitution?: 'similar' | 'call_me' | 'remove'): Promise<void> {
  await page.goto('/cart')
  await page.getByRole('button', { name: /^Pedir mi Mercado/ }).click()
  await expect(page).toHaveURL(/\/checkout/)
  if (substitution) {
    await page.locator('button[aria-controls="substitution-options"]').click()
    await page.locator(`label[for="substitution-${substitution}"]`).click()
  }
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()

  await page.getByRole('radio', { name: /Recoger en tienda/ }).click()
  const slots = page.getByRole('radiogroup', { name: 'Franja horaria de recogida' })
  await expect(slots, 'la tienda debe ofrecer franjas de recogida').toBeVisible()
  await slots.getByRole('radio').first().click()
  const phone = page.getByLabel('Celular para este pedido')
  if (await phone.inputValue() === '') await phone.fill(nationalPhoneDigits(customerPhone))
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()

  await expect(page.getByRole('button', { name: 'Pedir mi Mercado', exact: true })).toBeEnabled()
}

export async function submittedOrderId(page: Page): Promise<string> {
  await page.waitForURL(/\/pedidos\/[^/]+$/, { timeout: 45_000 })
  const orderId = decodeURIComponent(new URL(page.url()).pathname.split('/').pop() ?? '')
  expect(orderId, 'ID del pedido en la URL de seguimiento').not.toBe('')
  return orderId
}

export function customerStatusStep(page: Page, label: string): Locator {
  return page.getByRole('list', { name: 'Estado del pedido' }).getByRole('listitem').filter({ hasText: label })
}

/** Abre el pedido desde la lista de recepción del admin (filtro por inicio del ID). */
export async function adminOpenOrderFromList(page: Page, orderId: string): Promise<void> {
  await page.goto('/admin/pedidos')
  await page.getByRole('tab', { name: 'Recibidos' }).click()
  await page.getByLabel('Buscar pedidos').fill(orderId.slice(0, 12))
  await page.getByRole('link', { name: new RegExp(`^Pedido ${orderId} de `) }).click()
  await expect(page.getByRole('article', { name: `Detalle del pedido ${orderId}` })).toBeVisible()
}
