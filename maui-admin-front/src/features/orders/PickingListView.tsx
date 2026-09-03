/**
 * @spec §13, CU-8, US-8, TASK-018 — Vista de picking para preparación de pedidos.
 * Muestra tabla plana de items con cantidades y pesos.
 * Botones de imprimir y copiar como texto.
 */
import { Printer, Clipboard } from 'lucide-react'
import type { AdminOrder } from '@/types/adminOrder'
import { formatPhonePretty } from '@/lib/phone'
import { triggerPrint } from '@/lib/print'
import { copyToClipboard } from '@/lib/clipboard'
import { useToast } from '@/ui/Toast'

interface ResolvedItem {
  id: string
  name: string
  qty: number
  isVariable: boolean
  kilosRequested?: number
  kilosReal?: number
  priceAtMoment: number
}

interface PickingListViewProps {
  order: AdminOrder
  items: ResolvedItem[]
}

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function buildPlainText(order: AdminOrder, items: ResolvedItem[]): string {
  const lines: string[] = []
  lines.push(`=== Lista de picking ===`)
  lines.push(`Pedido: ${order.orderId}`)
  lines.push(`Fecha: ${dateFormatter.format(new Date(order.createdAt))}`)
  lines.push(`Cliente: ${order.customerName}`)
  if (order.customerPhone) {
    lines.push(`Teléfono: ${formatPhonePretty(order.customerPhone)}`)
  }
  lines.push('')
  lines.push('Ítem | Cant. | Peso')
  lines.push('-----|-------|-----')
  for (const item of items) {
    if (item.isVariable) {
      const real = item.kilosReal != null ? `${item.kilosReal} kg` : '—'
      const req = item.kilosRequested != null ? `(pedido: ${item.kilosRequested} kg)` : ''
      lines.push(`${item.name} | — | ${real} ${req}`.trim())
    } else {
      lines.push(`${item.name} | ${item.qty} | —`)
    }
  }
  return lines.join('\n')
}

export function PickingListView({ order, items }: PickingListViewProps) {
  const toast = useToast()

  async function handleCopy() {
    const text = buildPlainText(order, items)
    const ok = await copyToClipboard(text)
    if (ok) {
      toast.success('Copiado al portapapeles')
    } else {
      toast.error('No se pudo copiar. Usa Imprimir.')
    }
  }

  return (
    <div>
      {/* Botones — ocultos en impresión */}
      <div className="flex gap-3 mb-4 no-print">
        <button
          type="button"
          onClick={triggerPrint}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-lg transition"
        >
          <Printer className="w-4 h-4" aria-hidden />
          Imprimir
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:border-gray-400 text-gray-700 text-sm font-medium rounded-lg transition"
        >
          <Clipboard className="w-4 h-4" aria-hidden />
          Copiar como texto
        </button>
      </div>

      {/* Área imprimible */}
      <div id="picking-print">
        {/* Cabecera de la lista */}
        <div className="mb-4">
          <p className="font-bold text-gray-900 text-base">{order.customerName}</p>
          {order.customerPhone && (
            <p className="text-sm text-gray-600">{formatPhonePretty(order.customerPhone)}</p>
          )}
          <p className="text-xs text-gray-500 mt-0.5">
            {order.orderId} · {dateFormatter.format(new Date(order.createdAt))}
          </p>
        </div>

        {/* Tabla de items */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-300 text-left">
              <th className="py-2 pr-4 font-semibold text-gray-700">Producto</th>
              <th className="py-2 pr-4 font-semibold text-gray-700 text-right">Cant.</th>
              <th className="py-2 font-semibold text-gray-700 text-right">Peso</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-2 pr-4 text-gray-800">{item.name}</td>
                <td className="py-2 pr-4 text-right text-gray-700">
                  {item.isVariable ? '—' : item.qty}
                </td>
                <td className="py-2 text-right text-gray-700">
                  {item.isVariable ? (
                    <span>
                      {item.kilosReal != null ? (
                        <strong>{item.kilosReal} kg</strong>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                      {item.kilosRequested != null && (
                        <span className="text-gray-400 text-xs ml-1">
                          (ped: {item.kilosRequested} kg)
                        </span>
                      )}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
