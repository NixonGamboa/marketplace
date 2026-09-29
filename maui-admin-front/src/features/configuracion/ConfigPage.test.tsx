import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MerchantConfig } from '@/types/merchant'
import { ConfigPage } from './ConfigPage'
import { merchantRepo } from '@/services'

const toastError = vi.fn()

vi.mock('@/services', () => ({
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
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('distinto al número de ejemplo'))
  })
})
