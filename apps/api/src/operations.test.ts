import { describe, expect, it } from 'vitest'
import {
  auditQuerySchema,
  documentCreateSchema,
  documentPatchSchema,
  notificationCreateSchema,
  partnerCreateSchema,
  partnerPatchSchema
} from './operations'

const uuid = '11111111-1111-4111-8111-111111111111'

describe('CORE-006 operations validation', () => {
  it('accepts a valid partner without tenant identifiers', () => {
    const value = partnerCreateSchema.parse({
      name: 'Cooperativa Modelo',
      documentNumber: '12.345.678/0001-00',
      partnerType: 'supplier',
      email: 'contato@example.com'
    })

    expect(value.partnerType).toBe('supplier')
    expect('tenantId' in value).toBe(false)
  })

  it('rejects invalid partner data and empty patches', () => {
    expect(partnerCreateSchema.safeParse({ name: 'A', partnerType: 'x' }).success).toBe(false)
    expect(partnerCreateSchema.safeParse({ name: 'Parceiro', partnerType: 'supplier', email: 'invalid' }).success).toBe(false)
    expect(partnerPatchSchema.safeParse({}).success).toBe(false)
  })

  it('accepts document metadata and rejects invalid sizes', () => {
    const value = documentCreateSchema.parse({
      organizationId: uuid,
      title: 'CAR da Fazenda',
      category: 'property',
      storagePath: 'documents/car-fazenda.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      checksum: 'sha256:abc'
    })

    expect(value.sizeBytes).toBe(2048)
    expect(documentCreateSchema.safeParse({ title: 'Documento', storagePath: 'a.pdf', sizeBytes: -1 }).success).toBe(false)
    expect(documentPatchSchema.safeParse({}).success).toBe(false)
  })

  it('validates notifications with structured data', () => {
    const value = notificationCreateSchema.parse({
      userId: uuid,
      type: 'system',
      title: 'Documento atualizado',
      data: { entityType: 'document', important: true }
    })

    expect(value.data.important).toBe(true)
    expect(notificationCreateSchema.safeParse({ userId: 'invalid', type: 'x', title: 'OK' }).success).toBe(false)
  })

  it('caps audit pagination contract at 200 rows', () => {
    expect(auditQuerySchema.parse({ limit: '100', offset: '10' })).toEqual({ limit: 100, offset: 10 })
    expect(auditQuerySchema.safeParse({ limit: 201, offset: 0 }).success).toBe(false)
    expect(auditQuerySchema.safeParse({ limit: 10, offset: -1 }).success).toBe(false)
  })
})
