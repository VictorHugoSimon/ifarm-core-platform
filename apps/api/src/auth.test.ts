import { describe, expect, it } from 'vitest'
import {
  AuthFailure,
  assertPrivilegedMfa,
  extractBearerToken,
  isMfaSatisfied,
  normalizeVerifiedClaims
} from './auth'

describe('Identity boundary', () => {
  it('extracts a well-formed Bearer token', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi')
  })

  it('rejects malformed authorization headers', () => {
    expect(() => extractBearerToken('Basic abc')).toThrow(AuthFailure)
    expect(() => extractBearerToken()).toThrowError(/obrigatório/i)
  })

  it('normalizes verified authenticated claims', () => {
    const user = normalizeVerifiedClaims({
      sub: '0f9f3c7c-6ed1-4f1b-9d77-35542a2dfc3e',
      email: 'gestor@ifarm.local',
      role: 'authenticated',
      aal: 'aal2',
      tenant_id: 'f251196e-ad9b-4958-bb71-52a144e3f3b4',
      is_ifarm_admin: true
    })

    expect(user.id).toBe('0f9f3c7c-6ed1-4f1b-9d77-35542a2dfc3e')
    expect(user.tenantId).toBe('f251196e-ad9b-4958-bb71-52a144e3f3b4')
    expect(user.requiresMfa).toBe(true)
    expect(isMfaSatisfied(user)).toBe(true)
  })

  it('rejects anonymous or non-authenticated tokens', () => {
    expect(() => normalizeVerifiedClaims({
      sub: '0f9f3c7c-6ed1-4f1b-9d77-35542a2dfc3e',
      role: 'authenticated',
      is_anonymous: true
    })).toThrow(AuthFailure)

    expect(() => normalizeVerifiedClaims({
      sub: '0f9f3c7c-6ed1-4f1b-9d77-35542a2dfc3e',
      role: 'anon'
    })).toThrow(AuthFailure)
  })

  it('requires aal2 when the identity is privileged', () => {
    const privileged = normalizeVerifiedClaims({
      sub: '0f9f3c7c-6ed1-4f1b-9d77-35542a2dfc3e',
      role: 'authenticated',
      aal: 'aal1',
      requires_mfa: true
    })

    expect(isMfaSatisfied(privileged)).toBe(false)
    expect(() => assertPrivilegedMfa(privileged)).toThrowError(/multifator/i)
  })
})
