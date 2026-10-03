// Intención de compra: una clave `Idempotency-Key` por intención, estable entre reintentos.
// La misma huella (mismo pedido) reutiliza la clave aunque la página se recargue tras un timeout;
// un pedido distinto genera una clave nueva. Sin esto, un reintento tras timeout podría duplicar el pedido.

import { ApiError } from '../http/apiError'

export interface StoredIntent {
  fingerprint: string
  key: string
}

/** Persistencia mínima de la intención pendiente (no contiene identidad ni datos personales). */
export interface IntentStorage {
  read(): StoredIntent | null
  write(intent: StoredIntent): void
  clear(): void
}

export const INTENT_STORAGE_KEY = 'maui-checkout-intent-v1'

type WebStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Sin `localStorage` (SSR, smoke en Node) la intención solo vive en memoria. */
export const createBrowserIntentStorage = (storage: WebStorage | undefined = globalThis.localStorage as WebStorage | undefined): IntentStorage => ({
  read() {
    try {
      const parsed: unknown = JSON.parse(storage?.getItem(INTENT_STORAGE_KEY) ?? 'null')
      if (typeof parsed !== 'object' || parsed === null) return null
      const { fingerprint, key } = parsed as Partial<StoredIntent>
      return typeof fingerprint === 'string' && typeof key === 'string' ? { fingerprint, key } : null
    } catch {
      return null
    }
  },
  write(intent) {
    try {
      storage?.setItem(INTENT_STORAGE_KEY, JSON.stringify(intent))
    } catch {
      // Sin almacenamiento la clave sigue estable dentro de la sesión (ver `memory` del gestor).
    }
  },
  clear() {
    try {
      storage?.removeItem(INTENT_STORAGE_KEY)
    } catch {
      // nada que limpiar
    }
  },
})

/** JSON con claves ordenadas: dos pedidos iguales producen la misma huella. */
export const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const randomKey = (): string => `maui-${globalThis.crypto.randomUUID()}`

export interface CheckoutIntents {
  /** Clave de la intención de este pedido: la pendiente si la huella coincide; si no, una nueva. */
  keyFor(fingerprint: string): Promise<string>
  /** La intención terminó (confirmada o rechazada de forma definitiva): la próxima será nueva. */
  settle(): void
}

export const createCheckoutIntents = (
  storage: IntentStorage = createBrowserIntentStorage(),
  newKey: () => string = randomKey,
): CheckoutIntents => {
  let memory: StoredIntent | null = null
  let generation = 0
  const digest = async (value: string): Promise<string> => {
    if (!globalThis.crypto?.subtle) throw new ApiError({ kind: 'unavailable', message: 'La compra requiere una conexión segura (HTTPS).' })
    const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return `sha256:${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  }
  const stored = storage.read()
  // La versión anterior guardaba el JSON del pedido. Retirarlo de inmediato, conservando su clave
  // mientras se migra la huella: un timeout anterior no debe convertirse en otro pedido.
  const legacyMarker = 'legacy-key-only'
  const legacy = stored !== null && stored.fingerprint !== legacyMarker && !/^sha256:[a-f0-9]{64}$/.test(stored.fingerprint)
  // Una recarga durante el digest conserva solo la clave, nunca el JSON. El servidor comprobará
  // esa clave también si se intenta otro pedido: responderá conflicto en lugar de duplicar.
  if (legacy) storage.write({ fingerprint: legacyMarker, key: stored.key })
  const initialized = (async () => {
    if (stored === null) return
    const fingerprint = legacy ? await digest(stored.fingerprint) : stored.fingerprint
    if (generation !== 0) return
    memory = { fingerprint, key: stored.key }
    if (legacy) storage.write(memory)
  })().catch(() => { if (generation === 0 && stored) memory = { fingerprint: legacyMarker, key: stored.key } })
  return {
    async keyFor(rawFingerprint) {
      await initialized
      const fingerprint = await digest(rawFingerprint)
      const pending = memory ?? storage.read()
      if (pending?.fingerprint === fingerprint || pending?.fingerprint === legacyMarker) {
        memory = { fingerprint, key: pending.key }
        storage.write(memory)
        return memory.key
      }
      memory = { fingerprint, key: newKey() }
      storage.write(memory)
      return memory.key
    },
    settle() {
      generation += 1
      memory = null
      storage.clear()
    },
  }
}
