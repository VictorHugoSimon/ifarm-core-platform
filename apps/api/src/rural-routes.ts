import type { Context, Hono } from 'hono'
import { z } from 'zod'
import { extractBearerToken } from './auth'
import { requirePermission } from './authorization'
import { ServerDatabaseConfigurationError } from './server-db'
import {
  createField,
  createPlot,
  createProperty,
  deleteField,
  deletePlot,
  deleteProperty,
  fieldCreateSchema,
  fieldPatchSchema,
  getField,
  getPlot,
  getProperty,
  listFields,
  listPlots,
  listProperties,
  plotCreateSchema,
  plotPatchSchema,
  propertyCreateSchema,
  propertyPatchSchema,
  RuralFailure,
  updateField,
  updatePlot,
  updateProperty
} from './rural'
import type { ApiEnv } from './types'

const uuidSchema = z.string().uuid()

function errorResponse(c: Context<ApiEnv>, error: unknown) {
  if (error instanceof z.ZodError) {
    return c.json({
      error: 'VALIDATION_ERROR',
      message: 'Dados inválidos.',
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      requestId: c.get('requestId')
    }, 400)
  }

  if (error instanceof RuralFailure) {
    return c.json({ error: error.code, message: error.message, requestId: c.get('requestId') }, error.status)
  }

  if (error instanceof ServerDatabaseConfigurationError) {
    return c.json({
      error: 'SERVER_DATABASE_NOT_CONFIGURED',
      message: error.message,
      requestId: c.get('requestId')
    }, 500)
  }

  console.error(JSON.stringify({
    level: 'error',
    requestId: c.get('requestId'),
    event: 'rural_operation_failed',
    message: error instanceof Error ? error.message : 'unknown'
  }))

  return c.json({
    error: 'RURAL_OPERATION_FAILED',
    message: 'Não foi possível concluir a operação rural.',
    requestId: c.get('requestId')
  }, 500)
}

async function readJson(c: Context<ApiEnv>) {
  try {
    return await c.req.json()
  } catch {
    throw new RuralFailure('INVALID_JSON', 'JSON inválido.', 400)
  }
}

export function registerRuralRoutes(app: Hono<ApiEnv>) {
  app.get('/api/v1/properties', requirePermission('property.read'), async (c) => {
    try {
      const token = extractBearerToken(c.req.header('authorization'))
      const properties = await listProperties(c.env, token)
      return c.json({ properties, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/properties/:id', requirePermission('property.read'), async (c) => {
    try {
      const propertyId = uuidSchema.parse(c.req.param('id'))
      const token = extractBearerToken(c.req.header('authorization'))
      const property = await getProperty(c.env, token, propertyId)
      return c.json({ property, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/properties', requirePermission('property.manage'), async (c) => {
    try {
      const input = propertyCreateSchema.parse(await readJson(c))
      const property = await createProperty(c.env, c.get('authUser')!.id, input)
      return c.json({ property, requestId: c.get('requestId') }, 201)
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.patch('/api/v1/properties/:id', requirePermission('property.manage'), async (c) => {
    try {
      const propertyId = uuidSchema.parse(c.req.param('id'))
      const patch = propertyPatchSchema.parse(await readJson(c))
      const property = await updateProperty(c.env, c.get('authUser')!.id, propertyId, patch)
      return c.json({ property, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.delete('/api/v1/properties/:id', requirePermission('property.manage'), async (c) => {
    try {
      const propertyId = uuidSchema.parse(c.req.param('id'))
      const id = await deleteProperty(c.env, c.get('authUser')!.id, propertyId)
      return c.json({ id, deleted: true, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/properties/:propertyId/fields', requirePermission('property.read'), async (c) => {
    try {
      const propertyId = uuidSchema.parse(c.req.param('propertyId'))
      const token = extractBearerToken(c.req.header('authorization'))
      const fields = await listFields(c.env, token, propertyId)
      return c.json({ fields, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/properties/:propertyId/fields', requirePermission('property.manage'), async (c) => {
    try {
      const propertyId = uuidSchema.parse(c.req.param('propertyId'))
      const input = fieldCreateSchema.parse(await readJson(c))
      const field = await createField(c.env, c.get('authUser')!.id, propertyId, input)
      return c.json({ field, requestId: c.get('requestId') }, 201)
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/fields/:id', requirePermission('property.read'), async (c) => {
    try {
      const fieldId = uuidSchema.parse(c.req.param('id'))
      const token = extractBearerToken(c.req.header('authorization'))
      const field = await getField(c.env, token, fieldId)
      return c.json({ field, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.patch('/api/v1/fields/:id', requirePermission('property.manage'), async (c) => {
    try {
      const fieldId = uuidSchema.parse(c.req.param('id'))
      const patch = fieldPatchSchema.parse(await readJson(c))
      const field = await updateField(c.env, c.get('authUser')!.id, fieldId, patch)
      return c.json({ field, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.delete('/api/v1/fields/:id', requirePermission('property.manage'), async (c) => {
    try {
      const fieldId = uuidSchema.parse(c.req.param('id'))
      const id = await deleteField(c.env, c.get('authUser')!.id, fieldId)
      return c.json({ id, deleted: true, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/fields/:fieldId/plots', requirePermission('property.read'), async (c) => {
    try {
      const fieldId = uuidSchema.parse(c.req.param('fieldId'))
      const token = extractBearerToken(c.req.header('authorization'))
      const plots = await listPlots(c.env, token, fieldId)
      return c.json({ plots, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/fields/:fieldId/plots', requirePermission('property.manage'), async (c) => {
    try {
      const fieldId = uuidSchema.parse(c.req.param('fieldId'))
      const input = plotCreateSchema.parse(await readJson(c))
      const plot = await createPlot(c.env, c.get('authUser')!.id, fieldId, input)
      return c.json({ plot, requestId: c.get('requestId') }, 201)
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/plots/:id', requirePermission('property.read'), async (c) => {
    try {
      const plotId = uuidSchema.parse(c.req.param('id'))
      const token = extractBearerToken(c.req.header('authorization'))
      const plot = await getPlot(c.env, token, plotId)
      return c.json({ plot, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.patch('/api/v1/plots/:id', requirePermission('property.manage'), async (c) => {
    try {
      const plotId = uuidSchema.parse(c.req.param('id'))
      const patch = plotPatchSchema.parse(await readJson(c))
      const plot = await updatePlot(c.env, c.get('authUser')!.id, plotId, patch)
      return c.json({ plot, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.delete('/api/v1/plots/:id', requirePermission('property.manage'), async (c) => {
    try {
      const plotId = uuidSchema.parse(c.req.param('id'))
      const id = await deletePlot(c.env, c.get('authUser')!.id, plotId)
      return c.json({ id, deleted: true, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })
}
