import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RealOrderReceipt } from './RealOrderReceipt'
import type { ReceiptResult } from '@shared/receipts'
const result: ReceiptResult = {
  receipt: { orderId: 'pedido', status: 'received', rows: ['Pedido pedido', 'Estado: Recibido'], text: '', originalLines: [], currentLines: [], estimatedTotal: 0 },
  contact: null,
}
describe('componente de comprobante real', () => {
  it('presenta carga, error y reintento sin enlazar datos locales', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('privado')).mockResolvedValue(result)
    render(<RealOrderReceipt orderId="pedido" service={{ load }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando')
    await screen.findByRole('alert')
    expect(screen.queryByText('privado')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await screen.findByText('Estado: Recibido')
    expect(screen.queryByRole('link')).toBeNull()
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('ignora respuestas de un pedido anterior al cambiar ID', async () => {
    let finish: (value: ReceiptResult) => void = () => {}
    const first = new Promise<ReceiptResult>((resolve) => { finish = resolve })
    const service = { load: vi.fn().mockReturnValueOnce(first).mockResolvedValue({ ...result, receipt: { ...result.receipt, rows: ['Pedido nuevo'] } }) }
    const view = render(<RealOrderReceipt orderId="anterior" service={service} />)
    view.rerender(<RealOrderReceipt orderId="nuevo" service={service} />)
    await screen.findByText('Pedido nuevo')
    finish(result)
    await waitFor(() => expect(screen.queryByText('Pedido pedido')).toBeNull())
    expect(service.load.mock.calls[0][1].aborted).toBe(true)
  })
})
