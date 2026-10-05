import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MerchantConfig } from '@/types/merchant'
import { ConfigPage } from './ConfigPage'
import { merchantRepo } from '@/services'

const toastError = vi.fn()

vi.mock('@/services', () => ({
  isDemoMode: true,
  merchantRepo: { get: vi.fn(), update: vi.fn() },
}))
vi.mock('@/auth/useSession', () => ({
  useSession: () => ({ session: { user: { merchantId: 'mch_lechemiel', email: 'admin@ejemplo.com' } } }),
}))
vi.mock('@/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: toastError, info: vi.fn() }),
}))
vi.mock('./ResetDemoButton', () => ({ ResetDemoButton: () => null }))

const config: MerchantConfig = {
  merchantId: 'mch_lechemiel',
  name: 'Leche y Miel',
  whatsapp: '573000000000',
  address: 'Dolores',
  updatedAt: '2026-09-29T00:00:00.000Z',
}

describe('WhatsApp del aliado en configuración', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(merchantRepo.get).mockResolvedValue(config)
    vi.mocked(merchantRepo.update).mockImplementation(async (next) => next)
  })

  it('guarda un celular local con el prefijo 57', async () => {
    render(<ConfigPage />)
    const input = await screen.findByLabelText('WhatsApp del negocio')
    fireEvent.change(input, { target: { value: '301 555 0101' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(merchantRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ whatsapp: '573015550101' }),
      'admin@ejemplo.com',
    ))
  })

  it('rechaza el número de ejemplo y no guarda la configuración', async () => {
    render(<ConfigPage />)
    await screen.findByLabelText('WhatsApp del negocio')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(merchantRepo.update).not.toHaveBeenCalled()
    const input = screen.getByLabelText('WhatsApp del negocio')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'cfg-whatsapp-error')
    expect(document.getElementById('cfg-whatsapp-error')).toHaveTextContent('distinto al número de ejemplo')
    expect(input).toHaveFocus()
  })

  it('exige el mínimo de 2 caracteres del nombre (con trim) como el contrato de la tienda', async () => {
    render(<ConfigPage />)
    const name = await screen.findByLabelText('Nombre del negocio')
    fireEvent.change(name, { target: { value: ' A ' } })
    fireEvent.change(screen.getByLabelText('WhatsApp del negocio'), { target: { value: '3015550101' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(document.getElementById('cfg-name-error')).toHaveTextContent('mínimo 2 caracteres')
    expect(merchantRepo.update).not.toHaveBeenCalled()
  })

  it('marca nombre y dirección vacíos, enfoca el primero y se recupera al corregir', async () => {
    render(<ConfigPage />)
    const name = await screen.findByLabelText('Nombre del negocio')
    const address = screen.getByLabelText('Dirección')
    fireEvent.change(name, { target: { value: '  ' } })
    fireEvent.change(address, { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('WhatsApp del negocio'), { target: { value: '3015550101' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(merchantRepo.update).not.toHaveBeenCalled()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveFocus()
    expect(address).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('WhatsApp del negocio')).toHaveAttribute('aria-invalid', 'false')

    fireEvent.change(name, { target: { value: 'Leche y Miel' } })
    fireEvent.change(address, { target: { value: 'Dolores, Tolima' } })
    expect(name).toHaveAttribute('aria-invalid', 'false')
    expect(address).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(merchantRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Leche y Miel', address: 'Dolores, Tolima', whatsapp: '573015550101' }),
      'admin@ejemplo.com',
    ))
  })
})
