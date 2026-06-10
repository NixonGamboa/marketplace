import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus } from 'lucide-react'
import { formatPrice } from '@/shared/utils/formatPrice'

interface VariableWeightSheetProps {
  open: boolean
  onClose: () => void
  productName: string
  pricePerUnit: number // precio por kilogramo
  currency?: string
  initialKilos?: number
  onConfirm: (kilos: number) => void
}

const MIN_KG = 0.25
const MAX_KG = 5
const STEP = 0.25

export function VariableWeightSheet({
  open,
  onClose,
  productName,
  pricePerUnit,
  currency = 'COP',
  initialKilos,
  onConfirm,
}: VariableWeightSheetProps) {
  const [kilos, setKilos] = useState(initialKilos ?? 0.5)
  const titleId = useId()

  // Bloquear scroll del body cuando el sheet está abierto
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Sincroniza el peso al momento de abrir; no durante la edición activa
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setKilos(initialKilos ?? 0.5) }, [open])

  if (!open) return null

  const handleDecrement = () =>
    setKilos((k) => Math.max(MIN_KG, parseFloat((k - STEP).toFixed(2))))

  const handleIncrement = () =>
    setKilos((k) => Math.min(MAX_KG, parseFloat((k + STEP).toFixed(2))))

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/40 animate-fade-in"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-elevated max-w-[640px] mx-auto animate-slide-in-bottom"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3" aria-hidden="true" />

        {/* Título */}
        <h3 id={titleId} className="px-5 mt-3 text-base font-bold text-brand-dark">
          {productName}
        </h3>

        {/* Subtítulo */}
        <p className="px-5 mt-1 text-xs text-brand-muted">
          Indica cuántos kilogramos quieres
        </p>

        {/* Selector de libras */}
        <div className="px-5 mt-4">
          <div className="flex items-center justify-center gap-4">
            {/* Decrementar */}
            <button
              type="button"
              aria-label="Disminuir kilogramos"
              onClick={handleDecrement}
              disabled={kilos <= MIN_KG}
              className="w-12 h-12 rounded-full bg-brand-primary-light text-brand-primary flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors hover:bg-brand-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
            >
              <Minus size={22} aria-hidden="true" />
            </button>

            {/* Valor */}
            <span className="text-3xl font-extrabold text-brand-dark tabular-nums min-w-[80px] text-center">
              {kilos} kg
            </span>

            {/* Incrementar */}
            <button
              type="button"
              aria-label="Aumentar kilogramos"
              onClick={handleIncrement}
              disabled={kilos >= MAX_KG}
              className="w-12 h-12 rounded-full bg-brand-primary-light text-brand-primary flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors hover:bg-brand-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
            >
              <Plus size={22} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Precio estimado */}
        <p className="px-5 mt-4 text-sm text-brand-muted">
          Precio estimado:{' '}
          <span className="font-bold text-brand-primary">
            {formatPrice(kilos * pricePerUnit, currency)}
          </span>
        </p>

        {/* Nota */}
        <p className="px-5 mt-1 text-[11px] text-brand-muted">
          El precio final se ajusta tras el pesaje en tienda.
        </p>

        {/* CTA */}
        <button
          type="button"
          onClick={() => {
            onConfirm(kilos)
            onClose()
          }}
          className="mx-5 mt-5 w-[calc(100%-2.5rem)] py-3 rounded-xl bg-brand-primary hover:bg-brand-primary-dark text-white font-semibold text-sm shadow-brand-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
        >
          Agregar {kilos} kg
        </button>
      </div>
    </>,
    document.body,
  )
}
