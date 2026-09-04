import { z } from 'zod'
import { callDataApiRpc } from './data-api'
import { createServerDatabase } from './server-db'
import type { ApiBindings } from './types'

const uuidSchema = z.string().uuid()
const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable().optional()
const nullableNonNegative = z.number().finite().min(0).nullable().optional()
const nullableLatitude = z.number().finite().min(-90).max(90).nullable().optional()
const nullableLongitude = z.number().finite().min(-180).max(180).nullable().optional()

const geoJsonTypeSchema = z.enum([
  'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon',
  'GeometryCollection', 'Feature', 'FeatureCollection'
])

export const geoJsonSchema = z.object({
  type: geoJsonTypeSchema
}).passthrough().superRefine((value, ctx) => {
  const record = value as Record<string, unknown>
  const coordinateTypes = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'])
  if (coordinateTypes.has(value.type) && !Array.isArray(record.coordinates)) {
    ctx.addIssue({ code: 'custom', message: 'GeoJSON exige coordinates para este tipo.' })
  }
  if (value.type === 'Feature' && !('geometry' in record)) {
    ctx.addIssue({ code: 'custom', message: 'GeoJSON Feature exige geometry.' })
  }
  if (value.type === 'FeatureCollection' && !Array.isArray(record.features)) {
    ctx.addIssue({ code: 'custom', message: 'GeoJSON FeatureCollection exige features.' })
  }
  if (value.type === 'GeometryCollection' && !Array.isArray(record.geometries)) {
    ctx.addIssue({ code: 'custom', message: 'GeoJSON GeometryCollection exige geometries.' })
  }
})

const stateCodeSchema = z.string().trim().length(2).transform((value) => value.toUpperCase())
const countryCodeSchema = z.string().trim().length(2).transform((value) => value.toUpperCase())

export const propertyCreateSchema = z.object({
  organizationId: uuidSchema,
  name: z.string().trim().min(2).max(160),
  registrationCode: nullableText(64),
  municipality: nullableText(120),
  stateCode: stateCodeSchema.nullable().optional(),
  countryCode: countryCodeSchema.optional().default('BR'),
  totalAreaHa: nullableNonNegative,
  latitude: nullableLatitude,
  longitude: nullableLongitude
}).strict()

export const propertyPatchSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  registrationCode: nullableText(64),
  municipality: nullableText(120),
  stateCode: stateCodeSchema.nullable().optional(),
  countryCode: countryCodeSchema.nullable().optional(),
  totalAreaHa: nullableNonNegative,
  latitude: nullableLatitude,
  longitude: nullableLongitude
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Informe ao menos um campo para atualização.'
})

export const fieldCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  areaHa: nullableNonNegative,
  geometry: geoJsonSchema.nullable().optional()
}).strict()

export const fieldPatchSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  areaHa: nullableNonNegative,
  geometry: geoJsonSchema.nullable().optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Informe ao menos um campo para atualização.'
})

export const plotCreateSchema = z.object({
  code: nullableText(64),
  name: z.string().trim().min(2).max(160),
  areaHa: nullableNonNegative,
  geometry: geoJsonSchema.nullable().optional()
}).strict()

export const plotPatchSchema = z.object({
  code: nullableText(64),
  name: z.string().trim().min(2).max(160).optional(),
  areaHa: nullableNonNegative,
  geometry: geoJsonSchema.nullable().optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Informe ao menos um campo para atualização.'
})

const isoDate = z.string().or(z.date()).transform((value) => value instanceof Date ? value.toISOString() : value)
const nullableNumeric = z.union([z.number(), z.string()]).transform((value) => Number(value)).nullable()

const propertySchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  organization_id: uuidSchema,
  name: z.string(),
  registration_code: z.string().nullable(),
  municipality: z.string().nullable(),
  state_code: z.string().nullable(),
  country_code: z.string(),
  total_area_ha: nullableNumeric,
  latitude: nullableNumeric,
  longitude: nullableNumeric,
  metadata: z.record(z.string(), z.unknown()),
  created_at: isoDate,
  updated_at: isoDate
})

const fieldSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  property_id: uuidSchema,
  name: z.string(),
  area_ha: nullableNumeric,
  geometry: z.record(z.string(), z.unknown()).nullable(),
  created_at: isoDate,
  updated_at: isoDate
})

const plotSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  field_id: uuidSchema,
  code: z.string().nullable(),
  name: z.string(),
  area_ha: nullableNumeric,
  geometry: z.record(z.string(), z.unknown()).nullable(),
  created_at: isoDate,
  updated_at: isoDate
})

export class RuralFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 404 | 409 | 500
  ) {
    super(message)
    this.name = 'RuralFailure'
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
  if (code === '23505') throw new RuralFailure('RESOURCE_CONFLICT', 'Já existe um registro com estes dados.', 409)
  if (code === '23503') throw new RuralFailure('INVALID_RELATION', 'A relação informada não pertence ao contexto autorizado.', 400)
  if (code === '23514' || code === '23502' || code === '22P02') {
    throw new RuralFailure('INVALID_INPUT', 'Os dados informados são inválidos.', 400)
  }
  throw error
}

export async function listProperties(env: ApiBindings, accessToken: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_list_properties')
  return z.array(propertySchema).parse(Array.isArray(raw) ? raw : [])
}

export async function getProperty(env: ApiBindings, accessToken: string, propertyId: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_get_property', { property_id: propertyId })
  const row = firstRow(raw)
  if (!row) throw new RuralFailure('PROPERTY_NOT_FOUND', 'Propriedade não encontrada.', 404)
  return propertySchema.parse(row)
}

export async function listFields(env: ApiBindings, accessToken: string, propertyId: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_list_fields', { target_property_id: propertyId })
  return z.array(fieldSchema).parse(Array.isArray(raw) ? raw : [])
}

export async function getField(env: ApiBindings, accessToken: string, fieldId: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_get_field', { field_id: fieldId })
  const row = firstRow(raw)
  if (!row) throw new RuralFailure('FIELD_NOT_FOUND', 'Área não encontrada.', 404)
  return fieldSchema.parse(row)
}

export async function listPlots(env: ApiBindings, accessToken: string, fieldId: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_list_plots', { target_field_id: fieldId })
  return z.array(plotSchema).parse(Array.isArray(raw) ? raw : [])
}

export async function getPlot(env: ApiBindings, accessToken: string, plotId: string) {
  const raw = await callDataApiRpc<unknown>(env, accessToken, 'app_get_plot', { plot_id: plotId })
  const row = firstRow(raw)
  if (!row) throw new RuralFailure('PLOT_NOT_FOUND', 'Talhão não encontrado.', 404)
  return plotSchema.parse(row)
}

export async function createProperty(env: ApiBindings, actorUserId: string, input: z.infer<typeof propertyCreateSchema>) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query(
      'select * from public.app_server_create_property($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::text,$8::numeric,$9::numeric,$10::numeric)',
      [actorUserId, input.organizationId, input.name, input.registrationCode ?? null, input.municipality ?? null,
        input.stateCode ?? null, input.countryCode ?? 'BR', input.totalAreaHa ?? null, input.latitude ?? null, input.longitude ?? null]
    )
    if (!rows[0]) throw new RuralFailure('PROPERTY_NOT_FOUND', 'Contexto autorizado para propriedade não encontrado.', 404)
    return propertySchema.parse(rows[0])
  } catch (error) {
    if (error instanceof RuralFailure) throw error
    throwMappedDatabaseError(error)
  }
}

export async function updateProperty(env: ApiBindings, actorUserId: string, propertyId: string, patch: z.infer<typeof propertyPatchSchema>) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query('select * from public.app_server_update_property($1::uuid,$2::uuid,$3::jsonb)', [actorUserId, propertyId, JSON.stringify(patch)])
    if (!rows[0]) throw new RuralFailure('PROPERTY_NOT_FOUND', 'Propriedade não encontrada.', 404)
    return propertySchema.parse(rows[0])
  } catch (error) {
    if (error instanceof RuralFailure) throw error
    throwMappedDatabaseError(error)
  }
}

