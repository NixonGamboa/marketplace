import { describe, expect, it, vi } from 'vitest'
import { createFetchSmokeClient } from '../../src/infra/seed/smokeClient.js'

describe('cliente HTTP del smoke en Preview', () => {
  it('separa el destino Preview del origen autorizado y mantiene secretos en cabeceras', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }))
    const client = createFetchSmokeClient({
      SMOKE_BASE_URL: 'https://preview.example.com',
      AUTH_ORIGIN: 'https://frontend.example.com',
      SMOKE_BYPASS_TOKEN: 'solo-test',
    }, fetcher)
    await client.request('POST', '/api/auth/login', { body: { password: 'privado' } })
    const [url, init] = fetcher.mock.calls[0]!
    expect(String(url)).toBe('https://preview.example.com/api/auth/login')
    expect(init?.headers).toMatchObject({ origin: 'https://frontend.example.com', 'x-vercel-protection-bypass': 'solo-test' })
    expect(init?.redirect).toBe('manual')
  })

  it('permite declarar el origen del smoke sin alterar AUTH_ORIGIN', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
    await createFetchSmokeClient({ SMOKE_BASE_URL: 'https://preview.example.com', AUTH_ORIGIN: 'https://otro.example.com', SMOKE_AUTH_ORIGIN: 'https://frontend.example.com' }, fetcher).request('GET', '/api/health')
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ origin: 'https://frontend.example.com' })
  })

  it.each(['https://host.example/path', 'https://user:password@host.example', 'http://host.example', 'no-url'])('rechaza un origen inválido antes de enviar credenciales: %s', invalid => {
    const fetcher = vi.fn<typeof fetch>()
    expect(() => createFetchSmokeClient({ SMOKE_BASE_URL: 'https://preview.example.com', SMOKE_AUTH_ORIGIN: invalid }, fetcher)).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
