import type { DatabaseHealthProbe } from '../../usecases/health/checkHealth.js'
import { sql } from './client.js'

export const postgresHealthProbe: DatabaseHealthProbe = {
  async checkConnection(): Promise<void> {
    await sql('SELECT 1', [], { fetchOptions: { signal: AbortSignal.timeout(5_000) } })
  },
}
