/**
 * @spec §8, §4 — Sistema de notificaciones toast.
 * Cola máxima de 3 toasts; auto-dismiss en 4s; tipos: success/error/info.
 * ToastProvider debe envolver la app; useToast() expone { success, error, info }.
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  message: string
  type: ToastType
}

export interface ToastContextValue {
  success(message: string): void
  error(message: string): void
  info(message: string): void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null)

const MAX_TOASTS = 3
const AUTO_DISMISS_MS = 4000

// ---------------------------------------------------------------------------
// ToastEntry — single toast visual
// ---------------------------------------------------------------------------

const TYPE_STYLES: Record<ToastType, { bg: string; border: string; icon: ReactNode }> = {
  success: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: <CheckCircle className="w-5 h-5 text-green-600 shrink-0" aria-hidden />,
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: <XCircle className="w-5 h-5 text-red-600 shrink-0" aria-hidden />,
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: <Info className="w-5 h-5 text-blue-600 shrink-0" aria-hidden />,
  },
}

function ToastEntry({
  toast,
  onDismiss,
}: {
  toast: ToastItem
  onDismiss(id: string): void
}) {
  const { bg, border, icon } = TYPE_STYLES[toast.type]

  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS)
    return () => window.clearTimeout(t)
  }, [toast.id, onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-md text-sm font-medium text-gray-800 ${bg} ${border}`}
    >
      {icon}
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 text-gray-400 hover:text-gray-700 transition"
        aria-label="Cerrar notificación"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ToastProvider
// ---------------------------------------------------------------------------

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  // Stable dismiss callback
  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Counter ref avoids closure stale issue with crypto.randomUUID
  const counterRef = useRef(0)

  const push = useCallback((type: ToastType, message: string) => {
    const id = `toast-${Date.now()}-${++counterRef.current}`
    setToasts((prev) => {
      const next = [...prev, { id, message, type }]
      // Keep at most MAX_TOASTS — drop oldest if needed
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next
    })
  }, [])

  const value: ToastContextValue = {
    success: useCallback((msg) => push('success', msg), [push]),
    error:   useCallback((msg) => push('error', msg),   [push]),
    info:    useCallback((msg) => push('info', msg),    [push]),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          aria-label="Notificaciones"
          className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2.5rem)]"
        >
          {toasts.map((t) => (
            <ToastEntry key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// useToast
// ---------------------------------------------------------------------------

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>. Wrap your app with ToastProvider.')
  }
  return ctx
}
