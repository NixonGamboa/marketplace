/**
 * @spec TASK-007
 * login/logout/getSession con TTL 8h y fallback de usuarios.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mockAuthRepository } from '../mockAuthRepository'
import { _clearAuditLog, mockAuditRepository } from '../mockAuditRepository'

beforeEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
  _clearAuditLog()
})

describe('mockAuthRepository', () => {
  it('AC-1: login con credenciales válidas retorna Session con role correcto (owner fallback)', async () => {
    const session = await mockAuthRepository.login('owner@lechemiel.demo', 'demo1234')
    expect(session.user.email).toBe('owner@lechemiel.demo')
    expect(session.user.role).toBe('owner')
    expect(session.expiresAt).toBeTruthy()
    const events = await mockAuditRepository.list()
    expect(events[0].action).toBe('auth.login')
  })

  it('AC-1: login operator fallback retorna role operator', async () => {
    const session = await mockAuthRepository.login('operator@lechemiel.demo', 'demo1234')
    expect(session.user.role).toBe('operator')
  })

  it('AC-2: login inválido lanza "Credenciales inválidas"', async () => {
    await expect(mockAuthRepository.login('owner@lechemiel.demo', 'wrong')).rejects.toThrow(
      /Credenciales inválidas/i,
    )
    await expect(mockAuthRepository.login('ghost@x.com', 'demo1234')).rejects.toThrow(
      /Credenciales inválidas/i,
    )
  })

  it('AC-3: getSession retorna null si expiresAt está en el pasado y limpia', async () => {
    const expired = {
      user: { email: 'owner@x', name: 'x', role: 'owner', merchantId: 'm' },
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }
    window.sessionStorage.setItem('maui-admin-session', JSON.stringify(expired))
    expect(mockAuthRepository.getSession()).toBeNull()
    expect(window.sessionStorage.getItem('maui-admin-session')).toBeNull()
  })

  it('login persiste sesión con TTL de aprox. 8h', async () => {
    const before = Date.now()
    const session = await mockAuthRepository.login('owner@lechemiel.demo', 'demo1234')
    const expiresAt = Date.parse(session.expiresAt)
    const ttl = expiresAt - before
    // Debe estar cerca de 8h (28800000 ms), toleramos margen.
    expect(ttl).toBeGreaterThan(8 * 60 * 60 * 1000 - 5000)
    expect(ttl).toBeLessThan(8 * 60 * 60 * 1000 + 5000)
  })

  it('logout limpia session storage y registra audit', async () => {
    await mockAuthRepository.login('owner@lechemiel.demo', 'demo1234')
    await mockAuthRepository.logout()
    expect(window.sessionStorage.getItem('maui-admin-session')).toBeNull()
    const events = await mockAuditRepository.list()
    expect(events.some((e) => e.action === 'auth.logout')).toBe(true)
    expect(events.some((e) => e.action === 'auth.login')).toBe(true)
  })
})
