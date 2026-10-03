import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { setUpdateHandler } from '@/pwa/updateChannel'
import { useUIStore } from '@/stores/uiStore'
import { PWAUpdateBanner } from './PWAUpdateBanner'

beforeEach(() => { useUIStore.setState({ updateAvailable: false }) })
afterEach(cleanup)

describe('PWAUpdateBanner', () => {
  it('no aparece mientras no haya versión nueva', () => {
    render(<PWAUpdateBanner />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('«Actualizar» activa el worker en espera mediante el canal registrado', () => {
    const update = vi.fn().mockResolvedValue(undefined)
    setUpdateHandler(update)
    render(<PWAUpdateBanner />)
    act(() => useUIStore.getState().setUpdateAvailable(true))
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(update).toHaveBeenCalledTimes(1)
  })
})
