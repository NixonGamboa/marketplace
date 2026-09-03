/**
 * @spec §11, TASK-023, SC-9
 * Banner en AppShell que refleja `storeRepo.isOpenNow()`. Refresh cada 30s y en
 * cada evento `storage` para reaccionar rápido cuando el owner cambia el override.
 */
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { storeStatusRepo } from '@/services'

const REFRESH_MS = 30_000

export function StoreOpenBanner() {
  const [isOpen, setIsOpen] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const open = await storeStatusRepo.isOpenNow()
        if (!cancelled) setIsOpen(open)
      } catch {
        if (!cancelled) setIsOpen(null)
      }
    }

    refresh()
    const timer = window.setInterval(refresh, REFRESH_MS)
    function handleStorage(e: StorageEvent) {
      if (e.key === 'maui-admin-store') refresh()
    }
    window.addEventListener('storage', handleStorage)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  if (isOpen !== false) return null

  return (
    <div
      role="alert"
      className="bg-red-50 border-b border-red-200 px-5 py-2 flex items-center gap-2 text-sm text-red-700"
    >
      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
      <span className="font-semibold">Tienda cerrada.</span>
      <span className="hidden sm:inline">
        Los pedidos entrantes no se están tomando. Revisa el override o el horario en /tienda.
      </span>
    </div>
  )
}
