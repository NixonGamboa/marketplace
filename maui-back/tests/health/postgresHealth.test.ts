import { describe, expect, it, vi } from 'vitest'

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }))
vi.mock('../../src/infra/postgres/client.js', () => ({ sql }))
import { postgresHealthProbe } from '../../src/infra/postgres/health.js'

describe('probe Postgres', () => {
  it('ejecuta SELECT 1 con timeout acotado, no inferencia por driver', async () => {
    sql.mockResolvedValue([{ '?column?': 1 }])
    await postgresHealthProbe.checkConnection()
    expect(sql).toHaveBeenCalledWith('SELECT 1', [], { fetchOptions: { signal: expect.any(AbortSignal) } })
  })

  it('propaga fallo de conexión al caso de uso para reportar indisponibilidad', async () => {
    sql.mockRejectedValue(new Error('conexión fallida'))
    await expect(postgresHealthProbe.checkConnection()).rejects.toThrow('conexión fallida')
  })
})
