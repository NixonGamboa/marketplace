import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

export const validRequestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/.test(value)
export const requestIdFrom = (value: unknown): string => validRequestId(value) ? value : randomUUID()
export type RequestMetrics = { requestId: string; orderCreated: number; orderReplayed: number; auditFailure?: 'driver' | 'contract' }
const requests = new AsyncLocalStorage<RequestMetrics>()
export const runWithRequest = <T>(context: RequestMetrics, run: () => T): T => requests.run(context, run)
export const recordOrderOutcome = (outcome: 'created' | 'replayed'): void => {
  const context = requests.getStore()
  if (context) outcome === 'created' ? context.orderCreated++ : context.orderReplayed++
}
export const recordAuditFailure = (category: 'driver' | 'contract'): void => {
  const context = requests.getStore()
  if (context) context.auditFailure = category
}
