/** Sondeo sin solapamientos; pausa fuera de pantalla o sin red y descarta respuestas abortadas. */
export function startOrderPolling(
  load: (signal: AbortSignal) => Promise<void>,
  onError: (error: unknown) => void,
  intervalMs: number | null,
) {
  let stopped = false
  let running = false
  let reconcile = false
  let controller: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const active = () => !stopped && document.visibilityState !== 'hidden' && navigator.onLine !== false
  const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined }
  const refresh = async () => {
    if (!active()) return
    if (running) { reconcile = true; return }
    clearTimer()
    running = true
    const request = new AbortController()
    controller = request
    try {
      await load(request.signal)
    } catch (error) {
      if (!stopped && !request.signal.aborted) onError(error)
    } finally {
      running = false
      if (active()) {
        if (reconcile) { reconcile = false; void refresh() }
        else if (intervalMs !== null) timer = setTimeout(() => void refresh(), intervalMs)
      }
    }
  }
  const changed = () => {
    clearTimer()
    if (!active()) { reconcile = false; controller?.abort() }
    else void refresh()
  }
  document.addEventListener('visibilitychange', changed)
  window.addEventListener('online', changed)
  window.addEventListener('offline', changed)
  window.addEventListener('focus', changed)
  void refresh()
  return {
    refresh: () => { void refresh() },
    stop: () => {
      stopped = true
      clearTimer()
      controller?.abort()
      document.removeEventListener('visibilitychange', changed)
      window.removeEventListener('online', changed)
      window.removeEventListener('offline', changed)
      window.removeEventListener('focus', changed)
    },
  }
}

/** Configuración de seguimiento: entre 30 y 60 s; valores inválidos vuelven a 30 s. */
export const orderPollingInterval = (value = import.meta.env.VITE_ORDER_POLL_INTERVAL_MS): number => {
  const ms = Number(value)
  return Number.isFinite(ms) && ms >= 30_000 && ms <= 60_000 ? ms : 30_000
}

export interface VersionedOrder { orderId: string; version?: number }
export const latestOrder = <T extends VersionedOrder>(previous: T | undefined | null, next: T): T =>
  previous?.orderId === next.orderId && previous.version !== undefined && next.version !== undefined && previous.version >= next.version
    ? previous : next

/** Conserva identidad para versiones iguales y elimina duplicados entre páginas. */
export function latestOrderList<T extends VersionedOrder>(previous: readonly T[], next: readonly T[]): T[] {
  const known = new Map(previous.map((order) => [order.orderId, order]))
  const result = new Map<string, T>()
  for (const order of next) result.set(order.orderId, latestOrder(result.get(order.orderId) ?? known.get(order.orderId), order))
  const values = [...result.values()]
  return values.length === previous.length && values.every((order, index) => order === previous[index]) ? previous as T[] : values
}
