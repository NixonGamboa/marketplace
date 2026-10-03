import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withObservability } from '../../../api/_lib/observability.js'
import { recordOrderOutcome, runWithRequest, type RequestMetrics } from '../../src/shared/observability.js'
import notFound from '../../../api/not-found.js'
import { AuditRepositoryPostgres } from '../../src/infra/postgres/AuditRepositoryPostgres.js'
import { startEmbeddedPostgres } from '../integration/pgliteNeon.js'

const response = () => ({ statusCode: 200, headers: {} as Record<string, string>, setHeader(name: string, value: string) { this.headers[name] = value }, status(status: number) { this.statusCode = status; return this }, json() {}, end() {} })
beforeEach(() => vi.stubEnv('LOG_LEVEL', 'info'))
afterEach(() => vi.unstubAllEnvs())
describe('correlación API sin datos privados', () => {
  it('404 conserva envelope, rechaza ID inseguro y registra solo allowlist', async () => {
    const output = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const res = response()
      await notFound({ method: 'GET', headers: { 'x-request-id': 'secret\nphone=123' }, url: '/private?phone=123', body: { password: 'secret' } } as unknown as VercelRequest, res as unknown as VercelResponse)
      expect(res.headers['X-Request-Id']).toMatch(/^[a-f0-9-]{36}$/)
      expect(res.statusCode).toBe(404)
      const event = JSON.parse(output.mock.calls[0]?.[0] as string)
      expect(event).toMatchObject({ endpoint: '/api/not-found', status: 404, error: true, orderCreated: 0, orderReplayed: 0 })
      expect(JSON.stringify(event)).not.toMatch(/phone|password|private|secret/)
    } finally { output.mockRestore() }
  })
  it('aisla métricas entre requests concurrentes y conserva el ID válido', async () => {
    const output = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const handler = withObservability('/api/orders', async req => {
        await Promise.resolve()
        recordOrderOutcome(req.method === 'POST' ? 'created' : 'replayed')
      })
      await Promise.all(['POST', 'GET'].map(method => handler({ method, headers: { 'x-request-id': `request-${method}` } } as unknown as VercelRequest, response() as unknown as VercelResponse)))
      const events = output.mock.calls.map(call => JSON.parse(call[0] as string))
      expect(events.find(event => event.method === 'POST')).toMatchObject({ requestId: 'request-POST', orderCreated: 1, orderReplayed: 0 })
      expect(events.find(event => event.method === 'GET')).toMatchObject({ orderCreated: 0, orderReplayed: 1 })
    } finally { output.mockRestore() }
  })
  it('distingue audit driver y contrato sin propagar error original', async () => {
    const world = await startEmbeddedPostgres()
    const audit = new AuditRepositoryPostgres(world.db)
    const context: RequestMetrics = { requestId: 'request-audit', orderCreated: 0, orderReplayed: 0 }
    try {
      await world.pg.exec(`insert into audit_events(id,store_id,entity,entity_id,action,actor_kind,metadata) values('event','store','store','store','created','system','{"unexpected":"private"}')`)
      await expect(runWithRequest(context, () => audit.listPage({ storeId: 'store', filter: {}, limit: 20 }))).rejects.toThrow('Auditoría no disponible')
      expect(context.auditFailure).toBe('contract')
      await world.pg.exec('drop table audit_events')
      await expect(runWithRequest(context, () => audit.listPage({ storeId: 'store', filter: {}, limit: 20 }))).rejects.toThrow('Auditoría no disponible')
      expect(context.auditFailure).toBe('driver')
    } finally { await world.close() }
  }, 120_000)
})
