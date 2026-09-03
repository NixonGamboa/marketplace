/**
 * @spec TASK-016 — Insignia de estado del pedido.
 * Mantiene el export default para compatibilidad con legado en disco.
 */
import type { OrderStatus } from '@/types/orderService'

interface StatusConfig {
  label: string
  bg: string
  text: string
}

const STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  received:  { label: 'Recibido',   bg: 'bg-blue-100',   text: 'text-blue-700'   },
  confirmed: { label: 'Confirmado', bg: 'bg-yellow-100',  text: 'text-yellow-700' },
  preparing: { label: 'Preparando', bg: 'bg-orange-100',  text: 'text-orange-700' },
  ready:     { label: 'Listo',      bg: 'bg-green-100',   text: 'text-green-700'  },
  delivered: { label: 'Entregado',  bg: 'bg-gray-100',    text: 'text-gray-600'   },
}

interface StatusBadgeProps {
  status: OrderStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  if (!config) return null
  const { label, bg, text } = config

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${bg} ${text}`}
    >
      {label}
    </span>
  )
}

// Export default para compatibilidad con el código legacy en disco
export default StatusBadge
