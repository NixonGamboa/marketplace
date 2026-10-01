import { describe, expect, it, vi } from 'vitest'
import { checkHealth } from '../../src/usecases/health/checkHealth.js'

describe('health portable', () => {
  it('solo marca conectado después de ejecutar el probe', async () => {
    const checkConnection = vi.fn().mockResolvedValue(undefined)
    await expect(checkHealth({ checkConnection })).resolves.toEqual({ status: 'ok', database: 'connected' })
    expect(checkConnection).toHaveBeenCalledOnce()
  })

  it('memory no acredita conectividad real', async () => {
    await expect(checkHealth(null)).resolves.toEqual({ status: 'unavailable', database: 'not_connected' })
  })

  it('no expone el error del driver', async () => {
    const checkConnection = vi.fn().mockRejectedValue(new Error('postgresql://user:password@host/db cliente privado'))
    await expect(checkHealth({ checkConnection })).resolves.toEqual({ status: 'unavailable', database: 'disconnected' })
  })
})
