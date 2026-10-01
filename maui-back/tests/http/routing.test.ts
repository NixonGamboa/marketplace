import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pathToRegexp } from 'path-to-regexp'

const config = JSON.parse(readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8')) as {
  rewrites: { source: string; destination: string }[]
}
// Vercel compila sources con slash final estricto; usar el mismo criterio.
const rewrites = config.rewrites.map(route => ({ ...route, expression: pathToRegexp(route.source, [], { strict: true }) }))
const fallback = (path: string) => rewrites.find(route => route.expression.test(path))?.destination

describe('fallbacks de routing después del filesystem de Vercel', () => {
  it.each(['/api', '/api/', '/api/no-existe', '/api/no-existe/', '/api/orders/desconocido/ruta'])('%s usa handler JSON 404', path => {
    expect(fallback(path)).toBe('/api/not-found')
  })

  it.each(['/admin', '/admin/', '/admin/orders/123', '/admin/orders/123/', '/admin/configuracion'])('%s conserva SPA admin', path => {
    expect(fallback(path)).toBe('/admin/index.html')
  })

  it.each(['/', '/orders/123', '/pasillos/frutas', '/administer', '/apiary'])('%s conserva SPA PWA', path => {
    expect(fallback(path)).toBe('/index.html')
  })

  it('el fallback general no captura API, admin o helpers', () => {
    const pwa = rewrites.find(route => route.destination === '/index.html')?.expression
    expect(pwa).toBeDefined()
    for (const path of ['/api', '/api/', '/api/health', '/admin', '/admin/assets/app.js', '/_lib']) {
      expect(pwa?.test(path)).toBe(false)
    }
  })
})
