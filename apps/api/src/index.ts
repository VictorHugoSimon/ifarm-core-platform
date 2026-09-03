import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { isMfaSatisfied, requireAuth } from './auth'
import { listMyPermissions } from './authorization'
import { extractBearerToken } from './auth'
import type { ApiEnv } from './types'

const app = new Hono<ApiEnv>()

app.use('*', requestId())
app.use('*', secureHeaders())
app.use('/api/*', cors({
  origin: [],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
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

app.get('/api/v1/openapi.json', (c) => c.json({
  openapi: '3.1.0',
  info: {
    title: 'iFarm Core API',
    version: '0.4.0',
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
        responses: {
          '200': { description: 'Identidade autenticada' },
          '401': { description: 'Token ausente ou inválido' }
        }
      }
    },
    '/me/permissions': {
      get: {
        summary: 'Permissões efetivas do usuário no tenant ativo',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Lista de permission codes' },
          '401': { description: 'Token ausente ou inválido' }
        }
      }
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
