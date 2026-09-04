import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { extractBearerToken, isMfaSatisfied, requireAuth } from './auth'
import { listMyPermissions } from './authorization'
import { registerRuralRoutes } from './rural-routes'
import { registerTenancyRoutes } from './tenancy-routes'
import type { ApiEnv } from './types'

const app = new Hono<ApiEnv>()

app.use('*', requestId())
app.use('*', secureHeaders())
app.use('/api/*', cors({
  origin: [],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type']
}))

app.use('/api/v1/*', async (c, next) => {
  const publicPaths = ['/api/v1', '/api/v1/health', '/api/v1/openapi.json']
  if (publicPaths.includes(c.req.path)) return next()
  return requireAuth(c, next)
})

app.get('/', (c) => c.redirect('/api/v1'))

app.get('/api/v1', (c) => c.json({
  name: 'iFarm Core API',
  version: 'v1',
  status: 'building',
  environment: c.env.APP_ENV ?? 'development',
  identityProvider: 'neon-auth'
}))

app.get('/api/v1/health', (c) => c.json({
  ok: true,
  service: 'ifarm-core-api',
  environment: c.env.APP_ENV ?? 'development',
  requestId: c.get('requestId'),
  timestamp: new Date().toISOString()
}))

app.get('/api/v1/me', (c) => {
  const user = c.get('authUser')!
  return c.json({
    id: user.id,
    email: user.email,
    tenantId: user.tenantId ?? null,
    membershipId: user.membershipId ?? null,
    roleId: user.roleId ?? null,
    role: user.coreRole ?? null,
    ifarmAdmin: user.isIfarmAdmin,
    mfa: {
      required: user.requiresMfa,
      verified: user.mfaVerified,
      satisfied: isMfaSatisfied(user)
    },
    requestId: c.get('requestId')
  })
})

app.get('/api/v1/me/permissions', async (c) => {
  try {
    const token = extractBearerToken(c.req.header('authorization'))
    const permissions = await listMyPermissions(c.env, token)
    return c.json({ permissions, requestId: c.get('requestId') })
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      requestId: c.get('requestId'),
      event: 'load_permissions_failed',
      message: error instanceof Error ? error.message : 'unknown'
    }))
    return c.json({
      error: 'PERMISSION_CHECK_FAILED',
      message: 'Não foi possível carregar as permissões.',
      requestId: c.get('requestId')
    }, 500)
  }
})

app.get('/api/v1/context', (c) => {
  const user = c.get('authUser')!
  return c.json({
    userId: user.id,
    tenantId: user.tenantId ?? null,
    authenticated: true,
    identityProvider: 'neon-auth',
    requestId: c.get('requestId')
  })
})

registerTenancyRoutes(app)
registerRuralRoutes(app)

app.get('/api/v1/openapi.json', (c) => c.json({
  openapi: '3.1.0',
  info: {
    title: 'iFarm Core API',
    version: '0.6.0',
    description: 'API central compartilhada do ecossistema iFarm.'
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    }
  },
  paths: {
    '/health': {
      get: { summary: 'Health check', responses: { '200': { description: 'OK' } } }
    },
    '/me': {
      get: {
        summary: 'Identidade Neon Auth e contexto Core carregado do PostgreSQL',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Identidade autenticada' }, '401': { description: 'Token ausente ou inválido' } }
      }
    },
    '/me/permissions': {
      get: {
        summary: 'Permissões efetivas no tenant ativo',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Lista de permission codes' } }
      }
    },
    '/tenants': {
      get: {
        summary: 'Lista tenants com membership ativa para seleção de contexto',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenants autorizados' } }
      }
    },
    '/me/active-tenant': {
      post: {
        summary: 'Seleciona tenant somente quando existe membership ativa',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Contexto atualizado' }, '404': { description: 'Membership não encontrada' } }
      }
    },
    '/tenant': {
      get: {
        summary: 'Consulta o tenant ativo derivado da identidade',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant ativo' } }
      }
    },
    '/organizations': {
      get: { summary: 'Lista Organizations do tenant ativo', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Organizations do tenant' } } },
      post: { summary: 'Cria Organization no tenant ativo', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Organization criada' } } }
    },
    '/organizations/{id}': {
      get: { summary: 'Consulta Organization do tenant ativo', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Organization' }, '404': { description: 'Não encontrada' } } },
      patch: { summary: 'Atualiza Organization do tenant ativo', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Organization atualizada' } } },
      delete: { summary: 'Exclusão lógica de Organization', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Organization excluída logicamente' } } }
    },
    '/configuration/white-label': {
      get: { summary: 'Consulta white-label do tenant ativo', security: [{ bearerAuth: [] }], responses: { '200': { description: 'White-label' } } },
      put: { summary: 'Atualiza white-label com auditoria', security: [{ bearerAuth: [] }], responses: { '200': { description: 'White-label atualizado' } } }
    },
    '/admin/tenants': {
      get: { summary: 'Administração iFarm: lista tenants', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Tenants' }, '403': { description: 'MFA ou privilégio obrigatório' } } },
      post: { summary: 'Administração iFarm: cria tenant e roles padrão', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Tenant criado' }, '403': { description: 'MFA ou privilégio obrigatório' } } }
    },
    '/properties': {
      get: { summary: 'Lista propriedades do tenant ativo', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Propriedades' } } },
      post: { summary: 'Cria propriedade vinculada a Organization do tenant ativo', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Propriedade criada' } } }
    },
    '/properties/{id}': {
      get: { summary: 'Consulta propriedade sem revelar outro tenant', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Propriedade' }, '404': { description: 'Não encontrada' } } },
      patch: { summary: 'Atualiza propriedade do tenant ativo', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Propriedade atualizada' } } },
      delete: { summary: 'Exclusão lógica de propriedade', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Propriedade excluída logicamente' } } }
    },
    '/properties/{propertyId}/fields': {
      get: { summary: 'Lista áreas da propriedade', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Áreas' } } },
      post: { summary: 'Cria área na propriedade do tenant ativo', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Área criada' } } }
    },
    '/fields/{id}': {
      get: { summary: 'Consulta área do tenant ativo', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Área' }, '404': { description: 'Não encontrada' } } },
      patch: { summary: 'Atualiza área', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Área atualizada' } } },
      delete: { summary: 'Exclusão lógica de área', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Área excluída logicamente' } } }
    },
    '/fields/{fieldId}/plots': {
      get: { summary: 'Lista talhões da área', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Talhões' } } },
      post: { summary: 'Cria talhão na área do tenant ativo', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Talhão criado' } } }
    },
    '/plots/{id}': {
      get: { summary: 'Consulta talhão do tenant ativo', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Talhão' }, '404': { description: 'Não encontrado' } } },
      patch: { summary: 'Atualiza talhão', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Talhão atualizado' } } },
      delete: { summary: 'Exclusão lógica de talhão', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Talhão excluído logicamente' } } }
    }
  }
}))

app.notFound((c) => c.json({ error: 'NOT_FOUND', requestId: c.get('requestId') }, 404))

app.onError((error, c) => {
  console.error(JSON.stringify({
    level: 'error',
    requestId: c.get('requestId'),
    message: error.message,
    path: c.req.path
  }))

  return c.json({ error: 'INTERNAL_ERROR', requestId: c.get('requestId') }, 500)
})

export default app
