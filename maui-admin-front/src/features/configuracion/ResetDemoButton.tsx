/**
 * @spec §14, TASK-024, SC-12
 * Botón que limpia todo el estado del demo (localStorage + sessionStorage) tras
 * confirmación y recarga la app. Los seeds se reejecutan en `main.tsx` en el
 * siguiente arranque, dejando el panel como salido de fábrica.
 */
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { ConfirmDialog } from '@/ui/ConfirmDialog'
import { useToast } from '@/ui/Toast'

const KEY_PREFIXES = ['maui-admin-', 'maui-orders']

function clearDemoStorage(): void {
  if (typeof window === 'undefined') return
  const toRemove: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (key && KEY_PREFIXES.some((p) => key.startsWith(p))) toRemove.push(key)
  }
  toRemove.forEach((k) => window.localStorage.removeItem(k))
  window.sessionStorage.clear()
}

export function ResetDemoButton() {
  const [open, setOpen] = useState(false)
  const toast = useToast()

  function handleConfirm() {
    try {
      clearDemoStorage()
      toast.info('Estado del demo limpiado. Recargando…')
      window.setTimeout(() => window.location.reload(), 400)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo limpiar el demo')
      setOpen(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-semibold rounded-lg transition"
      >
        <RotateCcw className="w-4 h-4" aria-hidden />
        Reiniciar demo
      </button>
      <ConfirmDialog
        open={open}
        title="Reiniciar demo"
        message="Se eliminarán todos los pedidos, catálogo editado, horarios y sesiones del demo. La app se recargará con los datos de fábrica. ¿Continuar?"
        confirmLabel="Sí, reiniciar"
        variant="danger"
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
