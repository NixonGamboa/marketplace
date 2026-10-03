/**
 * Auditoría real con el repository simulado (no es evidencia de cierre real): filtros enviados
 * al servidor, cursor, actor/sistema, detalle limitado al contrato y errores.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AuditEvent } from '@shared/contracts'
import { ApiError } from '@/services/http/apiError'

const listPage = vi.hoisted(() => vi.fn())

vi.mock('@/services', () => ({ isDemoMode: false, serverAuditRepo: { listPage } }))

import { RealAuditPage } from '../RealAuditPage'

const event = (overrides: Partial<AuditEvent> = {}): AuditEvent => ({
  id: 'aud-1',
  storeId: 'store-1',
  entity: 'order',
  entityId: 'ord-1',
  action: 'status_changed',
  actorKind: 'account',
  actorId: 'usr-owner',
  createdAt: '2026-10-02T15:00:00.000Z',
  metadata: { previousStatus: 'received', status: 'confirmed', version: 2 },
  ...overrides,
})

describe('RealAuditPage (repository simulado)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('muestra actor, entidad, acción y el detalle permitido por el contrato', async () => {
    listPage.mockResolvedValue({
      items: [
        event(),
        event({ id: 'aud-2', entity: 'product', entityId: 'prod-1', action: 'updated', actorKind: 'system', actorId: null, metadata: { fields: ['price', 'inStock'] } }),
      ],
      nextCursor: null,
    })
    render(<RealAuditPage />)
    expect(await screen.findByText('usr-owner')).toBeInTheDocument()
    expect(screen.getByText('received → confirmed · v2')).toBeInTheDocument()
    expect(screen.getByText('Sistema')).toBeInTheDocument()
    expect(screen.getByText('campos: price, inStock')).toBeInTheDocument()
    expect(listPage).toHaveBeenCalledWith({}, { limit: 50 }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('aplica los filtros en el servidor, con los días de la tienda como instantes UTC', async () => {
    listPage.mockResolvedValue({ items: [], nextCursor: null })
    render(<RealAuditPage />)
    await waitFor(() => expect(listPage).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('Entidad'), { target: { value: 'order' } })
    fireEvent.change(screen.getByLabelText('Acción'), { target: { value: 'status_changed' } })
    fireEvent.change(screen.getByLabelText('ID del recurso'), { target: { value: ' ord-1 ' } })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(listPage).toHaveBeenCalledTimes(2))
    expect(listPage).toHaveBeenLastCalledWith(
      {
        entity: 'order', action: 'status_changed', entityId: 'ord-1',
        from: '2026-10-01T05:00:00.000Z', to: '2026-10-03T05:00:00.000Z',
      },
      { limit: 50 },
      expect.anything(),
    )
  })

  it('rechaza un rango invertido sin consultar', async () => {
    listPage.mockResolvedValue({ items: [], nextCursor: null })
    render(<RealAuditPage />)
    await waitFor(() => expect(listPage).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-05' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no puede ser mayor')
    expect(listPage).toHaveBeenCalledTimes(1)
  })

  it('pagina con el cursor del servidor', async () => {
    listPage.mockResolvedValueOnce({ items: [event()], nextCursor: 'cur_1' })
      .mockResolvedValueOnce({ items: [event({ id: 'aud-9', entityId: 'ord-9' })], nextCursor: null })
    render(<RealAuditPage />)
    await screen.findByText('ord-1')
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(await screen.findByText('ord-9')).toBeInTheDocument()
    expect(screen.getByText('ord-1')).toBeInTheDocument()
    expect(listPage).toHaveBeenLastCalledWith({}, { limit: 50, cursor: 'cur_1' }, expect.anything())
  })

  it('un 403 (operator) se informa con reintento y no deja la tabla vacía engañosa', async () => {
    listPage.mockRejectedValueOnce(new ApiError({ kind: 'forbidden', status: 403, message: 'No tienes permiso para esta acción.' }))
      .mockResolvedValueOnce({ items: [event()], nextCursor: null })
    render(<RealAuditPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para esta acción.')
    expect(screen.queryByText('Sin eventos')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('usr-owner')).toBeInTheDocument()
  })
})
