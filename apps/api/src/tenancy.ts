import { z } from 'zod'
import { callDataApiRpc } from './data-api'
import { createServerDatabase } from './server-db'
import type { ApiBindings } from './types'

const uuidSchema = z.string().uuid()
const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable().optional()

export const activeTenantInputSchema = z.object({
  tenantId: uuidSchema
}).strict()

export const organizationCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  parentId: uuidSchema.nullable().optional(),
  documentNumber: nullableText(64),
  email: z.string().trim().email().max(254).nullable().optional(),
  phone: nullableText(32)
}).strict()

export const organizationPatchSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  parentId: uuidSchema.nullable().optional(),
  documentNumber: nullableText(64),
  email: z.string().trim().email().max(254).nullable().optional(),
  phone: nullableText(32)
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Informe ao menos um campo para atualização.'
})

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/)
export const whiteLabelSchema = z.object({
  brandName: z.string().trim().min(2).max(120),
  logoUrl: z.string().url().max(2048).nullable().optional(),
  primaryColor: hexColorSchema.optional(),
  accentColor: hexColorSchema.optional()
}).strict()

export const adminTenantCreateSchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  legalName: z.string().trim().min(2).max(180),
  tradeName: z.string().trim().min(2).max(180).nullable().optional()
}).strict()

const tenantMembershipSchema = z.object({
  tenant_id: uuidSchema,
  slug: z.string(),
  legal_name: z.string(),
  trade_name: z.string().nullable(),
  role_code: z.string(),
  active: z.boolean().nullable().transform((value) => value === true)
})

const tenantSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  legal_name: z.string(),
  trade_name: z.string().nullable(),
  status: z.enum(['trial', 'active', 'suspended', 'cancelled']),
  metadata: z.record(z.string(), z.unknown()).optional().default({})
})

const adminTenantSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  legal_name: z.string(),
  trade_name: z.string().nullable(),
  status: z.enum(['trial', 'active', 'suspended', 'cancelled']),
  created_at: z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value)
})

const organizationSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  parent_id: uuidSchema.nullable(),
  name: z.string(),
  document_number: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value),
  updated_at: z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value)
})

const identityContextSchema = z.object({
  tenant_id: uuidSchema.nullable().optional(),
  membership_id: uuidSchema.nullable().optional(),
  role_id: uuidSchema.nullable().optional(),
  core_role: z.string().nullable().optional(),
  is_ifarm_admin: z.boolean().optional().default(false),
  requires_mfa: z.boolean().optional().default(false)
})

export class TenancyFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 404 | 409 | 500
  ) {
    super(message)
    this.name = 'TenancyFailure'
  }
}

function firstRow(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw[0]
  return raw
}

function databaseCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function throwMappedDatabaseError(error: unknown): never {
  const code = databaseCode(error)
  if (code === '23505') {
    throw new TenancyFailure('RESOURCE_CONFLICT', 'Já existe um registro com estes dados.', 409)
  }
  if (code === '23503') {
    throw new TenancyFailure('INVALID_RELATION', 'A relação informada não pertence ao contexto autorizado.', 400)
  }
  if (code === '23502' || code === '22P02') {
    throw new TenancyFailure('INVALID_INPUT', 'Os dados informados são inválidos.', 400)
  }
  throw error
}

export async function listMyTenants(env: ApiBindings, accessToken: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_my_tenants')
  return z.array(tenantMembershipSchema).parse(Array.isArray(raw) ? raw : [])
}

export async function setActiveTenant(env: ApiBindings, accessToken: string, tenantId: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_set_active_tenant', {
    requested_tenant: tenantId
  })
  const parsedTenant = uuidSchema.safeParse(firstRow(raw))
  if (!parsedTenant.success) {
    throw new TenancyFailure(
      'TENANT_MEMBERSHIP_NOT_FOUND',
      'Tenant não encontrado para a identidade autenticada.',
      404
    )
  }

  const contextRaw = await callDataApiRpc<unknown>(env, accessToken, 'app_identity_context')
  const context = identityContextSchema.parse(firstRow(contextRaw) ?? {})
  return { tenantId: parsedTenant.data, context }
}

export async function getCurrentTenant(env: ApiBindings, accessToken: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_current_tenant_details')
  const row = firstRow(raw)
  if (!row) throw new TenancyFailure('TENANT_NOT_FOUND', 'Tenant ativo não encontrado.', 404)
  return tenantSchema.parse(row)
}

