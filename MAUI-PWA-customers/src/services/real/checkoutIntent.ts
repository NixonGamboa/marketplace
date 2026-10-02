// Intención de compra: una clave `Idempotency-Key` por intención, estable entre reintentos.
// La misma huella (mismo pedido) reutiliza la clave aunque la página se recargue tras un timeout;
// un pedido distinto genera una clave nueva. Sin esto, un reintento tras timeout podría duplicar el pedido.

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
  keyFor(fingerprint: string): string
  /** La intención terminó (confirmada o rechazada de forma definitiva): la próxima será nueva. */
  settle(): void
}

export const createCheckoutIntents = (
  storage: IntentStorage = createBrowserIntentStorage(),
  newKey: () => string = randomKey,
): CheckoutIntents => {
  let memory: StoredIntent | null = null
  return {
    keyFor(fingerprint) {
      const pending = memory ?? storage.read()
      if (pending?.fingerprint === fingerprint) {
        memory = pending
        return pending.key
      }
      memory = { fingerprint, key: newKey() }
      storage.write(memory)
      return memory.key
    },
    settle() {
      memory = null
      storage.clear()
    },
  }
}
