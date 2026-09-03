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

  it('normalizes a verified Neon Auth identity', () => {
    const user = normalizeVerifiedClaims({
      sub: '0f9f3c7c-6ed1-4f1b-9d77-35542a2dfc3e',
      email: 'gestor@ifarm.local',
      sid: 'session-123',
      amr: ['pwd', 'totp']
    })

    expect(user.id).toBe('0f9f3c7c-6ed1-4f1b-9d77-35542a2dfc3e')
    expect(user.sessionId).toBe('session-123')
    expect(user.mfaVerified).toBe(true)
    expect(user.tenantId).toBeUndefined()
  })

  it('rejects anonymous or malformed identities', () => {
    expect(() => normalizeVerifiedClaims({
      sub: '0f9f3c7c-6ed1-4f1b-9d77-35542a2dfc3e',
      is_anonymous: true
    })).toThrow(AuthFailure)

    expect(() => normalizeVerifiedClaims({
      sub: 'not-a-uuid'
    })).toThrow(AuthFailure)
  })

  it('requires verified MFA when the database marks the identity as privileged', () => {
    const identity = normalizeVerifiedClaims({
      sub: '0f9f3c7c-6ed1-4f1b-9d77-35542a2dfc3e',
      amr: ['pwd']
    })
    const privileged = { ...identity, requiresMfa: true }

    expect(isMfaSatisfied(privileged)).toBe(false)
    expect(() => assertPrivilegedMfa(privileged)).toThrowError(/multifator/i)
  })
})
