import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductFormModal } from './ProductFormModal'

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), upload: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/services', () => ({ catalogRepo: { upsertProduct: mocks.upsert } }))
vi.mock('@/services/productImageService', () => ({ uploadProductImageFile: mocks.upload }))
vi.mock('@/ui/Toast', () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }))
const product = { id: 'p1', name: 'Leche', categoryId: 'cat', price: 4000, unit: '1 L', imageUrl: '/old.png',
  inStock: true, is_variable_weight: false, version: 1 }
const image = () => new File(['jpg'], 'foto.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'false')
  vi.clearAllMocks()
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.unstubAllEnvs())

describe('foto y guardado del formulario', () => {
  const props = () => ({ open: true, categories: [{ id: 'cat', name: 'Lácteos' }], initial: product, by: 'owner', onSaved: vi.fn(), onCancel: vi.fn() })
  it('elegir y cancelar no guarda producto ni sube imagen', () => {
    const options = props()
    render(<ProductFormModal {...options} />)
    fireEvent.change(screen.getByLabelText('Tomar foto'), { target: { files: [image()] } })
    expect(screen.getByText(/Pendiente de guardar/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(options.onCancel).toHaveBeenCalledOnce()
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it('solo Guardar sube con versión devuelta por persistencia y devuelve snapshot', async () => {
    const saved = { ...product, version: 2 }
    const uploaded = { ...saved, version: 3, imageUrl: 'https://blob.test/new.webp' }
    mocks.upsert.mockResolvedValue(saved)
    mocks.upload.mockResolvedValue(uploaded)
    const options = props()
    const file = image()
    render(<ProductFormModal {...options} />)
    fireEvent.change(screen.getByLabelText('Elegir archivo'), { target: { files: [file] } })
    expect(mocks.upload).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(options.onSaved).toHaveBeenCalledWith(uploaded))
    expect(mocks.upload).toHaveBeenCalledWith('p1', 2, file)
  })
  it('error de imagen comunica guardado parcial y conserva la foto anterior', async () => {
    const saved = { ...product, version: 2 }
    mocks.upsert.mockResolvedValue(saved)
    mocks.upload.mockRejectedValue(new Error('No disponible'))
    const options = props()
    render(<ProductFormModal {...options} />)
    fireEvent.change(screen.getByLabelText('Elegir archivo'), { target: { files: [image()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Producto guardado, pero la foto no se subió: No disponible'))
    expect(options.onSaved).toHaveBeenCalledWith(saved)
    expect(mocks.success).not.toHaveBeenCalled()
  })
  it('en demo no habilita uploads reales ni inventa una imagen guardada', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    render(<ProductFormModal {...props()} />)
    expect(screen.getByLabelText('Elegir archivo')).toBeDisabled()
    expect(screen.getByText('Las fotos estarán disponibles al conectar el catálogo real.')).toBeInTheDocument()
  })
})
