export interface DatabaseHealthProbe {
  checkConnection(): Promise<void>
}

export type HealthResult =
  | { status: 'ok'; database: 'connected' }
  | { status: 'unavailable'; database: 'disconnected' | 'not_connected' }

/** Memory nunca acredita conectividad real, incluso en desarrollo. */
export async function checkHealth(probe: DatabaseHealthProbe | null): Promise<HealthResult> {
  if (!probe) return { status: 'unavailable', database: 'not_connected' }
  try {
    await probe.checkConnection()
    return { status: 'ok', database: 'connected' }
  } catch {
    return { status: 'unavailable', database: 'disconnected' }
  }
}
