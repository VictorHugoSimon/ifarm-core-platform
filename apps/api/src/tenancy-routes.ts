import type { Context, Hono } from 'hono'
import { z } from 'zod'
import { extractBearerToken } from './auth'
import { requirePermission } from './authorization'
import { ServerDatabaseConfigurationError } from './server-db'
import {
  activeTenantInputSchema,
  adminCreateTenant,
  adminListTenants,
  adminTenantCreateSchema,
  createOrganization,
  deleteOrganization,
  getCurrentTenant,
  getOrganization,
  getWhiteLabel,
  listMyTenants,
  listOrganizations,
  organizationCreateSchema,
  organizationPatchSchema,
  setActiveTenant,
  TenancyFailure,
  updateOrganization,
  updateWhiteLabel,
  whiteLabelSchema
} from './tenancy'
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

  if (error instanceof TenancyFailure) {
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
    requestId: c.get('requestId'),
    event: 'tenancy_operation_failed',
    message: error instanceof Error ? error.message : 'unknown'
  }))

  return c.json({
    error: 'TENANCY_OPERATION_FAILED',
    message: 'Não foi possível concluir a operação.',
    requestId: c.get('requestId')
  }, 500)
}

async function readJson(c: Context<ApiEnv>) {
  try {
    return await c.req.json()
  } catch {
    throw new TenancyFailure('INVALID_JSON', 'JSON inválido.', 400)
  }
}

export function registerTenancyRoutes(app: Hono<ApiEnv>) {
  app.get('/api/v1/tenants', async (c) => {
    try {
      const token = extractBearerToken(c.req.header('authorization'))
      const tenants = await listMyTenants(c.env, token)
      return c.json({ tenants, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/me/active-tenant', async (c) => {
    try {
      const input = activeTenantInputSchema.parse(await readJson(c))
      const token = extractBearerToken(c.req.header('authorization'))
      const result = await setActiveTenant(c.env, token, input.tenantId)
      return c.json({
        tenantId: result.tenantId,
        context: {
          membershipId: result.context.membership_id ?? null,
          roleId: result.context.role_id ?? null,
          role: result.context.core_role ?? null,
          ifarmAdmin: result.context.is_ifarm_admin,
          requiresMfa: result.context.requires_mfa
        },
        requestId: c.get('requestId')
      })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/tenant', requirePermission('tenant.read'), async (c) => {
    try {
      const token = extractBearerToken(c.req.header('authorization'))
      const tenant = await getCurrentTenant(c.env, token)
      return c.json({ tenant, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/organizations', requirePermission('organization.read'), async (c) => {
    try {
      const token = extractBearerToken(c.req.header('authorization'))
      const organizations = await listOrganizations(c.env, token)
      return c.json({ organizations, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/organizations/:id', requirePermission('organization.read'), async (c) => {
    try {
      const organizationId = uuidSchema.parse(c.req.param('id'))
      const token = extractBearerToken(c.req.header('authorization'))
      const organization = await getOrganization(c.env, token, organizationId)
      return c.json({ organization, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/organizations', requirePermission('organization.manage'), async (c) => {
    try {
      const input = organizationCreateSchema.parse(await readJson(c))
      const user = c.get('authUser')!
      const organization = await createOrganization(c.env, user.id, input)
      return c.json({ organization, requestId: c.get('requestId') }, 201)
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.patch('/api/v1/organizations/:id', requirePermission('organization.manage'), async (c) => {
    try {
      const organizationId = uuidSchema.parse(c.req.param('id'))
      const patch = organizationPatchSchema.parse(await readJson(c))
      const user = c.get('authUser')!
      const organization = await updateOrganization(c.env, user.id, organizationId, patch)
      return c.json({ organization, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.delete('/api/v1/organizations/:id', requirePermission('organization.manage'), async (c) => {
    try {
      const organizationId = uuidSchema.parse(c.req.param('id'))
      const user = c.get('authUser')!
      const deletedId = await deleteOrganization(c.env, user.id, organizationId)
      return c.json({ id: deletedId, deleted: true, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/configuration/white-label', requirePermission('configuration.read'), async (c) => {
    try {
      const token = extractBearerToken(c.req.header('authorization'))
      const branding = await getWhiteLabel(c.env, token)
      return c.json({ branding, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.put('/api/v1/configuration/white-label', requirePermission('configuration.manage'), async (c) => {
    try {
      const branding = whiteLabelSchema.parse(await readJson(c))
      const user = c.get('authUser')!
      const saved = await updateWhiteLabel(c.env, user.id, branding)
      return c.json({ branding: saved, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.get('/api/v1/admin/tenants', requirePermission('tenant.manage'), async (c) => {
    try {
      const user = c.get('authUser')!
      const tenants = await adminListTenants(c.env, user.id)
      return c.json({ tenants, requestId: c.get('requestId') })
    } catch (error) {
      return errorResponse(c, error)
    }
  })

  app.post('/api/v1/admin/tenants', requirePermission('tenant.manage'), async (c) => {
    try {
      const input = adminTenantCreateSchema.parse(await readJson(c))
      const user = c.get('authUser')!
      const tenant = await adminCreateTenant(c.env, user.id, input)
      return c.json({ tenant, requestId: c.get('requestId') }, 201)
    } catch (error) {
      return errorResponse(c, error)
    }
  })
}
