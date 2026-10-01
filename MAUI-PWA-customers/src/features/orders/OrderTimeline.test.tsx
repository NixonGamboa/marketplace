import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import OrderTimeline from './OrderTimeline'

describe('OrderTimeline — estados ampliados', () => {
  it('cancelado no marca ningún paso como completado ni en curso', () => {
    render(<OrderTimeline currentStatus="cancelled" timestamps={{ cancelled: '2026-09-29T12:00:00.000Z' }} />)

    expect(screen.getByText('Pedido cancelado')).toBeInTheDocument()
    expect(screen.queryByText('Completado')).not.toBeInTheDocument()
    expect(screen.queryByText('Pendiente')).not.toBeInTheDocument()
    expect(screen.queryByText('Entregado')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('en camino rotula el paso «Listo» como «En camino» y deja «Entregado» pendiente', () => {
    render(<OrderTimeline currentStatus="in_delivery" />)

    expect(screen.getByText('En camino')).toBeInTheDocument()
    expect(screen.queryByText('Listo')).not.toBeInTheDocument()
    expect(screen.getAllByText('Completado')).toHaveLength(3)
    expect(screen.getAllByText('En curso')).toHaveLength(1)
    expect(screen.getAllByText('Pendiente')).toHaveLength(1)
  })

  it('entregado completa los pasos previos', () => {
    render(<OrderTimeline currentStatus="delivered" />)
    expect(screen.getAllByText('Completado')).toHaveLength(4)
  })
})