export async function deleteProperty(env: ApiBindings, actorUserId: string, propertyId: string) {
  const sql = createServerDatabase(env)
  const rows = await sql.query('select public.app_server_delete_property($1::uuid,$2::uuid) as id', [actorUserId, propertyId])
  const parsed = uuidSchema.safeParse(rows[0]?.id)
  if (!parsed.success) throw new RuralFailure('PROPERTY_NOT_FOUND', 'Propriedade não encontrada.', 404)
  return parsed.data
}

export async function createField(env: ApiBindings, actorUserId: string, propertyId: string, input: z.infer<typeof fieldCreateSchema>) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query(
      'select * from public.app_server_create_field($1::uuid,$2::uuid,$3::text,$4::numeric,$5::jsonb)',
      [actorUserId, propertyId, input.name, input.areaHa ?? null, input.geometry ? JSON.stringify(input.geometry) : null]
    )
    if (!rows[0]) throw new RuralFailure('FIELD_NOT_FOUND', 'Contexto autorizado para área não encontrado.', 404)
    return fieldSchema.parse(rows[0])
  } catch (error) {
    if (error instanceof RuralFailure) throw error
    throwMappedDatabaseError(error)
  }
}

export async function updateField(env: ApiBindings, actorUserId: string, fieldId: string, patch: z.infer<typeof fieldPatchSchema>) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query('select * from public.app_server_update_field($1::uuid,$2::uuid,$3::jsonb)', [actorUserId, fieldId, JSON.stringify(patch)])
    if (!rows[0]) throw new RuralFailure('FIELD_NOT_FOUND', 'Área não encontrada.', 404)
    return fieldSchema.parse(rows[0])
  } catch (error) {
    if (error instanceof RuralFailure) throw error
    throwMappedDatabaseError(error)
  }
}

export async function deleteField(env: ApiBindings, actorUserId: string, fieldId: string) {
  const sql = createServerDatabase(env)
  const rows = await sql.query('select public.app_server_delete_field($1::uuid,$2::uuid) as id', [actorUserId, fieldId])
  const parsed = uuidSchema.safeParse(rows[0]?.id)
  if (!parsed.success) throw new RuralFailure('FIELD_NOT_FOUND', 'Área não encontrada.', 404)
  return parsed.data
}

export async function createPlot(env: ApiBindings, actorUserId: string, fieldId: string, input: z.infer<typeof plotCreateSchema>) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query(
      'select * from public.app_server_create_plot($1::uuid,$2::uuid,$3::text,$4::text,$5::numeric,$6::jsonb)',
      [actorUserId, fieldId, input.code ?? null, input.name, input.areaHa ?? null, input.geometry ? JSON.stringify(input.geometry) : null]
    )
    if (!rows[0]) throw new RuralFailure('PLOT_NOT_FOUND', 'Contexto autorizado para talhão não encontrado.', 404)
    return plotSchema.parse(rows[0])
  } catch (error) {
    if (error instanceof RuralFailure) throw error
    throwMappedDatabaseError(error)
  }
}

export async function updatePlot(env: ApiBindings, actorUserId: string, plotId: string, patch: z.infer<typeof plotPatchSchema>) {
  try {
    const sql = createServerDatabase(env)
    const rows = await sql.query('select * from public.app_server_update_plot($1::uuid,$2::uuid,$3::jsonb)', [actorUserId, plotId, JSON.stringify(patch)])
    if (!rows[0]) throw new RuralFailure('PLOT_NOT_FOUND', 'Talhão não encontrado.', 404)
    return plotSchema.parse(rows[0])
  } catch (error) {
    if (error instanceof RuralFailure) throw error
    throwMappedDatabaseError(error)
  }
}

export async function deletePlot(env: ApiBindings, actorUserId: string, plotId: string) {
  const sql = createServerDatabase(env)
  const rows = await sql.query('select public.app_server_delete_plot($1::uuid,$2::uuid) as id', [actorUserId, plotId])
  const parsed = uuidSchema.safeParse(rows[0]?.id)
  if (!parsed.success) throw new RuralFailure('PLOT_NOT_FOUND', 'Talhão não encontrado.', 404)
  return parsed.data
}
