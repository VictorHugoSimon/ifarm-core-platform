import { z } from 'zod'
import { callDataApiRpc } from './data-api'
import { createServerDatabase } from './server-db'
import type { ApiBindings } from './types'

const uuidSchema = z.string().uuid()
const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable().optional()

export const partnerCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  documentNumber: nullableText(64),
  partnerType: z.string().trim().min(2).max(64),
  email: z.string().trim().email().max(200).nullable().optional(),
  phone: nullableText(40)
}).strict()

export const partnerPatchSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  documentNumber: nullableText(64),
  partnerType: z.string().trim().min(2).max(64).optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  phone: nullableText(40),
  status: z.string().trim().min(2).max(40).optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Informe ao menos um campo para atualização.'
})

export const documentCreateSchema = z.object({
  organizationId: uuidSchema.nullable().optional(),
  propertyId: uuidSchema.nullable().optional(),
  title: z.string().trim().min(2).max(200),
  category: nullableText(80),
  storagePath: z.string().trim().min(1).max(1024),
  mimeType: nullableText(160),
  sizeBytes: z.number().int().min(0).nullable().optional(),
  checksum: nullableText(160)
}).strict()

export const documentPatchSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  category: nullableText(80),
  storagePath: z.string().trim().min(1).max(1024).optional(),
  mimeType: nullableText(160),
  sizeBytes: z.number().int().min(0).nullable().optional(),
  checksum: nullableText(160)
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Informe ao menos um campo para atualização.'
})

export const notificationCreateSchema = z.object({
  userId: uuidSchema,
  type: z.string().trim().min(1).max(80),
  title: z.string().trim().min(2).max(200),
  body: z.string().trim().min(1).max(4000).nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional().default({})
}).strict()

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0)
})

const isoDate = z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value)
const nullableIsoDate = z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value).nullable()

const partnerSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  name: z.string(),
  document_number: z.string().nullable(),
  partner_type: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: isoDate,
  updated_at: isoDate
})

const documentSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  organization_id: uuidSchema.nullable(),
  property_id: uuidSchema.nullable(),
  title: z.string(),
  category: z.string().nullable(),
  storage_path: z.string(),
  mime_type: z.string().nullable(),
  size_bytes: z.union([z.number(), z.string()]).transform((value) => Number(value)).nullable(),
  checksum: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  created_by: uuidSchema,
  created_at: isoDate,
  updated_at: isoDate
})

const notificationSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  user_id: uuidSchema,
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
  read_at: nullableIsoDate,
  created_at: isoDate
})

const auditEventSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  actor_id: uuidSchema.nullable(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string().nullable(),
  request_id: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  occurred_at: isoDate
})

export class OperationsFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 404 | 409 | 500
  ) {
    super(message)
    this.name = 'OperationsFailure'
  }
}

function firstRow(raw: unknown): unknown {
  return Array.isArray(raw) ? raw[0] : raw
}

function databaseCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function throwMappedDatabaseError(error: unknown): never {
  const code = databaseCode(error)
  if (code === '23505') throw new OperationsFailure('RESOURCE_CONFLICT', 'Já existe um registro com estes dados.', 409)
  if (code === '23503') throw new OperationsFailure('INVALID_RELATION', 'A relação informada não pertence ao contexto autorizado.', 400)
  if (code === '23514' || code === '23502' || code === '22P02') {
    throw new OperationsFailure('INVALID_INPUT', 'Os dados informados são inválidos.', 400)
  }
  throw error
}

export async function listPartners(env: ApiBindings, token: string) {
  const raw = await callDataApiRpc<unknown>(env, token, 'app_list_partners')
  return z.array(partnerSchema).parse(Array.isArray(raw) ? raw : [])
}

export async function getPartner(env: ApiBindings, token: string, id: string) {
  const raw = await callDataApiRpc<unknown>(env, token, 'app_get_partner', { target_partner_id: id })
  const row = firstRow(raw)
  if (!row) throw new OperationsFailure('PARTNER_NOT_FOUND', 'Parceiro não encontrado.', 404)
  return partnerSchema.parse(row)
}

export async function createPartner(env: ApiBindings, actorUserId: string, input: z.infer<typeof partnerCreateSchema>) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query(
      'select * from public.app_server_create_partner($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text)',
      [actorUserId, input.name, input.documentNumber ?? null, input.partnerType, input.email ?? null, input.phone ?? null]
    )
    if (!rows[0]) throw new OperationsFailure('PARTNER_NOT_FOUND', 'Contexto autorizado para parceiro não encontrado.', 404)
    return partnerSchema.parse(rows[0])
  } catch (error) {
    if (error instanceof OperationsFailure) throw error
    throwMappedDatabaseError(error)
  }
}

export async function updatePartner(env: ApiBindings, actorUserId: string, id: string, patch: z.infer<typeof partnerPatchSchema>) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query('select * from public.app_server_update_partner($1::uuid,$2::uuid,$3::jsonb)', [actorUserId, id, JSON.stringify(patch)])
    if (!rows[0]) throw new OperationsFailure('PARTNER_NOT_FOUND', 'Parceiro não encontrado.', 404)
    return partnerSchema.parse(rows[0])
  } catch (error) {
    if (error instanceof OperationsFailure) throw error
    throwMappedDatabaseError(error)
  }
}

