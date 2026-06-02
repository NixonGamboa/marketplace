import type { OrderStatus } from '@/types/order'
import { buildWhatsAppLink } from '@/config/whatsapp'
import { MessageCircle } from 'lucide-react'

interface WhatsAppLinkProps {
  customerName: string
  orderId: string
  status: Exclude<OrderStatus, 'received'>
}

export default function WhatsAppLink({ customerName, orderId, status }: WhatsAppLinkProps) {
  const href = buildWhatsAppLink(status, customerName, orderId)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-full font-medium transition"
    >
      <MessageCircle className="w-5 h-5" aria-hidden="true" />
      Enviar WhatsApp a {customerName}
    </a>
  )
}
