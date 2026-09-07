import type { Context, Hono } from 'hono'
import { z } from 'zod'
import { extractBearerToken } from './auth'
import { requirePermission } from './authorization'
import { ServerDatabaseConfigurationError } from './server-db'
import type { ApiEnv } from './types'
import {
  acceptInvitation,
  createInvitation,
  invitationAcceptSchema,
  invitationCreateSchema,
  listInvitations,
  listMemberships,
  listRoles,
  membershipUpdateSchema,
  revokeInvitation,
  updateMembership,
  UserManagementFailure
} from './user-management'

const uuidSchema = z.string().uuid()

async function readJson(c: Context<ApiEnv>) {
  try {
    return await c.req.json()
  } catch {
    throw new UserManagementFailure('INVALID_JSON', 'JSON inválido.', 400)
  }
}

function errorResponse(c: Context<ApiEnv>, error: unknown) {
  if (error instanceof z.ZodError) {
    return c.json({
      error: 'VALIDATION_ERROR',
      message: 'Dados inválidos.',
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      requestId: c.get('requestId')
    }, 400)
  }

  if (error instanceof UserManagementFailure) {
    return c.json({
      error: error.code,
      message: error.message,
      requestId: c.get('requestId')
    }, error.status)
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
    event: 'user_management_operation_failed',
    requestId: c.get('requestId'),
    message: error instanceof Error ? error.message : 'unknown'
  }))

  return c.json({
    error: 'USER_MANAGEMENT_OPERATION_FAILED',
    message: 'Não foi possível concluir a operação de usuários.',
    requestId: c.get('requestId')
  }, 500)
}

export function registerUserManagementRoutes(app: Hono<ApiEnv>) {
  app.get('/api/v1/roles', requirePermission('rbac.read'), async (c) => {
    try {
      const token = extractBearerToken(c.req.header('authorization'))
      const roles = await listRoles(c.env, token)
      return c.json({ roles, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/memberships', requirePermission('user.read'), async (c) => {
    try {
      const token = extractBearerToken(c.req.header('authorization'))
      const memberships = await listMemberships(c.env, token)
      return c.json({ memberships, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.patch('/api/v1/memberships/:id', requirePermission('user.manage'), async (c) => {
    try {
      const membershipId = uuidSchema.parse(c.req.param('id'))
      const input = membershipUpdateSchema.parse(await readJson(c))
      const actor = c.get('authUser')!
      const membership = await updateMembership(c.env, actor.id, membershipId, input)
      return c.json({ membership, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/membership-invitations', requirePermission('user.manage'), async (c) => {
    try {
      const token = extractBearerToken(c.req.header('authorization'))
      const invitations = await listInvitations(c.env, token)
      return c.json({ invitations, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/membership-invitations', requirePermission('user.manage'), async (c) => {
    try {
      const input = invitationCreateSchema.parse(await readJson(c))
      const actor = c.get('authUser')!
      const result = await createInvitation(c.env, actor.id, input)
      return c.json({
        invitation: result.invitation,
        inviteToken: result.token,
        tokenHandling: 'RETURNED_ONCE_DO_NOT_LOG',
        deliveryRequired: true,
        requestId: c.get('requestId')
      }, 201)
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.delete('/api/v1/membership-invitations/:id', requirePermission('user.manage'), async (c) => {
    try {
      const invitationId = uuidSchema.parse(c.req.param('id'))
      const actor = c.get('authUser')!
      const id = await revokeInvitation(c.env, actor.id, invitationId)
      return c.json({ id, revoked: true, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/membership-invitations/accept', async (c) => {
    try {
      const input = invitationAcceptSchema.parse(await readJson(c))
      const token = extractBearerToken(c.req.header('authorization'))
      const membership = await acceptInvitation(c.env, token, input.token)
      return c.json({ membership, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })
}
