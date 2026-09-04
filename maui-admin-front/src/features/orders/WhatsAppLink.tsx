/**
 * @spec ADR-007, §13, TASK-017 — Enlace de WhatsApp al cliente.
 * Recibe `phone` como prop normalizado (sólo dígitos con prefijo país).
 * NO asume origen del número: el caller decide qué phone pasar.
 * Nunca usa merchant.whatsapp — eso es responsabilidad de ConfigPage.
 */
import { MessageCircle } from 'lucide-react'

interface WhatsAppLinkProps {
  phone: string
  message: string
  label?: string
}

export function WhatsAppLink({ phone, message, label = 'WhatsApp' }: WhatsAppLinkProps) {
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition"
    >
      <MessageCircle className="w-4 h-4" aria-hidden />
      {label}
    </a>
  )
}

// Mantener export default para compatibilidad con los imports legacy
// que aún existen en OrderDetail.tsx (no importado por App.tsx pero en disco)
export default WhatsAppLink
