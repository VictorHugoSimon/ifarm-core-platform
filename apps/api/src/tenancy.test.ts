import { describe, expect, it } from 'vitest'
import {
  activeTenantInputSchema,
  adminTenantCreateSchema,
  organizationCreateSchema,
  organizationPatchSchema,
  whiteLabelSchema
} from './tenancy'

describe('CORE-003 tenancy contracts', () => {
  it('accepts only UUID tenant selectors', () => {
    expect(activeTenantInputSchema.parse({
      tenantId: '632499ae-079d-4d99-8a00-c7624bc9943f'
    }).tenantId).toBe('632499ae-079d-4d99-8a00-c7624bc9943f')

    expect(() => activeTenantInputSchema.parse({ tenantId: 'tenant-a' })).toThrow()
  })

  it('validates and trims organization creation input', () => {
    const parsed = organizationCreateSchema.parse({
      name: '  Fazenda Matriz  ',
      documentNumber: '  123  ',
      email: 'contato@ifarm.local'
    })

    expect(parsed.name).toBe('Fazenda Matriz')
    expect(parsed.documentNumber).toBe('123')
  })

  it('requires at least one field in organization patch', () => {
    expect(() => organizationPatchSchema.parse({})).toThrow(/ao menos um campo/i)
    expect(organizationPatchSchema.parse({ phone: null })).toEqual({ phone: null })
  })

  it('keeps white-label colors constrained to six-digit hex values', () => {
    expect(whiteLabelSchema.parse({
      brandName: 'iFarm Agro',
      primaryColor: '#1F7A4C',
      accentColor: '#E7B64A'
    }).brandName).toBe('iFarm Agro')

    expect(() => whiteLabelSchema.parse({
      brandName: 'iFarm Agro',
      primaryColor: 'green'
    })).toThrow()
  })

  it('accepts canonical tenant slugs and rejects free-form values', () => {
    expect(adminTenantCreateSchema.parse({
      slug: 'fazenda-modelo-sp',
      legalName: 'Fazenda Modelo Ltda.'
    }).slug).toBe('fazenda-modelo-sp')

    expect(() => adminTenantCreateSchema.parse({
      slug: 'Fazenda Modelo',
      legalName: 'Fazenda Modelo Ltda.'
    })).toThrow()
  })
})