export async function deletePartner(env: ApiBindings, actorUserId: string, id: string) {
  const sql = createServerDatabase(env)
  const rows = await sql.query('select public.app_server_delete_partner($1::uuid,$2::uuid) as id', [actorUserId, id])
  const parsed = uuidSchema.safeParse(rows[0]?.id)
  if (!parsed.success) throw new OperationsFailure('PARTNER_NOT_FOUND', 'Parceiro não encontrado.', 404)
  return parsed.data
}

export async function listDocuments(env: ApiBindings, token: string) {
  const raw = await callDataApiRpc<unknown>(env, token, 'app_list_documents')
  return z.array(documentSchema).parse(Array.isArray(raw) ? raw : [])
}

export async function getDocument(env: ApiBindings, token: string, id: string) {
  const raw = await callDataApiRpc<unknown>(env, token, 'app_get_document', { target_document_id: id })
  const row = firstRow(raw)
  if (!row) throw new OperationsFailure('DOCUMENT_NOT_FOUND', 'Documento não encontrado.', 404)
  return documentSchema.parse(row)
}

export async function createDocument(env: ApiBindings, actorUserId: string, input: z.infer<typeof documentCreateSchema>) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query(
      'select * from public.app_server_create_document($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::text,$7::text,$8::bigint,$9::text)',
      [actorUserId, input.organizationId ?? null, input.propertyId ?? null, input.title, input.category ?? null,
        input.storagePath, input.mimeType ?? null, input.sizeBytes ?? null, input.checksum ?? null]
    )
    if (!rows[0]) throw new OperationsFailure('DOCUMENT_NOT_FOUND', 'Contexto autorizado para documento não encontrado.', 404)
    return documentSchema.parse(rows[0])
  } catch (error) {
    if (error instanceof OperationsFailure) throw error
    throwMappedDatabaseError(error)
  }
}

export async function updateDocument(env: ApiBindings, actorUserId: string, id: string, patch: z.infer<typeof documentPatchSchema>) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query('select * from public.app_server_update_document($1::uuid,$2::uuid,$3::jsonb)', [actorUserId, id, JSON.stringify(patch)])
    if (!rows[0]) throw new OperationsFailure('DOCUMENT_NOT_FOUND', 'Documento não encontrado.', 404)
    return documentSchema.parse(rows[0])
  } catch (error) {
    if (error instanceof OperationsFailure) throw error
    throwMappedDatabaseError(error)
  }
}

export async function deleteDocument(env: ApiBindings, actorUserId: string, id: string) {
  const sql = createServerDatabase(env)
  const rows = await sql.query('select public.app_server_delete_document($1::uuid,$2::uuid) as id', [actorUserId, id])
  const parsed = uuidSchema.safeParse(rows[0]?.id)
  if (!parsed.success) throw new OperationsFailure('DOCUMENT_NOT_FOUND', 'Documento não encontrado.', 404)
  return parsed.data
}

export async function listNotifications(env: ApiBindings, token: string) {
  const raw = await callDataApiRpc<unknown>(env, token, 'app_list_notifications')
  return z.array(notificationSchema).parse(Array.isArray(raw) ? raw : [])
}

export async function createNotification(env: ApiBindings, actorUserId: string, input: z.infer<typeof notificationCreateSchema>) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query(
      'select * from public.app_server_create_notification($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb)',
      [actorUserId, input.userId, input.type, input.title, input.body ?? null, JSON.stringify(input.data)]
    )
    if (!rows[0]) throw new OperationsFailure('NOTIFICATION_TARGET_NOT_FOUND', 'Destinatário autorizado não encontrado.', 404)
    return notificationSchema.parse(rows[0])
  } catch (error) {
    if (error instanceof OperationsFailure) throw error
    throwMappedDatabaseError(error)
  }
}

export async function markNotificationRead(env: ApiBindings, token: string, id: string) {
  const raw = await callDataApiRpc<unknown>(env, token, 'app_mark_notification_read', { target_notification_id: id })
  const candidate = Array.isArray(raw) ? raw[0] : raw
  const value = candidate && typeof candidate === 'object' && 'app_mark_notification_read' in candidate
    ? (candidate as { app_mark_notification_read?: unknown }).app_mark_notification_read
    : candidate
  const parsed = uuidSchema.safeParse(value)
  if (!parsed.success) throw new OperationsFailure('NOTIFICATION_NOT_FOUND', 'Notificação não encontrada.', 404)
  return parsed.data
}

export async function listAuditEvents(env: ApiBindings, token: string, query: z.infer<typeof auditQuerySchema>) {
  const raw = await callDataApiRpc<unknown>(env, token, 'app_list_audit_events', {
    row_limit: query.limit,
    row_offset: query.offset
  })
  return z.array(auditEventSchema).parse(Array.isArray(raw) ? raw : [])
}
