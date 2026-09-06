import { describe, expect, it } from 'vitest'
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationAcceptSchema,
  invitationCreateSchema,
  membershipUpdateSchema
} from './user-management'

const roleId = '11111111-1111-4111-8111-111111111111'
const organizationId = '22222222-2222-4222-8222-222222222222'

describe('CORE-007 user management validation', () => {
  it('normalizes invitation email and applies a bounded default expiry', () => {
    const value = invitationCreateSchema.parse({
      email: '  USER@EXAMPLE.COM ',
      roleId
    })

    expect(value.email).toBe('user@example.com')
    expect(value.expiresInHours).toBe(72)
    expect('tenantId' in value).toBe(false)
  })

  it('rejects invalid invitation relations and excessive expiry', () => {
    expect(invitationCreateSchema.safeParse({ email: 'invalid', roleId }).success).toBe(false)
    expect(invitationCreateSchema.safeParse({ email: 'user@example.com', roleId: 'invalid' }).success).toBe(false)
    expect(invitationCreateSchema.safeParse({ email: 'user@example.com', roleId, expiresInHours: 169 }).success).toBe(false)
  })

  it('requires explicit governed membership access state', () => {
    const active = membershipUpdateSchema.parse({
      roleId,
      organizationId,
      status: 'active'
    })
    expect(active.organizationId).toBe(organizationId)

    expect(membershipUpdateSchema.parse({
      roleId,
      organizationId: null,
      status: 'suspended'
    }).status).toBe('suspended')

    expect(membershipUpdateSchema.safeParse({ roleId, status: 'active' }).success).toBe(false)
  })

  it('generates a one-time random token and stores only SHA-256-compatible hex', async () => {
    const token = generateInvitationToken()
    const hash = await hashInvitationToken(token)

    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toBe(token)
    expect(await hashInvitationToken(token)).toBe(hash)
  })

  it('rejects short or empty acceptance tokens', () => {
    expect(invitationAcceptSchema.safeParse({ token: 'short' }).success).toBe(false)
    expect(invitationAcceptSchema.safeParse({ token: 'a'.repeat(64) }).success).toBe(true)
  })
})
