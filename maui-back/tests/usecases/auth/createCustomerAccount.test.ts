import { describe, expect, it } from 'vitest'
import { AccountConflictError } from '../../../src/domain/auth/errors.js'
import { ValidationError } from '../../../src/shared/errors.js'
import { createCustomerAccount } from '../../../src/usecases/auth/createCustomerAccount.js'
import { CUSTOMER_INPUT, CUSTOMER_PHONE, createAuthFixture } from '../../auth/fixtures.js'

describe('alta controlada de cliente (seed)', () => {
  it('crea la misma cuenta customer que el registro público, sin sesión y con teléfono canónico', async () => {
    const { deps, repository, hasher } = createAuthFixture()
    const account = await createCustomerAccount(deps, CUSTOMER_INPUT)
    expect(account).toMatchObject({ role: 'customer', name: 'Ana Pérez', phone: CUSTOMER_PHONE, email: null, storeId: null, status: 'active' })
    expect(account).not.toHaveProperty('passwordHash')
    expect(hasher.hashCalls).toBe(1)
    const stored = await repository.findAccountByPhone(CUSTOMER_PHONE)
    expect(stored?.id).toBe(account.id)
    expect(await repository.findSessionWithAccount('ses_inexistente')).toBeNull()
  })

  it('acepta un generador de ID determinista y rechaza duplicados sin tocar la cuenta previa', async () => {
    const { deps, repository } = createAuthFixture()
    const ids = { accountId: () => 'acc_fijo_1', sessionId: deps.ids.sessionId }
    const created = await createCustomerAccount({ ...deps, ids }, CUSTOMER_INPUT)
    expect(created.id).toBe('acc_fijo_1')
    await expect(createCustomerAccount({ ...deps, ids: { ...ids, accountId: () => 'acc_fijo_2' } }, CUSTOMER_INPUT)).rejects.toBeInstanceOf(AccountConflictError)
    expect((await repository.findAccountByPhone(CUSTOMER_PHONE))?.id).toBe('acc_fijo_1')
  })

  it.each([
    [{ ...CUSTOMER_INPUT, phone: '12345' }],
    [{ ...CUSTOMER_INPUT, password: 'corta' }],
    [{ ...CUSTOMER_INPUT, name: '' }],
    [{ ...CUSTOMER_INPUT, role: 'owner' }],
    [{ ...CUSTOMER_INPUT, storeId: 'leche-y-miel' }],
  ])('valida con el contrato de registro y no permite fijar rol ni tienda: %j', async input => {
    const { deps, repository } = createAuthFixture()
    await expect(createCustomerAccount(deps, input)).rejects.toBeInstanceOf(ValidationError)
    expect(await repository.findAccountByPhone(CUSTOMER_PHONE)).toBeNull()
  })
})