export async function listOrganizations(env: ApiBindings, accessToken: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_list_organizations')
  return z.array(organizationSchema).parse(Array.isArray(raw) ? raw : [])
}

export async function getOrganization(env: ApiBindings, accessToken: string, organizationId: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_get_organization', {
    organization_id: organizationId
  })
  const row = firstRow(raw)
  if (!row) throw new TenancyFailure('ORGANIZATION_NOT_FOUND', 'Organização não encontrada.', 404)
  return organizationSchema.parse(row)
}

export async function getWhiteLabel(env: ApiBindings, accessToken: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_get_white_label')
  const candidate = firstRow(raw) ?? raw
  if (!candidate || (typeof candidate === 'object' && Object.keys(candidate as object).length === 0)) {
    return null
  }
  return whiteLabelSchema.parse(candidate)
}

export async function adminListTenants(env: ApiBindings, actorUserId: string) {
  const sql = createServerDatabase(env)
  const rows = await sql.query(
    'select * from public.app_server_list_tenants($1::uuid)',
    [actorUserId]
  )
  return z.array(adminTenantSchema).parse(rows)
}

export async function adminCreateTenant(
  env: ApiBindings,
  actorUserId: string,
  input: z.infer<typeof adminTenantCreateSchema>
) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query(
      'select * from public.app_server_create_tenant($1::uuid,$2::text,$3::text,$4::text)',
      [actorUserId, input.slug, input.legalName, input.tradeName ?? null]
    )
    const row = rows[0]
    if (!row) throw new TenancyFailure('FORBIDDEN', 'Operação administrativa não autorizada.', 404)
    return adminTenantSchema.parse(row)
  } catch (error) {
    if (error instanceof TenancyFailure) throw error
    throwMappedDatabaseError(error)
  }
}

export async function createOrganization(
  env: ApiBindings,
  actorUserId: string,
  input: z.infer<typeof organizationCreateSchema>
) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query(
      'select * from public.app_server_create_organization($1::uuid,$2::text,$3::uuid,$4::text,$5::text,$6::text)',
      [actorUserId, input.name, input.parentId ?? null, input.documentNumber ?? null, input.email ?? null, input.phone ?? null]
    )
    const row = rows[0]
    if (!row) throw new TenancyFailure('ORGANIZATION_NOT_FOUND', 'Contexto de organização não encontrado.', 404)
    return organizationSchema.parse(row)
  } catch (error) {
    if (error instanceof TenancyFailure) throw error
    throwMappedDatabaseError(error)
  }
}

export async function updateOrganization(
  env: ApiBindings,
  actorUserId: string,
  organizationId: string,
  patch: z.infer<typeof organizationPatchSchema>
) {
  if (patch.parentId === organizationId) {
    throw new TenancyFailure('INVALID_PARENT', 'Uma organização não pode ser pai de si mesma.', 400)
  }

  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query(
      'select * from public.app_server_update_organization($1::uuid,$2::uuid,$3::jsonb)',
      [actorUserId, organizationId, JSON.stringify(patch)]
    )
    const row = rows[0]
    if (!row) throw new TenancyFailure('ORGANIZATION_NOT_FOUND', 'Organização não encontrada.', 404)
    return organizationSchema.parse(row)
  } catch (error) {
    if (error instanceof TenancyFailure) throw error
    throwMappedDatabaseError(error)
  }
}

export async function deleteOrganization(
  env: ApiBindings,
  actorUserId: string,
  organizationId: string
) {
  const sql = createServerDatabase(env)
  const rows = await sql.query(
    'select public.app_server_delete_organization($1::uuid,$2::uuid) as id',
    [actorUserId, organizationId]
  )
  const parsed = uuidSchema.safeParse(rows[0]?.id)
  if (!parsed.success) throw new TenancyFailure('ORGANIZATION_NOT_FOUND', 'Organização não encontrada.', 404)
  return parsed.data
}

export async function updateWhiteLabel(
  env: ApiBindings,
  actorUserId: string,
  branding: z.infer<typeof whiteLabelSchema>
) {
  const sql = createServerDatabase(env)
  const rows = await sql.query(
    'select public.app_server_update_white_label($1::uuid,$2::jsonb) as value',
    [actorUserId, JSON.stringify(branding)]
  )
  const row = rows[0]
  if (!row?.value) throw new TenancyFailure('TENANT_NOT_FOUND', 'Tenant ativo não encontrado.', 404)
  return whiteLabelSchema.parse(row.value)
}
