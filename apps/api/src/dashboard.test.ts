import { describe, expect, it } from 'vitest'
import {
  contractCreateSchema,
  integrationCreateSchema,
  moduleUpsertSchema,
  revenueCreateSchema
} from './dashboard'

const uuid = '11111111-1111-4111-8111-111111111111'

describe('CORE-008 dashboard commercial validation', () => {
  it('normalizes currency and accepts a valid contract without tenantId', () => {
    const value = contractCreateSchema.parse({
      contractNumber: 'IFARM-001',
      title: 'Licença iFarm',
      status: 'active',
      currency: 'brl',
      startsOn: '2026-09-01',
      recurringMonthlyCents: 250000
    })
    expect(value.currency).toBe('BRL')
    expect(value.recurringMonthlyCents).toBe(250000)
    expect('tenantId' in value).toBe(false)
  })

  it('rejects negative money and inverted contract dates', () => {
    expect(contractCreateSchema.safeParse({
      contractNumber: 'X', title: 'Contrato', startsOn: '2026-09-02', recurringMonthlyCents: -1
    }).success).toBe(false)
    expect(contractCreateSchema.safeParse({
      contractNumber: 'X', title: 'Contrato', startsOn: '2026-09-02', endsOn: '2026-09-01'
    }).success).toBe(false)
  })

  it('requires paidAt when a revenue entry is paid', () => {
    expect(revenueCreateSchema.safeParse({
      dueDate: '2026-09-10', amountCents: 1000, status: 'paid'
    }).success).toBe(false)
    expect(revenueCreateSchema.safeParse({
      dueDate: '2026-09-10', amountCents: 1000, status: 'paid', paidAt: '2026-09-10T12:00:00Z'
    }).success).toBe(true)
  })

  it('validates module assignment without tenant input', () => {
    const value = moduleUpsertSchema.parse({
      contractId: uuid,
      status: 'active',
      startsOn: '2026-09-01'
    })
    expect(value.contractId).toBe(uuid)
    expect('tenantId' in value).toBe(false)
  })

  it('validates integration provider and status', () => {
    expect(integrationCreateSchema.parse({ name: 'ERP', provider: 'Fornecedor', status: 'active' }).status).toBe('active')
    expect(integrationCreateSchema.safeParse({ name: 'X', provider: '' }).success).toBe(false)
  })
})
