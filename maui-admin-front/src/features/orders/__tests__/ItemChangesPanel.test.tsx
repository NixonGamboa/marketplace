/**
 * Quitar/sustituir ítems con repositories simulados (no es evidencia de cierre real):
 * contacto obligatorio con `call_me`, forma del cambio, versión y conflicto 409.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AdminOrder } from '@/types/adminOrder'
import type { Product } from '@/types/catalog'
import { ApiError } from '@/services/http/apiError'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))

vi.mock('@/services', () => ({ catalogRepo: { listProducts: vi.fn() }, serverOrderRepo: { changeItems: vi.fn() } }))
vi.mock('@/ui/Toast', () => ({ useToast: () => toast }))

import { ItemChangesPanel } from '../ItemChangesPanel'

const order = (overrides: Partial<AdminOrder> = {}): AdminOrder => ({
  orderId: 'ord-1',
  userId: 'usr-cli',
  status: 'preparing',
  version: 7,
  items: [
    { id: 'prod-leche', name: 'Leche entera', qty: 2, priceAtMoment: 5000 },
    { id: 'prod-pan', name: 'Pan', qty: 1, priceAtMoment: 3000 },
  ],
  deliveryType: 'pickup',
  deliveryData: {},
  substitutionPreference: 'call_me',
  customerName: 'Ana',
  estimatedTotal: 13000,
  createdAt: '2026-10-02T15:00:00.000Z',
  ...overrides,
})

const product = (overrides: Partial<Product>): Product => ({
  id: 'prod-x', name: 'X', price: 1000, unit: '1 u', imageUrl: '/x.png', categoryId: 'cat', inStock: true, is_variable_weight: false, ...overrides,
})

const catalog: Product[] = [
  product({ id: 'prod-leche', name: 'Leche entera' }),
  product({ id: 'prod-arepa', name: 'Arepas', unit: '5 u' }),
  product({ id: 'prod-agotado', name: 'Agotado', inStock: false }),
  product({ id: 'prod-oculto', name: 'Oculto', ...({ active: false } as object) }),
  product({ id: 'prod-queso', name: 'Queso', unit: 'kg', is_variable_weight: true }),
]
const names = { 'prod-leche': 'Leche entera', 'prod-pan': 'Pan' }

const setup = (o: AdminOrder = order()) => {
  const applyChanges = vi.fn()
  const onApplied = vi.fn()
  const onConflict = vi.fn()
  render(<ItemChangesPanel order={o} names={names} onApplied={onApplied} onConflict={onConflict} loadProducts={async () => catalog} applyChanges={applyChanges} />)
  return { applyChanges, onApplied, onConflict }
}

describe('ItemChangesPanel (simulado)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('con call_me exige declarar el contacto antes de quitar y no llama al servidor sin él', async () => {
    const { applyChanges } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Pan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cambio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirma que hablaste con el cliente')
    expect(applyChanges).not.toHaveBeenCalled()
  })

  it('quita un ítem con la versión leída y customerContacted', async () => {
    const { applyChanges, onApplied } = setup()
    const updated = order({ version: 8 })
    applyChanges.mockResolvedValue(updated)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Pan' }))
    fireEvent.click(screen.getByLabelText(/Hablé con el cliente/))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cambio' }))
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(updated))
    expect(applyChanges).toHaveBeenCalledWith('ord-1', [{ type: 'remove', itemId: 'prod-pan', customerContacted: true }], 7)
  })

  it('sin call_me el contacto es opcional y no se envía si no se marca', async () => {
    const { applyChanges } = setup(order({ substitutionPreference: 'remove' }))
    applyChanges.mockResolvedValue(order({ version: 8 }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Pan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cambio' }))
    await waitFor(() => expect(applyChanges).toHaveBeenCalledWith('ord-1', [{ type: 'remove', itemId: 'prod-pan' }], 7))
  })

  it('solo ofrece sustitutos disponibles, visibles y que no estén ya en el pedido', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Sustituir Pan' }))
    const select = await screen.findByLabelText('Producto sustituto')
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.textContent)
    expect(options).toEqual(['Elige un producto…', 'Arepas (5 u)', 'Queso (kg)'])
  })

  it('sustituye por un producto de peso fijo con cantidad y de peso variable con kilos', async () => {
    const { applyChanges } = setup(order({ substitutionPreference: 'similar' }))
    applyChanges.mockResolvedValue(order({ version: 8 }))
    fireEvent.click(screen.getByRole('button', { name: 'Sustituir Pan' }))
    fireEvent.change(await screen.findByLabelText('Producto sustituto'), { target: { value: 'prod-arepa' } })
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cambio' }))
    await waitFor(() => expect(applyChanges).toHaveBeenCalledWith('ord-1', [{ type: 'substitute', itemId: 'prod-pan', productId: 'prod-arepa', qty: 2 }], 7))

    fireEvent.click(screen.getByRole('button', { name: 'Sustituir Pan' }))
    fireEvent.change(await screen.findByLabelText('Producto sustituto'), { target: { value: 'prod-queso' } })
    fireEvent.change(screen.getByLabelText('Kilos solicitados'), { target: { value: '0.75' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cambio' }))
    await waitFor(() => expect(applyChanges).toHaveBeenLastCalledWith('ord-1', [{ type: 'substitute', itemId: 'prod-pan', productId: 'prod-queso', qty: 1, kilosRequested: 0.75 }], 7))
  })

  it('un 409 cierra el diálogo, avisa y pide recargar; otro error se muestra dentro sin cerrar', async () => {
    const { applyChanges, onConflict, onApplied } = setup(order({ substitutionPreference: 'remove' }))
    applyChanges.mockRejectedValueOnce(new ApiError({ kind: 'validation', status: 400, message: 'No se puede quitar el último ítem.' }))
      .mockRejectedValueOnce(new ApiError({ kind: 'conflict', status: 409, message: 'cambió' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Pan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cambio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se puede quitar el último ítem.')
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cambio' }))
    await waitFor(() => expect(onConflict).toHaveBeenCalledTimes(1))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('El pedido cambió'))
    expect(onApplied).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('un pedido sin versión no se modifica', async () => {
    const { applyChanges } = setup(order({ version: undefined, substitutionPreference: 'remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Pan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cambio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no trae versión')
    expect(applyChanges).not.toHaveBeenCalled()
  })
})
