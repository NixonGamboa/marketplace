import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PaymentSelector } from './PaymentSelector'
import { useCheckoutStore } from './checkoutStore'

afterEach(() => { cleanup(); useCheckoutStore.getState().reset() })
describe('selector de pago', () => {
  it('grupo anunciado, efectivo por defecto y selección conservada al remontar', () => {
    const first = render(<PaymentSelector disabled={false} />)
    expect(screen.getByRole('group', { name: '¿Cómo quieres pagar?' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Efectivo/ })).toBeChecked()
    fireEvent.click(screen.getByText('Escaneas el código QR del negocio.'))
    expect(screen.getByRole('radio', { name: /Código QR/ })).toBeChecked()
    first.unmount()
    render(<PaymentSelector disabled={false} />)
    expect(screen.getByRole('radio', { name: /Código QR/ })).toBeChecked()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getAllByRole('radio').every((radio) => radio.closest('label')?.className.includes('min-h-11'))).toBe(true)
    act(() => useCheckoutStore.getState().setDeliveryMode('pickup'))
    expect(screen.getByText(/Pagas el total final al recoger tu pedido/)).toBeInTheDocument()
  })
  it('bloquea cambios durante envío', () => {
    render(<PaymentSelector disabled />)
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled()
  })
})
