/**
 * @spec §10, ADR-003, TASK-019 — Hook que detecta pedidos nuevos cross-tab.
 * Escucha el evento `storage` filtrado a la key `maui-orders`.
 * NO usa polling (ADR-003). Mantiene un set de ids conocidos en sessionStorage
 * para evitar dobles alertas entre re-renders y recargas.
 */
import { useEffect, useRef } from 'react'
import type { Order } from '@/types/orderService'

const STORAGE_KEY = 'maui-orders'
const KNOWN_IDS_KEY = 'maui-admin-known-order-ids'

function readKnownIds(): Set<string> {
  if (typeof sessionStorage === 'undefined') return new Set()
  try {
    const raw = sessionStorage.getItem(KNOWN_IDS_KEY)
    const arr: unknown = JSON.parse(raw ?? '[]')
    return new Set(Array.isArray(arr) ? (arr as string[]) : [])
  } catch {
    return new Set()
  }
}

function persistKnownIds(known: Set<string>): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(KNOWN_IDS_KEY, JSON.stringify([...known]))
}

function parseOrdersFromValue(value: string | null): Order[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return []
    return Object.values(parsed) as Order[]
  } catch {
    return []
  }
}

/**
 * Escucha cambios en `localStorage['maui-orders']` desde otras pestañas.
 * Por cada pedido con `status === 'received'` que no se haya visto antes,
 * llama `onNew(order)`.
 *
 * Strict Mode safe: el ref `knownRef` preserva el estado a través del
 * doble-montaje en desarrollo.
 */
export function useNewOrdersWatcher(onNew: (order: Order) => void): void {
  // Ref para el set de ids conocidos — sobrevive el re-mount de Strict Mode
  const knownRef = useRef<Set<string>>(readKnownIds())
  // Ref estable para el callback — evita re-registrar el listener en cada render
  const onNewRef = useRef(onNew)
  onNewRef.current = onNew

  useEffect(() => {
    const known = knownRef.current

    function processOrders(orders: Order[]): void {
      let changed = false
      for (const order of orders) {
        if (!known.has(order.orderId)) {
          known.add(order.orderId)
          changed = true
          if (order.status === 'received') {
            onNewRef.current(order)
          }
        }
      }
      if (changed) persistKnownIds(known)
    }

    // Carga inicial: marcar los pedidos ya presentes sin alertar
    const initial = parseOrdersFromValue(
      typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    )
    // Sólo marcar como conocidos si no estaban ya — sin llamar onNew
    for (const order of initial) {
      if (!known.has(order.orderId)) {
        known.add(order.orderId)
      }
    }
    persistKnownIds(known)

    function handleStorage(e: StorageEvent): void {
      if (e.key !== STORAGE_KEY) return
      const orders = parseOrdersFromValue(e.newValue)
      processOrders(orders)
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, []) // sin deps — el callback se lee desde el ref
}
