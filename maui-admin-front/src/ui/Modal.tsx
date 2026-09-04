/**
 * @spec §8 — Modal genérico con overlay, Esc-to-close, click-outside-to-close.
 * Renderiza via createPortal para no interferir con el stacking context del layout.
 * Devuelve el foco al elemento que lo abrió al cerrarse (accesibilidad WCAG 2.2 AA).
 */
import {
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose(): void
  title: string
  children: ReactNode
  /** Ancho máximo del modal — por defecto 'max-w-md' */
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASS: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  // Return focus to opener on close
  const openerRef = useRef<Element | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement
      // Move focus into the modal panel
      panelRef.current?.focus()
    } else if (openerRef.current instanceof HTMLElement) {
      openerRef.current.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative w-full ${SIZE_CLASS[size]} bg-white rounded-2xl shadow-xl outline-none`}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <h2 id="modal-title" className="text-base font-semibold text-gray-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
