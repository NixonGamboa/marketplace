/**
 * Zona separada para cancelar: el motivo es obligatorio (mínimo 5 caracteres) y viaja con la versión que el
 * personal está viendo; si otro cambio ganó (409), la página se actualiza en lugar de cancelar sobre datos viejos.
 */
import { useState } from 'react'
import type { AdminOrder } from '@/types/adminOrder'
import { orderRepo } from '@/services'
import { errorMessage, isConflict } from '@/lib/errorMessage'
import { useToast } from '@/ui/Toast'

interface CancelSectionProps {
  orderId: string
  by: string
  /** Versión que el usuario está viendo: el servidor rechaza (409) si otro cambio ganó. */
  version: number | undefined
  onCancelled(order: AdminOrder): void
  onConflict(): void
}

export function CancelSection({ orderId, by, version, onCancelled, onConflict }: CancelSectionProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const valid = reason.trim().length >= 5

  async function handleConfirm() {
    if (!valid) return
    setBusy(true)
    try {
      const updated = await orderRepo.cancel(orderId, reason, by, version)
      onCancelled(updated)
      toast.success('Pedido cancelado')
      setOpen(false)
    } catch (err) {
      toast.error(errorMessage(err, 'Error al cancelar'))
      if (isConflict(err)) {
        setOpen(false)
        onConflict()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="cancel-heading" className="rounded-xl border border-red-200 bg-red-50/40 p-4">
      <h3 id="cancel-heading" className="mb-1 text-sm font-semibold text-red-800">Cancelar pedido</h3>
      <p className="mb-3 text-xs text-red-700">Se puede cancelar hasta que el pedido está listo. Quedará registrado el motivo.</p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-10 rounded-lg border border-red-300 bg-white px-4 text-sm font-medium text-red-700 transition hover:bg-red-50"
        >
          Cancelar pedido
        </button>
      ) : (
        <div>
          <label htmlFor="cancel-reason" className="mb-2 block text-sm font-medium text-red-800">
            Motivo de cancelación (mín. 5 caracteres)
          </label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-red-200 p-2 text-sm focus:border-red-400 focus:outline-none"
            placeholder="Ej: Cliente no contestó, producto sin stock..."
          />
          {!valid && reason.length > 0 && <p className="mt-1 text-xs text-red-600">Mínimo 5 caracteres</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={!valid || busy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Cancelando...' : 'Confirmar cancelación'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setReason('') }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Volver
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
