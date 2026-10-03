import type { OrderStatus } from '@/types/orderService'

// ── Date helper ───────────────────────────────────────────────────────────────

export function formatOrderDate(iso: string): string {
  const created = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - created.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)

  if (diffMs < 24 * 3_600_000) {
    if (diffMinutes < 60) {
      return diffMinutes <= 1 ? 'Hace 1 minuto' : `Hace ${diffMinutes} minutos`
    }
    return diffHours === 1 ? 'Hace 1 hora' : `Hace ${diffHours} horas`
  }

  return created.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// ── Status badge config ───────────────────────────────────────────────────────

interface BadgeConfig {
  label: string
  className: string
}

export const STATUS_BADGE: Record<OrderStatus, BadgeConfig> = {
  received:  { label: 'Recibido',   className: 'bg-blue-100 text-blue-700'     },
  confirmed: { label: 'Confirmado', className: 'bg-yellow-100 text-yellow-700' },
  preparing: { label: 'Preparando', className: 'bg-orange-100 text-orange-700' },
  ready:     { label: 'Listo',      className: 'bg-green-100 text-green-700'   },
  in_delivery: { label: 'En camino', className: 'bg-purple-100 text-purple-700' },
  delivered: { label: 'Entregado',  className: 'bg-gray-100 text-gray-600'     },
  cancelled: { label: 'Cancelado',  className: 'bg-red-100 text-red-700'       },
}

export const formatPrice = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
