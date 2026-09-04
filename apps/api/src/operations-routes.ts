import type { Context, Hono } from 'hono'
import { z } from 'zod'
import { extractBearerToken } from './auth'
import { requirePermission } from './authorization'
import {
  auditQuerySchema,
  createDocument,
  createNotification,
  createPartner,
  deleteDocument,
  deletePartner,
  documentCreateSchema,
  documentPatchSchema,
  getDocument,
  getPartner,
  listAuditEvents,
  listDocuments,
  listNotifications,
  listPartners,
  markNotificationRead,
  notificationCreateSchema,
  OperationsFailure,
  partnerCreateSchema,
  partnerPatchSchema,
  updateDocument,
  updatePartner
} from './operations'
import { ServerDatabaseConfigurationError } from './server-db'
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

  if (error instanceof OperationsFailure) {
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
    event: 'core_operations_failed',
    message: error instanceof Error ? error.message : 'unknown'
  }))

  return c.json({
    error: 'CORE_OPERATION_FAILED',
    message: 'Não foi possível concluir a operação.',
    requestId: c.get('requestId')
  }, 500)
}

async function readJson(c: Context<ApiEnv>) {
  try {
    return await c.req.json()
  } catch {
    throw new OperationsFailure('INVALID_JSON', 'JSON inválido.', 400)
  }
}

export function registerOperationsRoutes(app: Hono<ApiEnv>) {
  app.get('/api/v1/partners', requirePermission('partner.read'), async (c) => {
    try {
      const token = extractBearerToken(c.req.header('authorization'))
      const partners = await listPartners(c.env, token)
      return c.json({ partners, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/partners/:id', requirePermission('partner.read'), async (c) => {
    try {
      const id = uuidSchema.parse(c.req.param('id'))
      const token = extractBearerToken(c.req.header('authorization'))
      const partner = await getPartner(c.env, token, id)
      return c.json({ partner, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/partners', requirePermission('partner.manage'), async (c) => {
    try {
      const input = partnerCreateSchema.parse(await readJson(c))
      const partner = await createPartner(c.env, c.get('authUser')!.id, input)
      return c.json({ partner, requestId: c.get('requestId') }, 201)
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.patch('/api/v1/partners/:id', requirePermission('partner.manage'), async (c) => {
    try {
      const id = uuidSchema.parse(c.req.param('id'))
      const patch = partnerPatchSchema.parse(await readJson(c))
      const partner = await updatePartner(c.env, c.get('authUser')!.id, id, patch)
      return c.json({ partner, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.delete('/api/v1/partners/:id', requirePermission('partner.manage'), async (c) => {
    try {
      const id = uuidSchema.parse(c.req.param('id'))
      const deletedId = await deletePartner(c.env, c.get('authUser')!.id, id)
      return c.json({ id: deletedId, deleted: true, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/documents', requirePermission('document.read'), async (c) => {
    try {
      const token = extractBearerToken(c.req.header('authorization'))
      const documents = await listDocuments(c.env, token)
      return c.json({ documents, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/documents/:id', requirePermission('document.read'), async (c) => {
    try {
      const id = uuidSchema.parse(c.req.param('id'))
      const token = extractBearerToken(c.req.header('authorization'))
      const document = await getDocument(c.env, token, id)
      return c.json({ document, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/documents', requirePermission('document.manage'), async (c) => {
    try {
      const input = documentCreateSchema.parse(await readJson(c))
      const document = await createDocument(c.env, c.get('authUser')!.id, input)
      return c.json({ document, requestId: c.get('requestId') }, 201)
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.patch('/api/v1/documents/:id', requirePermission('document.manage'), async (c) => {
    try {
      const id = uuidSchema.parse(c.req.param('id'))
      const patch = documentPatchSchema.parse(await readJson(c))
      const document = await updateDocument(c.env, c.get('authUser')!.id, id, patch)
      return c.json({ document, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.delete('/api/v1/documents/:id', requirePermission('document.manage'), async (c) => {
    try {
      const id = uuidSchema.parse(c.req.param('id'))
      const deletedId = await deleteDocument(c.env, c.get('authUser')!.id, id)
      return c.json({ id: deletedId, deleted: true, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/notifications', requirePermission('notification.read'), async (c) => {
    try {
      const token = extractBearerToken(c.req.header('authorization'))
      const notifications = await listNotifications(c.env, token)
      return c.json({ notifications, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/notifications', requirePermission('notification.manage'), async (c) => {
    try {
      const input = notificationCreateSchema.parse(await readJson(c))
      const notification = await createNotification(c.env, c.get('authUser')!.id, input)
      return c.json({ notification, requestId: c.get('requestId') }, 201)
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/notifications/:id/read', requirePermission('notification.read'), async (c) => {
    try {
      const id = uuidSchema.parse(c.req.param('id'))
      const token = extractBearerToken(c.req.header('authorization'))
      const notificationId = await markNotificationRead(c.env, token, id)
      return c.json({ id: notificationId, read: true, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/audit-events', requirePermission('audit.read'), async (c) => {
    try {
      const query = auditQuerySchema.parse({
        limit: c.req.query('limit'),
        offset: c.req.query('offset')
      })
      const token = extractBearerToken(c.req.header('authorization'))
      const events = await listAuditEvents(c.env, token, query)
      return c.json({ events, pagination: query, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })
}
