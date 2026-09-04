/**
 * @spec CU-10, TASK-021
 * Toggle inline de disponibilidad de un producto. Mutación optimista.
 */
import { useState } from 'react'
import { catalogRepo } from '@/services'
import { useToast } from '@/ui/Toast'

interface StockToggleProps {
  productId: string
  inStock: boolean
  by: string
  onChanged(next: boolean): void
}

export function StockToggle({ productId, inStock, by, onChanged }: StockToggleProps) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function handleToggle() {
    const next = !inStock
    setBusy(true)
    // Optimista: refleja el cambio inmediatamente en la lista
    onChanged(next)
    try {
      await catalogRepo.toggleStock(productId, next, by)
    } catch (err) {
      onChanged(!next) // revertir
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar el stock')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={inStock}
      onClick={handleToggle}
      disabled={busy}
      title={inStock ? 'Disponible — click para marcar agotado' : 'Agotado — click para marcar disponible'}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
        inStock ? 'bg-green-500' : 'bg-gray-300'
      } disabled:opacity-50`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          inStock ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
