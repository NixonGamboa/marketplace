import { randomBytes } from 'node:crypto'
import type { PasswordHasher } from '../../src/domain/auth/ports.js'
import { JoseSessionTokenService } from '../../src/infra/auth/JoseSessionTokenService.js'
import { HmacBucketKeyer, RandomAuthIds } from '../../src/infra/auth/randomIds.js'
import { AuthRepositoryMemory } from '../../src/infra/memory/AuthRepositoryMemory.js'
import type { Clock } from '../../src/shared/clock.js'
import type { AuthDeps } from '../../src/usecases/auth/deps.js'

export const TEST_SECRET = randomBytes(32)
export const TEST_ISSUER = 'http://localhost:5173'
export const TEST_AUDIENCE = 'maui-local'

export const CUSTOMER_INPUT = {
  name: 'Ana Pérez',
  phone: '300 123 4567',
  password: 'clave-segura-123',
}
export const CUSTOMER_PHONE = '573001234567'

export const STAFF_INPUT = {
  role: 'owner',
  name: 'Dueña Maui',
  email: 'duena@maui.test',
  storeId: 'leche-y-miel',
  password: 'clave-staff-segura-1',
} as const

/** Reloj controlable: los casos de uso no leen `Date` directamente. */
export class TestClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current)
  }

  nowIso(): string {
    return this.current.toISOString()
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000)
  }
}

/** Hasher rápido y observable: cuenta llamadas para verificar orden y costo equivalente. */
export class FakePasswordHasher implements PasswordHasher {
  hashCalls = 0
  verifyCalls = 0
  unknownCalls = 0

  async hash(password: string): Promise<string> {
    this.hashCalls += 1
    return `fake$${password}`
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    this.verifyCalls += 1
    return storedHash === `fake$${password}`
  }

  async verifyUnknown(): Promise<void> {
    this.unknownCalls += 1
  }
}

export function createAuthFixture() {
  const repository = new AuthRepositoryMemory()
  const clock = new TestClock(new Date('2026-10-01T12:00:00.000Z'))
  const hasher = new FakePasswordHasher()
  const tokens = new JoseSessionTokenService({
    secret: TEST_SECRET,
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
  })
  const deps: AuthDeps = {
    repository,
    hasher,
    tokens,
    ids: new RandomAuthIds(),
    keys: new HmacBucketKeyer(TEST_SECRET),
    clock,
  }
  return { deps, repository, clock, hasher, tokens }
}
