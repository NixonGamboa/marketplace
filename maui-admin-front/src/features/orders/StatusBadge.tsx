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

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { label, bg, text } = STATUS_CONFIG[status]

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${bg} ${text}`}>
      {label}
    </span>
  )
}
