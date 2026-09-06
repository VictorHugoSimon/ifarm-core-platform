import { z } from 'zod'
import { callDataApiRpc } from './data-api'
import { createServerDatabase } from './server-db'
import type { ApiBindings } from './types'

const uuidSchema = z.string().uuid()
const dateSchema = z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value)

export const invitationCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  roleId: uuidSchema,
  organizationId: uuidSchema.nullable().optional(),
  expiresInHours: z.number().int().min(1).max(168).default(72)
}).strict()

export const invitationAcceptSchema = z.object({
  token: z.string().trim().min(32).max(512)
}).strict()

export const membershipUpdateSchema = z.object({
  roleId: uuidSchema,
  organizationId: uuidSchema.nullable(),
  status: z.enum(['active', 'suspended'])
}).strict()

const roleSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  is_system: z.boolean()
})

const membershipSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  organization_id: uuidSchema.nullable(),
  user_id: uuidSchema,
  role_id: uuidSchema,
  role_code: z.string(),
  role_name: z.string().optional(),
  status: z.enum(['invited', 'active', 'suspended', 'removed']),
  invited_at: dateSchema.nullable().optional(),
  joined_at: dateSchema.nullable().optional(),
  created_at: dateSchema.optional(),
  updated_at: dateSchema.optional(),
  user_name: z.string().optional(),
  user_email: z.string().email().optional(),
  email_verified: z.boolean().optional()
})

const invitationSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  email: z.string().email(),
  role_id: uuidSchema,
  role_code: z.string(),
  organization_id: uuidSchema.nullable(),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
  expires_at: dateSchema,
  invited_by: uuidSchema,
  accepted_by: uuidSchema.nullable().optional(),
  accepted_at: dateSchema.nullable().optional(),
  created_at: dateSchema,
  updated_at: dateSchema.optional()
})

const acceptedMembershipSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  organization_id: uuidSchema.nullable(),
  user_id: uuidSchema,
  role_id: uuidSchema,
  role_code: z.string(),
  status: z.enum(['active']),
  joined_at: dateSchema
})

export class UserManagementFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 404 | 409 | 500
  ) {
    super(message)
    this.name = 'UserManagementFailure'
  }
}

function firstRow(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw[0]
  return raw
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

export function generateInvitationToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

export async function hashInvitationToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token.trim()))
  return toHex(new Uint8Array(digest))
}

export async function listRoles(env: ApiBindings, accessToken: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_list_roles')
  return z.array(roleSchema).parse(Array.isArray(raw) ? raw : [])
}

export async function listMemberships(env: ApiBindings, accessToken: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_list_memberships')
  return z.array(membershipSchema).parse(Array.isArray(raw) ? raw : [])
}

export async function listInvitations(env: ApiBindings, accessToken: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_list_membership_invitations')
  return z.array(invitationSchema).parse(Array.isArray(raw) ? raw : [])
}

export async function createInvitation(
  env: ApiBindings,
  actorUserId: string,
  input: z.infer<typeof invitationCreateSchema>
) {
  const token = generateInvitationToken()
  const tokenHash = await hashInvitationToken(token)
  const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000)

  const sql = createServerDatabase(env)
  const rows = await sql.query(
    'select * from public.app_server_create_membership_invitation($1::uuid,$2::text,$3::uuid,$4::uuid,$5::text,$6::timestamptz)',
    [actorUserId, input.email, input.roleId, input.organizationId ?? null, tokenHash, expiresAt.toISOString()]
  )

  const row = rows[0]
  if (!row) {
    throw new UserManagementFailure(
      'INVITATION_NOT_CREATED',
      'O convite não pôde ser criado. Verifique perfil, organização ou membership existente.',
      409
    )
  }

  const invitation = invitationSchema.pick({
    id: true,
    tenant_id: true,
    email: true,
    role_id: true,
    role_code: true,
    organization_id: true,
    status: true,
    expires_at: true,
    invited_by: true,
    created_at: true
  }).parse(row)

  return { invitation, token }
}

export async function revokeInvitation(
  env: ApiBindings,
  actorUserId: string,
  invitationId: string
) {
  const sql = createServerDatabase(env)
  const rows = await sql.query(
    'select public.app_server_revoke_membership_invitation($1::uuid,$2::uuid) as id',
    [actorUserId, invitationId]
  )
  const parsed = uuidSchema.safeParse(rows[0]?.id)
  if (!parsed.success) {
    throw new UserManagementFailure('INVITATION_NOT_FOUND', 'Convite pendente não encontrado.', 404)
  }
  return parsed.data
}

export async function acceptInvitation(
  env: ApiBindings,
  accessToken: string,
  rawToken: string
) {
  const tokenHash = await hashInvitationToken(rawToken)
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_accept_membership_invitation', {
    invite_token_hash: tokenHash
  })
  const row = firstRow(raw)
  if (!row) {
    throw new UserManagementFailure(
      'INVITATION_INVALID',
      'Convite inválido, expirado, já utilizado ou incompatível com o e-mail autenticado.',
      404
    )
  }
  return acceptedMembershipSchema.parse(row)
}

export async function updateMembership(
  env: ApiBindings,
  actorUserId: string,
  membershipId: string,
  input: z.infer<typeof membershipUpdateSchema>
) {
  const sql = createServerDatabase(env)
  const rows = await sql.query(
    'select * from public.app_server_update_membership($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text)',
    [actorUserId, membershipId, input.roleId, input.organizationId, input.status]
  )
  const row = rows[0]
  if (!row) {
    throw new UserManagementFailure(
      'MEMBERSHIP_UPDATE_REJECTED',
      'A alteração foi rejeitada por contexto, privilégio ou proteção administrativa.',
      409
    )
  }
  return membershipSchema.parse(row)
}
