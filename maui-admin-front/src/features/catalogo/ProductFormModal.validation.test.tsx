import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '@/types/catalog'
import { ProductFormModal } from './ProductFormModal'

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/services', () => ({ catalogRepo: { upsertProduct: mocks.upsert } }))
vi.mock('@/services/productImageService', () => ({ uploadProductImageFile: vi.fn() }))
vi.mock('@/ui/Toast', () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }))

const categories = [{ id: 'cat', name: 'Lácteos' }]
const renderForm = (overrides: Partial<Parameters<typeof ProductFormModal>[0]> = {}) => {
  const props = { open: true, categories, by: 'owner', onSaved: vi.fn(), onCancel: vi.fn(), ...overrides }
  render(<ProductFormModal {...props} />)
  return props
}
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

describe('validación visible del formulario de producto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.upsert.mockImplementation(async (product: Product) => product)
  })

  it('guardar sin nombre marca el campo, enfoca y no envía; al corregir se recupera y guarda', async () => {
    const props = renderForm()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
    save()
    const name = screen.getByLabelText('Nombre')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAttribute('aria-describedby', 'prod-name-error')
    expect(document.getElementById('prod-name-error')).toHaveTextContent('El nombre es obligatorio')
    expect(name).toHaveFocus()
    expect(mocks.upsert).not.toHaveBeenCalled()

    fireEvent.change(name, { target: { value: 'Leche entera' } })
    expect(name).toHaveAttribute('aria-invalid', 'false')
    expect(document.getElementById('prod-name-error')).toBeNull()
    save()
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce())
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Leche entera', id: 'leche-entera' }), 'owner')
  })

  it('un precio negativo marca el campo de precio', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Leche' } })
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '-5' } })
    save()
    const price = screen.getByLabelText('Precio')
    expect(price).toHaveAttribute('aria-invalid', 'true')
    expect(price).toHaveAttribute('aria-describedby', 'prod-price-error')
    expect(document.getElementById('prod-price-error')).toHaveTextContent('El precio no puede ser negativo')
    expect(price).toHaveFocus()
    expect(mocks.upsert).not.toHaveBeenCalled()

    fireEvent.change(price, { target: { value: '4000' } })
    expect(price).toHaveAttribute('aria-invalid', 'false')
    expect(document.getElementById('prod-price-error')).toBeNull()
  })

  it('sin categorías disponibles pide elegir una categoría', () => {
    renderForm({ categories: [] })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Leche' } })
    save()
    const category = screen.getByLabelText('Categoría')
    expect(category).toHaveAttribute('aria-invalid', 'true')
    expect(category).toHaveAttribute('aria-describedby', 'prod-cat-error')
    expect(document.getElementById('prod-cat-error')).toHaveTextContent('Elige una categoría')
    expect(category).toHaveFocus()
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('mantiene deshabilitado el guardado durante la petición', async () => {
    let finish: (product: Product) => void = () => {}
    mocks.upsert.mockReturnValue(new Promise<Product>((resolve) => { finish = resolve }))
    renderForm()
    const name = screen.getByLabelText('Nombre')
    fireEvent.change(name, { target: { value: 'Leche' } })
    save()
    expect(await screen.findByRole('button', { name: 'Guardando…' })).toBeDisabled()
    finish({ id: 'leche', name: 'Leche', categoryId: 'cat', price: 0, unit: '1 u', imageUrl: '', inStock: true, is_variable_weight: false })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled())
  })
})
