import { useEffect, useState } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'

/** El estado cargado se conserva al pausar; se cancelan requests y se reconcilia al regresar. */
export function useOrderPollingAvailability(queryKey: QueryKey) {
  const client = useQueryClient()
  const available = () => document.visibilityState !== 'hidden' && navigator.onLine !== false
  const [active, setActive] = useState(available)
  const key = JSON.stringify(queryKey)
  useEffect(() => {
    const parsedKey: QueryKey = JSON.parse(key)
    const changed = () => {
      const next = available()
      if (!next) void client.cancelQueries({ queryKey: parsedKey, exact: true })
      setActive(next)
    }
    document.addEventListener('visibilitychange', changed)
    window.addEventListener('online', changed)
    window.addEventListener('offline', changed)
    return () => {
      void client.cancelQueries({ queryKey: parsedKey, exact: true })
      document.removeEventListener('visibilitychange', changed)
      window.removeEventListener('online', changed)
      window.removeEventListener('offline', changed)
    }
  }, [client, key])
  return active
}
