import { describe, expect, it } from 'vitest'
import {
  accountDtoSchema,
  authSessionResponseSchema,
  loginRequestSchema,
  registerRequestSchema,
} from '../../../shared/contracts/index.js'
import { toAccountDto, toAuthSessionResponse } from '../../src/domain/auth/accountMappers.js'
import type { Account } from '../../src/domain/auth/Account.js'

const validRegister = { name: ' Ana Pérez ', phone: '+57 300-123-4567', password: 'clave-segura-123' }

describe('registerRequestSchema', () => {
  it('normaliza nombre y teléfono', () => {
    expect(registerRequestSchema.parse(validRegister)).toEqual({
      name: 'Ana Pérez',
      phone: '573001234567',
      password: 'clave-segura-123',
    })
  })

  it.each([
    ['role', { role: 'owner' }],
    ['storeId', { storeId: 'leche-y-miel' }],
    ['email', { email: 'a@b.co' }],
    ['status', { status: 'active' }],
    ['id', { id: 'acc_x' }],
  ])('rechaza el campo no permitido %s (sin escalada de rol/tienda)', (_field, extra) => {
    expect(registerRequestSchema.safeParse({ ...validRegister, ...extra }).success).toBe(false)
  })

  it('exige contraseña de 12 a 128 caracteres', () => {
    expect(registerRequestSchema.safeParse({ ...validRegister, password: 'a'.repeat(11) }).success).toBe(false)
    expect(registerRequestSchema.safeParse({ ...validRegister, password: 'a'.repeat(12) }).success).toBe(true)
    expect(registerRequestSchema.safeParse({ ...validRegister, password: 'a'.repeat(128) }).success).toBe(true)
    expect(registerRequestSchema.safeParse({ ...validRegister, password: 'a'.repeat(129) }).success).toBe(false)
  })

  it.each(['12345', '2001234567', '+1 300 123 4567', 'x'.repeat(40)])('rechaza teléfono inválido %s', phone => {
    expect(registerRequestSchema.safeParse({ ...validRegister, phone }).success).toBe(false)
  })

  it('rechaza nombre corto o ausente y tipos no string', () => {
    expect(registerRequestSchema.safeParse({ ...validRegister, name: 'A' }).success).toBe(false)
    expect(registerRequestSchema.safeParse({ phone: validRegister.phone, password: validRegister.password }).success).toBe(false)
    expect(registerRequestSchema.safeParse({ ...validRegister, password: 123456789012 }).success).toBe(false)
  })
})

describe('loginRequestSchema', () => {
  it('acepta email normalizado con método explícito', () => {
    expect(loginRequestSchema.parse({ method: 'email', email: '  Duena@Maui.TEST ', password: 'x' })).toEqual({
      method: 'email',
      email: 'duena@maui.test',
      password: 'x',
    })
  })

  it('acepta teléfono con método explícito y lo canoniza', () => {
    expect(loginRequestSchema.parse({ method: 'phone', phone: '300 123 4567', password: 'x' })).toEqual({
      method: 'phone',
      phone: '573001234567',
      password: 'x',
    })
  })

  it.each([
    ['sin método', { email: 'a@b.co', password: 'x' }],
    ['método desconocido', { method: 'username', email: 'a@b.co', password: 'x' }],
    ['email con campo de teléfono', { method: 'email', email: 'a@b.co', phone: '3001234567', password: 'x' }],
    ['teléfono con campo de email', { method: 'phone', phone: '3001234567', email: 'a@b.co', password: 'x' }],
    ['campo extra role', { method: 'email', email: 'a@b.co', password: 'x', role: 'owner' }],
    ['contraseña vacía', { method: 'email', email: 'a@b.co', password: '' }],
    ['contraseña enorme', { method: 'email', email: 'a@b.co', password: 'x'.repeat(129) }],
    ['email inválido', { method: 'email', email: 'no-es-email', password: 'x' }],
  ])('rechaza %s', (_case, payload) => {
    expect(loginRequestSchema.safeParse(payload).success).toBe(false)
  })
})

describe('DTOs de cuenta', () => {
  const base = { id: 'acc_abc', name: 'Ana', status: 'active', createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-01T12:00:00.000Z' } as const
  const customer: Account = { ...base, role: 'customer', phone: '573001234567', email: null, storeId: null }
  const owner: Account = { ...base, role: 'owner', phone: null, email: 'duena@maui.test', storeId: 'leche-y-miel' }

  it('cliente: teléfono como contacto NO verificado y sin tienda', () => {
    expect(toAccountDto(customer)).toEqual({
      id: 'acc_abc',
      role: 'customer',
      name: 'Ana',
      phone: '573001234567',
      phoneVerified: false,
    })
  })

  it('staff: email y tienda', () => {
    expect(toAccountDto(owner)).toEqual({
      id: 'acc_abc',
      role: 'owner',
      name: 'Ana',
      email: 'duena@maui.test',
      storeId: 'leche-y-miel',
    })
  })

  it('no filtra campos internos aunque el objeto de origen los tenga', () => {
    const leaky = { ...customer, passwordHash: 'scrypt$secreto', token: 'jwt' } as Account
    const dto = toAccountDto(leaky)
    expect(Object.keys(dto).sort()).toEqual(['id', 'name', 'phone', 'phoneVerified', 'role'])
    expect(JSON.stringify(toAuthSessionResponse(leaky, '2026-10-01T20:00:00.000Z'))).not.toMatch(/secreto|jwt|passwordHash/)
  })

  it('el esquema de respuesta es estricto: rechaza token, hash o phoneVerified=true', () => {
    const dto = toAccountDto(customer)
    expect(authSessionResponseSchema.safeParse({ account: dto, expiresAt: '2026-10-01T20:00:00.000Z', token: 'x' }).success).toBe(false)
    expect(accountDtoSchema.safeParse({ ...dto, passwordHash: 'x' }).success).toBe(false)
    expect(accountDtoSchema.safeParse({ ...dto, phoneVerified: true }).success).toBe(false)
  })

  it('una cuenta incoherente no se proyecta', () => {
    expect(() => toAccountDto({ ...owner, storeId: null })).toThrow()
  })
})
