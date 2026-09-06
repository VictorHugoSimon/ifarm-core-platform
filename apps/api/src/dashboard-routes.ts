import type { Context, Hono } from 'hono'
import { z } from 'zod'
import { extractBearerToken } from './auth'
import { requirePermission } from './authorization'
import { ServerDatabaseConfigurationError } from './server-db'
import {
  addRevenueEntry,
  contractCreateSchema,
  createContract,
  createIntegration,
  DashboardFailure,
  getAdminDashboard,
  getTenantDashboard,
  integrationCreateSchema,
  listContracts,
  listIntegrations,
  moduleUpsertSchema,
  revenueCreateSchema,
  upsertTenantModule
} from './dashboard'
import type { ApiEnv } from './types'

const uuidSchema = z.string().uuid()

async function readJson(c: Context<ApiEnv>) {
  try {
    return await c.req.json()
  } catch {
    throw new DashboardFailure('INVALID_JSON', 'JSON inválido.', 400)
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
  if (error instanceof DashboardFailure) {
    return c.json({ error: error.code, message: error.message, requestId: c.get('requestId') }, error.status)
  }
  if (error instanceof ServerDatabaseConfigurationError) {
    return c.json({ error: 'SERVER_DATABASE_NOT_CONFIGURED', message: error.message, requestId: c.get('requestId') }, 500)
  }
  console.error(JSON.stringify({
    level: 'error',
    requestId: c.get('requestId'),
    event: 'dashboard_operation_failed',
    message: error instanceof Error ? error.message : 'unknown'
  }))
  return c.json({ error: 'DASHBOARD_OPERATION_FAILED', message: 'Não foi possível concluir a operação.', requestId: c.get('requestId') }, 500)
}

export function registerDashboardRoutes(app: Hono<ApiEnv>) {
  app.get('/api/v1/dashboard/summary', requirePermission('tenant.read'), async (c) => {
    try {
      const token = extractBearerToken(c.req.header('authorization'))
      const summary = await getTenantDashboard(c.env, token)
      return c.json({ summary, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/admin/dashboard/summary', requirePermission('tenant.manage'), async (c) => {
    try {
      const user = c.get('authUser')!
      if (!user.isIfarmAdmin) {
        return c.json({ error: 'IFARM_ADMIN_REQUIRED', message: 'Acesso exclusivo à administração iFarm.', requestId: c.get('requestId') }, 403)
      }
      const summary = await getAdminDashboard(c.env, user.id)
      return c.json({ summary, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/contracts', requirePermission('contract.read'), async (c) => {
    try {
      const token = extractBearerToken(c.req.header('authorization'))
      const contracts = await listContracts(c.env, token)
      return c.json({ contracts, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/contracts', requirePermission('contract.manage'), async (c) => {
    try {
      const input = contractCreateSchema.parse(await readJson(c))
      const contract = await createContract(c.env, c.get('authUser')!.id, input)
      return c.json({ contract, requestId: c.get('requestId') }, 201)
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/contracts/:id/revenue', requirePermission('contract.manage'), async (c) => {
    try {
      const contractId = uuidSchema.parse(c.req.param('id'))
      const input = revenueCreateSchema.parse(await readJson(c))
      const revenue = await addRevenueEntry(c.env, c.get('authUser')!.id, contractId, input)
      return c.json({ revenue, requestId: c.get('requestId') }, 201)
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.put('/api/v1/modules/:code', requirePermission('contract.manage'), async (c) => {
    try {
      const input = moduleUpsertSchema.parse(await readJson(c))
      const module = await upsertTenantModule(c.env, c.get('authUser')!.id, c.req.param('code'), input)
      return c.json({ module, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/integrations', requirePermission('integration.read'), async (c) => {
    try {
      const token = extractBearerToken(c.req.header('authorization'))
      const integrations = await listIntegrations(c.env, token)
      return c.json({ integrations, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/integrations', requirePermission('integration.manage'), async (c) => {
    try {
      const input = integrationCreateSchema.parse(await readJson(c))
      const integration = await createIntegration(c.env, c.get('authUser')!.id, input)
      return c.json({ integration, requestId: c.get('requestId') }, 201)
    } catch (error) {
      return errorResponse(c, error)
    }
  })
}
