import { describe, expect, it } from 'vitest'
import { assertTenantContext, AuthorizationFailure } from './authorization'
import { isPermissionCode } from './permissions'
import type { AuthUser } from './types'

const baseUser: AuthUser = {
  id: '0f9f3c7c-6ed1-4f1b-9d77-35542a2dfc3e',
  aal: 'aal1',
  isIfarmAdmin: false,
  requiresMfa: false
}

describe('RBAC boundary', () => {
  it('requires a validated tenant for regular users', () => {
    expect(() => assertTenantContext(baseUser)).toThrow(AuthorizationFailure)
  })

  it('accepts a tenant carried by verified identity context', () => {
    expect(() => assertTenantContext({
      ...baseUser,
      tenantId: 'f251196e-ad9b-4958-bb71-52a144e3f3b4'
    })).not.toThrow()
  })

  it('allows iFarm administrators to enter global administration context', () => {
    expect(() => assertTenantContext({
      ...baseUser,
      isIfarmAdmin: true,
      requiresMfa: true
    })).not.toThrow()
  })

  it('keeps permission codes closed to known capabilities', () => {
    expect(isPermissionCode('property.manage')).toBe(true)
    expect(isPermissionCode('make.me.superadmin')).toBe(false)
  })
})
