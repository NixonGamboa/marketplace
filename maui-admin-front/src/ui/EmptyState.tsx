/**
 * @spec §8 — Estado vacío reutilizable con icono, título, descripción y acción opcional.
 */
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white py-16 px-6 text-center">
      {icon && (
        <span className="text-gray-300" aria-hidden>
          {icon}
        </span>
      )}
      <p className="text-base font-semibold text-gray-700">{title}</p>
      {description && <p className="text-sm text-gray-500 max-w-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
