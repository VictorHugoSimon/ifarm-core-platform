import { z } from 'zod'
import { callDataApiRpc } from './data-api'
import { createServerDatabase } from './server-db'
import type { ApiBindings } from './types'

const uuidSchema = z.string().uuid()
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const currencySchema = z.string().trim().length(3).regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase())
const centsSchema = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

export const contractCreateSchema = z.object({
  partnerId: uuidSchema.nullable().optional(),
  contractNumber: z.string().trim().min(1).max(80),
  title: z.string().trim().min(2).max(180),
  status: z.enum(['draft', 'active', 'suspended', 'ended', 'cancelled']).default('draft'),
  currency: currencySchema.default('BRL'),
  startsOn: dateSchema,
  endsOn: dateSchema.nullable().optional(),
  recurringMonthlyCents: centsSchema.default(0)
}).strict().refine((value) => !value.endsOn || value.endsOn >= value.startsOn, {
  message: 'A data final não pode ser anterior à data inicial.',
  path: ['endsOn']
})

export const revenueCreateSchema = z.object({
  dueDate: dateSchema,
  amountCents: centsSchema,
  currency: currencySchema.default('BRL'),
  status: z.enum(['scheduled', 'paid', 'cancelled', 'overdue']).default('scheduled'),
  paidAt: z.string().datetime({ offset: true }).nullable().optional()
}).strict().refine((value) => value.status !== 'paid' || Boolean(value.paidAt), {
  message: 'paidAt é obrigatório para receita paga.',
  path: ['paidAt']
})

export const moduleUpsertSchema = z.object({
  contractId: uuidSchema.nullable().optional(),
  status: z.enum(['trial', 'active', 'suspended', 'cancelled']),
  startsOn: dateSchema,
  endsOn: dateSchema.nullable().optional()
}).strict().refine((value) => !value.endsOn || value.endsOn >= value.startsOn, {
  message: 'A data final não pode ser anterior à data inicial.',
  path: ['endsOn']
})

export const integrationCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  provider: z.string().trim().min(2).max(120),
  status: z.enum(['configuring', 'active', 'error', 'disabled']).default('configuring')
}).strict()

const financialSchema = z.object({
  currency: z.string().length(3),
  mrrCents: centsSchema,
  arrCents: centsSchema,
  revenueForecastNext12MonthsCents: centsSchema,
  revenueReceivedYtdCents: centsSchema
})

const tenantDashboardSchema = z.object({
  scope: z.literal('tenant'),
  tenantId: uuidSchema,
  generatedAt: z.string(),
  counts: z.object({
    organizations: z.coerce.number().int().nonnegative(),
    properties: z.coerce.number().int().nonnegative(),
    activeUsers: z.coerce.number().int().nonnegative(),
    partners: z.coerce.number().int().nonnegative(),
    documents: z.coerce.number().int().nonnegative(),
    integrations: z.coerce.number().int().nonnegative(),
    activeContracts: z.coerce.number().int().nonnegative(),
    activeModules: z.coerce.number().int().nonnegative()
  }),
  financialByCurrency: z.array(financialSchema),
  modules: z.array(z.object({
    code: z.string(),
    name: z.string(),
    status: z.string(),
    contractId: uuidSchema.nullable(),
    startsOn: z.string(),
    endsOn: z.string().nullable()
  })),
  alerts: z.object({
    contractsExpiring30Days: z.coerce.number().int().nonnegative(),
    integrationsError: z.coerce.number().int().nonnegative(),
    invitationsExpiring48h: z.coerce.number().int().nonnegative(),
    unreadNotifications: z.coerce.number().int().nonnegative()
  })
})

const adminDashboardSchema = z.object({
  scope: z.literal('ifarm-admin'),
  generatedAt: z.string(),
  counts: z.object({
    tenants: z.coerce.number().int().nonnegative(),
    activeTenants: z.coerce.number().int().nonnegative(),
    organizations: z.coerce.number().int().nonnegative(),
    properties: z.coerce.number().int().nonnegative(),
    activeUsers: z.coerce.number().int().nonnegative(),
    partners: z.coerce.number().int().nonnegative(),
    documents: z.coerce.number().int().nonnegative(),
    activeContracts: z.coerce.number().int().nonnegative(),
    activeModules: z.coerce.number().int().nonnegative(),
    integrations: z.coerce.number().int().nonnegative()
  }),
  financialByCurrency: z.array(financialSchema),
  moduleDistribution: z.array(z.object({
    code: z.string(),
    name: z.string(),
    activeTenants: z.coerce.number().int().nonnegative()
  })),
  alerts: z.object({
    contractsExpiring30Days: z.coerce.number().int().nonnegative(),
    integrationsError: z.coerce.number().int().nonnegative(),
    pendingInvitations: z.coerce.number().int().nonnegative()
  })
})

const contractSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  partner_id: uuidSchema.nullable(),
  contract_number: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'active', 'suspended', 'ended', 'cancelled']),
  currency: z.string(),
  starts_on: z.string(),
  ends_on: z.string().nullable(),
  recurring_monthly_cents: centsSchema,
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value),
  updated_at: z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value),
  deleted_at: z.string().or(z.date()).nullable().transform((value) => value instanceof Date ? value.toISOString() : value)
})

const integrationSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  name: z.string(),
  provider: z.string(),
  status: z.enum(['configuring', 'active', 'error', 'disabled']),
  last_success_at: z.string().or(z.date()).nullable().transform((value) => value instanceof Date ? value.toISOString() : value),
  last_error_at: z.string().or(z.date()).nullable().transform((value) => value instanceof Date ? value.toISOString() : value),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value),
  updated_at: z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value),
  deleted_at: z.string().or(z.date()).nullable().transform((value) => value instanceof Date ? value.toISOString() : value)
})

const revenueSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  contract_id: uuidSchema,
  due_date: z.string(),
  amount_cents: centsSchema,
  currency: z.string(),
  status: z.enum(['scheduled', 'paid', 'cancelled', 'overdue']),
  paid_at: z.string().or(z.date()).nullable().transform((value) => value instanceof Date ? value.toISOString() : value),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value),
  updated_at: z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value)
})

const moduleSchema = z.object({
  tenant_id: uuidSchema,
  module_code: z.string(),
  contract_id: uuidSchema.nullable(),
  status: z.enum(['trial', 'active', 'suspended', 'cancelled']),
  starts_on: z.string(),
  ends_on: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value),
  updated_at: z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value)
})

export class DashboardFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 500
  ) {
    super(message)
    this.name = 'DashboardFailure'
  }
}

function firstRow(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw[0]
  return raw
}

function unwrapJsonValue(raw: unknown): unknown {
  const row = firstRow(raw)
  if (row && typeof row === 'object') {
    const values = Object.values(row as Record<string, unknown>)
    if (values.length === 1) return values[0]
  }
  return row
}

function mapDatabaseError(error: unknown): never {
  const code = error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : undefined
  if (code === '23505') throw new DashboardFailure('RESOURCE_CONFLICT', 'Já existe um registro com estes dados.', 409)
  if (code === '23503') throw new DashboardFailure('INVALID_RELATION', 'A relação informada não pertence ao contexto autorizado.', 400)
  if (code === '23514' || code === '22P02') throw new DashboardFailure('INVALID_INPUT', 'Os dados informados são inválidos.', 400)
  throw error
}

export async function getTenantDashboard(env: ApiBindings, accessToken: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_dashboard_summary')
  const value = unwrapJsonValue(raw)
  if (!value) throw new DashboardFailure('DASHBOARD_NOT_AVAILABLE', 'Dashboard não disponível para o contexto atual.', 404)
  return tenantDashboardSchema.parse(value)
}

export async function getAdminDashboard(env: ApiBindings, actorUserId: string) {
  const sql = createServerDatabase(env)
  const rows = await sql.query('select public.app_server_admin_dashboard_summary($1::uuid) as summary', [actorUserId])
  const value = rows[0]?.summary
  if (!value) throw new DashboardFailure('ADMIN_DASHBOARD_FORBIDDEN', 'Dashboard administrativo não autorizado.', 403)
  return adminDashboardSchema.parse(value)
}

export async function listContracts(env: ApiBindings, accessToken: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_list_contracts')
  return z.array(contractSchema).parse(Array.isArray(raw) ? raw : [])
}

export async function createContract(env: ApiBindings, actorUserId: string, input: z.infer<typeof contractCreateSchema>) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query(
      'select * from public.app_server_create_contract($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::date,$8::date,$9::bigint)',
      [actorUserId, input.partnerId ?? null, input.contractNumber, input.title, input.status, input.currency, input.startsOn, input.endsOn ?? null, input.recurringMonthlyCents]
    )
    if (!rows[0]) throw new DashboardFailure('CONTRACT_NOT_CREATED', 'Contrato não criado no contexto autorizado.', 404)
    return contractSchema.parse(rows[0])
  } catch (error) {
    if (error instanceof DashboardFailure) throw error
    mapDatabaseError(error)
  }
}

export async function addRevenueEntry(env: ApiBindings, actorUserId: string, contractId: string, input: z.infer<typeof revenueCreateSchema>) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query(
      'select * from public.app_server_add_revenue_entry($1::uuid,$2::uuid,$3::date,$4::bigint,$5::text,$6::text,$7::timestamptz)',
      [actorUserId, contractId, input.dueDate, input.amountCents, input.currency, input.status, input.paidAt ?? null]
    )
    if (!rows[0]) throw new DashboardFailure('REVENUE_NOT_CREATED', 'Receita não criada no contexto autorizado.', 404)
    return revenueSchema.parse(rows[0])
  } catch (error) {
    if (error instanceof DashboardFailure) throw error
    mapDatabaseError(error)
  }
}

export async function upsertTenantModule(env: ApiBindings, actorUserId: string, moduleCode: string, input: z.infer<typeof moduleUpsertSchema>) {
  const normalizedCode = moduleCode.trim().toLowerCase()
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(normalizedCode)) throw new DashboardFailure('INVALID_MODULE_CODE', 'Código de módulo inválido.', 400)
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query(
      'select * from public.app_server_upsert_tenant_module($1::uuid,$2::text,$3::uuid,$4::text,$5::date,$6::date)',
      [actorUserId, normalizedCode, input.contractId ?? null, input.status, input.startsOn, input.endsOn ?? null]
    )
    if (!rows[0]) throw new DashboardFailure('MODULE_NOT_UPDATED', 'Módulo não atualizado no contexto autorizado.', 404)
    return moduleSchema.parse(rows[0])
  } catch (error) {
    if (error instanceof DashboardFailure) throw error
    mapDatabaseError(error)
  }
}

export async function listIntegrations(env: ApiBindings, accessToken: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_list_integrations')
  return z.array(integrationSchema).parse(Array.isArray(raw) ? raw : [])
}

export async function createIntegration(env: ApiBindings, actorUserId: string, input: z.infer<typeof integrationCreateSchema>) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query(
      'select * from public.app_server_create_integration($1::uuid,$2::text,$3::text,$4::text)',
      [actorUserId, input.name, input.provider, input.status]
    )
    if (!rows[0]) throw new DashboardFailure('INTEGRATION_NOT_CREATED', 'Integração não criada no contexto autorizado.', 404)
    return integrationSchema.parse(rows[0])
  } catch (error) {
    if (error instanceof DashboardFailure) throw error
    mapDatabaseError(error)
  }
}
