import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductImagePicker } from './ProductImagePicker'

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:unit-preview')
  URL.revokeObjectURL = vi.fn()
})
describe('selector de imagen del producto', () => {
  it('archivo y cámara comparten formatos, cámara trasera y selección pendiente sin red', () => {
    const change = vi.fn()
    render(<ProductImagePicker file={null} disabled={false} onChange={change} />)
    const camera = screen.getByLabelText('Tomar foto')
    expect(camera).toHaveAttribute('capture', 'environment')
    expect(camera).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    const file = new File(['png'], 'comercial.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Elegir archivo'), { target: { files: [file] } })
    expect(change).toHaveBeenCalledWith(file)
  })
  it('tipo no soportado o tamaño excesivo muestra error sin seleccionar', () => {
    const change = vi.fn()
    render(<ProductImagePicker file={null} disabled={false} onChange={change} />)
    for (const file of [new File(['svg'], 'x.svg', { type: 'image/svg+xml' }),
      new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'x.jpg', { type: 'image/jpeg' })]) {
      fireEvent.change(screen.getByLabelText('Elegir archivo'), { target: { files: [file] } })
      expect(screen.getByRole('alert')).toHaveTextContent('hasta 3 MiB')
    }
    expect(change).not.toHaveBeenCalled()
  })
  it('deshabilita controles sin producto real/versionado', () => {
    render(<ProductImagePicker file={null} disabled={true} onChange={vi.fn()} hint="Guarda primero el producto" />)
    expect(screen.getByLabelText('Elegir archivo')).toBeDisabled()
    expect(screen.getByLabelText('Tomar foto')).toBeDisabled()
    expect(screen.getByText('Guarda primero el producto')).toBeInTheDocument()
  })
  it('libera preview al cancelar/cerrar y permite quitar selección', () => {
    const change = vi.fn()
    const file = new File(['jpeg'], 'foto.jpg', { type: 'image/jpeg' })
    const view = render(<ProductImagePicker file={file} disabled={false} onChange={change} />)
    expect(screen.getByText(/Pendiente de guardar/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar foto elegida' }))
    expect(change).toHaveBeenCalledWith(null)
    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:unit-preview')
  })
})
