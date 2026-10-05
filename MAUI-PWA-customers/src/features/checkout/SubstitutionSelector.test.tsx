import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SubstitutionSelector } from './SubstitutionSelector'
import { useCheckoutStore } from './checkoutStore'

beforeEach(() => useCheckoutStore.getState().reset())
afterEach(cleanup)

const openOptions = () => fireEvent.click(screen.getByRole('button', { name: /Cambiar/ }))

describe('selector de sustituciones', () => {
  it('cierra al tocar el texto de la opción ya seleccionada y conserva la preferencia', () => {
    render(<SubstitutionSelector />)
    openOptions()
    fireEvent.click(screen.getByText('Avisarme antes de cambiar'))
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(useCheckoutStore.getState().substitutionPref).toBe('call_me')
    expect(screen.getByRole('button', { name: /Cambiar/ })).toHaveFocus()
  })

  it('cierra al seleccionar una opción distinta y muestra la nueva preferencia', () => {
    render(<SubstitutionSelector />)
    openOptions()
    fireEvent.click(screen.getByRole('radio', { name: /Quitar el producto/ }))
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(useCheckoutStore.getState().substitutionPref).toBe('remove')
    expect(screen.getByRole('button', { name: /Quitar el producto/ })).toHaveFocus()
  })

  it('permite confirmar la selección con Enter y recuperar el foco', () => {
    render(<SubstitutionSelector />)
    openOptions()
    const selected = screen.getByRole('radio', { name: /Avisarme antes de cambiar/ })
    selected.focus()
    fireEvent.keyDown(selected, { key: 'Enter' })
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(useCheckoutStore.getState().substitutionPref).toBe('call_me')
    expect(screen.getByRole('button', { name: /Cambiar/ })).toHaveFocus()
  })
})
