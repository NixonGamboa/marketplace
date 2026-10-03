import { describe, expect, it } from 'vitest'
import { createBrowserIntentStorage, createCheckoutIntents, INTENT_STORAGE_KEY, stableStringify } from '../checkoutIntent'

const storage = () => {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) } }
}
const request = stableStringify({ userId: 'cuenta-privada', customerName: 'Persona Privada',
  customerPhone: '573001234567', deliveryData: { address: 'Calle privada 42' }, items: [{ id: 'leche', qty: 1 }] })

describe('intención pendiente sin datos personales persistidos', () => {
  it('guarda únicamente digest y clave; recarga y carreras conservan la intención', async () => {
    const web = storage()
    const intents = createCheckoutIntents(createBrowserIntentStorage(web), () => 'clave-original')
    expect(await Promise.all([intents.keyFor(request), intents.keyFor(request)])).toEqual(['clave-original', 'clave-original'])
    const saved = JSON.parse(web.getItem(INTENT_STORAGE_KEY)!) as { fingerprint: string; key: string }
    expect(saved).toEqual({ fingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/), key: 'clave-original' })
    for (const privateValue of ['cuenta-privada', 'Persona Privada', '573001234567', 'Calle privada 42']) {
      expect(web.getItem(INTENT_STORAGE_KEY)).not.toContain(privateValue)
    }
    const reloaded = createCheckoutIntents(createBrowserIntentStorage(web), () => 'otra-clave')
    expect(await reloaded.keyFor(request)).toBe('clave-original')
    expect(await reloaded.keyFor(`${request}distinto`)).toBe('otra-clave')
    reloaded.settle()
    expect(web.getItem(INTENT_STORAGE_KEY)).toBeNull()
  })

  it('retira el JSON antiguo al iniciar y migra su clave sin duplicar el pedido del timeout', async () => {
    const web = storage()
    web.setItem(INTENT_STORAGE_KEY, JSON.stringify({ fingerprint: request, key: 'clave-del-timeout' }))
    const intents = createCheckoutIntents(createBrowserIntentStorage(web), () => 'no-debe-usarse')
    expect(web.getItem(INTENT_STORAGE_KEY)).toBe(JSON.stringify({ fingerprint: 'legacy-key-only', key: 'clave-del-timeout' }))
    expect(await intents.keyFor(request)).toBe('clave-del-timeout')
    expect(web.getItem(INTENT_STORAGE_KEY)).not.toContain('Persona Privada')
  })

  it('settle durante la migración no resucita la clave ni los datos antiguos', async () => {
    const web = storage()
    web.setItem(INTENT_STORAGE_KEY, JSON.stringify({ fingerprint: request, key: 'vieja' }))
    const intents = createCheckoutIntents(createBrowserIntentStorage(web), () => 'nueva')
    intents.settle()
    expect(await intents.keyFor(request)).toBe('nueva')
  })

  it('una recarga durante la migración conserva la clave sin recuperar el JSON privado', async () => {
    const web = storage()
    web.setItem(INTENT_STORAGE_KEY, JSON.stringify({ fingerprint: 'legacy-key-only', key: 'clave-del-timeout' }))
    const reloaded = createCheckoutIntents(createBrowserIntentStorage(web), () => 'no-debe-usarse')
    expect(await reloaded.keyFor(request)).toBe('clave-del-timeout')
    expect(web.getItem(INTENT_STORAGE_KEY)).not.toContain('Persona Privada')
  })
})
