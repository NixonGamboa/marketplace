import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { catalogQueryKey, useCatalogCachedAt } from '@/hooks/useCatalog'
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'
import { formatAge } from '@/shared/utils/formatAge'

const AGE_REFRESH_MS = 60_000

/**
 * Avisa cuando no hay red o cuando el catálogo mostrado es una copia guardada, con su antigüedad.
 * Al recuperar la conexión vuelve a pedir el catálogo al servidor; precios, disponibilidad y pedido
 * se validan siempre en el servidor, la copia solo permite seguir mirando.
 */
export function ConnectivityBanner() {
  const online = useOnlineStatus()
  const cachedAt = useCatalogCachedAt()
  const client = useQueryClient()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (cachedAt === null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), AGE_REFRESH_MS)
    return () => clearInterval(timer)
  }, [cachedAt])

  useEffect(() => {
    if (online && cachedAt !== null) void client.invalidateQueries({ queryKey: catalogQueryKey() })
  }, [online, cachedAt, client])

  if (online && cachedAt === null) return null

  const refresh = () => void client.invalidateQueries({ queryKey: catalogQueryKey() })

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-start gap-1 px-4 py-2 text-sm bg-brand-warning-bg text-brand-dark border-b border-brand-warning/30 sm:flex-row sm:items-center sm:gap-3">
      <span className="font-semibold">{online ? 'Catálogo guardado' : 'Sin conexión'}</span>
      <span className="text-brand-dark/80 sm:min-w-0 sm:flex-1">
        {cachedAt !== null
          ? `Estás viendo el catálogo guardado ${formatAge(cachedAt, now)}. Precios y disponibilidad pueden haber cambiado; al confirmar el pedido se validan con la tienda.`
          : 'Tu carrito se conserva. Algunas pantallas cargarán cuando vuelva la señal.'}
      </span>
      {online && (
        <button type="button" onClick={refresh} className="font-semibold underline underline-offset-2 py-1">
          Actualizar
        </button>
      )}
    </div>
  )
}
