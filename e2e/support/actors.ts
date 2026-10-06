/**
 * Contextos de navegador independientes (cliente y admin): cada uno con su propia cookie de sesión,
 * sin mocks de auth, pedidos, catálogo ni API. El bypass de Preview viaja únicamente hacia el
 * hostname del destino, y WhatsApp se bloquea a nivel de red: los enlaces se verifican, nunca se abren.
 */
import { expect, type APIRequestContext, type APIResponse, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { orderConfirmationSchema } from '../../shared/contracts/index.js'
import type { Destination } from './env.js'
import { ARTIFACTS_DIR, saveRuntime, type RuntimeRecord } from './runtime.js'
import { redact, secretValues } from './redact.js'

const WHATSAPP_HOSTS = /^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)(\/|$)/

export interface Actor {
  name: 'cliente' | 'admin'
  context: BrowserContext
  page: Page
  /** Fallos de servidor, excepciones de página y peticiones a WhatsApp observadas. */
  issues: string[]
  controlledFailures: Set<string>
}

export async function openActor(
  browser: Browser, dest: Destination, name: Actor['name'], runtime: RuntimeRecord | null,
): Promise<Actor> {
  const context = await browser.newContext({
    baseURL: dest.origin,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    // Mobile para el cliente (PWA) y escritorio para el panel.
    viewport: name === 'cliente' ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    serviceWorkers: 'allow',
    acceptDownloads: false,
  })
  const issues: string[] = []
  const controlledFailures = new Set<string>()
  if (dest.bypassToken) {
    // Cookie limitada a este origen: los fetch del SW no pasan por context.route.
    const bootstrap = await context.request.get('/', {
      headers: { ...apiHeaders(dest), 'x-vercel-set-bypass-cookie': 'true' },
    })
    expect(bootstrap.ok(), 'bootstrap de Protection para el Preview identificado').toBe(true)
  }
  await context.route(WHATSAPP_HOSTS, async (route) => {
    issues.push('Se intentó abrir WhatsApp (bloqueado)')
    await route.abort()
  })
  if (dest.bypassToken) {
    const token = dest.bypassToken
    await context.route((url) => url.hostname === dest.hostname, (route) =>
      route.continue({ headers: { ...route.request().headers(), 'x-vercel-protection-bypass': token } }))
  }
  const page = await context.newPage()
  page.on('pageerror', (error) => issues.push(`${name}: excepción de página: ${redact(error.message).slice(0, 200)}`))
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (url.hostname === dest.hostname && url.pathname.startsWith('/api/') && response.status() >= 500 &&
      !controlledFailures.has(`${response.request().method()} ${url.pathname} ${response.status()}`)) {
      issues.push(`${name}: ${response.request().method()} ${url.pathname} respondió ${response.status()}`)
    }
  })
  // El ID del pedido se asocia a la clave que realmente lo creó (200/201 del POST), no a la última pendiente.
  page.on('response', async (response) => {
    const request = response.request()
    const url = new URL(response.url())
    if (!runtime || request.method() !== 'POST' || url.hostname !== dest.hostname || url.pathname !== '/api/orders') return
    if (response.status() !== 200 && response.status() !== 201) return
    try {
      const key = request.headers()['idempotency-key']
      const parsed = orderConfirmationSchema.safeParse(await response.json())
      const record = key ? runtime.orders.find((order) => order.key === key) : undefined
      if (record && parsed.success) { record.orderId = parsed.data.orderId; saveRuntime(runtime, 'created') }
    } catch {
      // Registro best-effort: el flujo de la prueba no depende de esta lectura.
    }
  })
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!runtime || request.method() !== 'POST' || url.hostname !== dest.hostname || url.pathname !== '/api/orders') return
    const key = request.headers()['idempotency-key']
    if (key && !runtime.orders.some((order) => order.key === key)) {
      runtime.orders.push({ key })
      saveRuntime(runtime, 'creating')
    }
  })
  return { name, context, page, issues, controlledFailures }
}

/** Rellena un campo secreto sin que el log de acciones de Playwright exponga el valor si falla. */
export async function fillSecret(field: Locator, value: string, description: string): Promise<void> {
  try {
    await field.fill(value, { timeout: 15_000 })
  } catch {
    throw new Error(`No se pudo completar el campo seguro «${description}»`)
  }
}

/**
 * Captura saneada: nunca en pantallas de ingreso, con campos enmascarados y solo si el texto visible
 * no contiene credenciales ni datos de la cuenta de test.
 */
export async function sanitizedShot(page: Page, name: string): Promise<string | null> {
  if (/\/(auth|login)(\/|$|\?)/.test(new URL(page.url()).pathname + '/')) return null
  if (await page.locator('input[type="password"]').count() > 0) return null
  const visibleText = await page.locator('body').innerText()
  if (secretValues().some((value) => visibleText.includes(value))) return null
  mkdirSync(ARTIFACTS_DIR, { recursive: true })
  const path = `${ARTIFACTS_DIR}${name}.png`
  await page.screenshot({ path, mask: [page.locator('input, textarea')] })
  return path
}

/** Cabeceras para las llamadas API de un contexto (no pasan por las rutas del navegador). */
export function apiHeaders(dest: Destination): Record<string, string> {
  return {
    Origin: dest.authOrigin,
    'X-Maui-Contract': '2',
    ...(dest.bypassToken ? { 'x-vercel-protection-bypass': dest.bypassToken } : {}),
  }
}

export async function expectSessionClosed(actor: Actor, dest: Destination): Promise<void> {
  const response = await actor.context.request.get('/api/auth/session', { headers: apiHeaders(dest) })
  expect(response.status(), `${actor.name}: la sesión debe estar cerrada en el servidor`).toBe(401)
}

const TRANSIENT_NETWORK = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|socket hang up/i
const MAX_GET_ATTEMPTS = 2

/**
 * GET idempotente con UN reintento, solo ante un corte de red del propio runner (p. ej. ECONNRESET).
 * Una respuesta HTTP, sea cual sea su estado, nunca se reintenta ni se oculta; POST/PATCH no pasan
 * por aquí.
 */
export async function getWithRetry(
  request: Pick<APIRequestContext, 'get'>, path: string, headers: Record<string, string>,
): Promise<APIResponse> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await request.get(path, { headers })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (attempt >= MAX_GET_ATTEMPTS || !TRANSIENT_NETWORK.test(message)) throw error
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
}
