import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { extractBearerToken, isMfaSatisfied, requireAuth } from './auth'
import { listMyPermissions } from './authorization'
import { marketingLeadSchema, saveMarketingLead } from './leads'
import type { ApiEnv } from './types'

const app = new Hono<ApiEnv>()

app.use('*', requestId())
app.use('*', secureHeaders())
app.use('/api/*', cors({
  origin: (origin, c) => {
    const configured = (c.env.SITE_ORIGIN ?? '')
      .split(',')
      .map((value: string) => value.trim())
      .filter(Boolean)
    const allowed = new Set(['http://localhost:5174', ...configured])
    return allowed.has(origin) ? origin : ''
  },
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type'],
  maxAge: 86400
}))

app.use('/api/v1/*', async (c, next) => {
  const publicPaths = [
    '/api/v1',
    '/api/v1/health',
    '/api/v1/openapi.json',
    '/api/v1/public/leads'
  ]
  if (publicPaths.includes(c.req.path)) return next()
  return requireAuth(c, next)
})

app.get('/', (c) => c.redirect('/api/v1'))

app.get('/api/v1', (c) => c.json({
  name: 'iFarm Core API',
  version: 'v1',
  status: 'building',
  environment: c.env.APP_ENV ?? 'development'
}))

app.get('/api/v1/health', (c) => c.json({
  ok: true,
  service: 'ifarm-core-api',
  environment: c.env.APP_ENV ?? 'development',
  database: c.env.DB ? 'd1-bound' : 'd1-not-configured',
  requestId: c.get('requestId'),
  timestamp: new Date().toISOString()
}))

app.post('/api/v1/public/leads', async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({
      error: 'INVALID_JSON',
      message: 'Envie os dados do formulário em JSON válido.',
      requestId: c.get('requestId')
    }, 400)
  }

  const parsed = marketingLeadSchema.safeParse(payload)
  if (!parsed.success) {
    return c.json({
      error: 'INVALID_LEAD',
      message: 'Revise os campos obrigatórios do formulário.',
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      requestId: c.get('requestId')
    }, 400)
  }

  if (parsed.data.website) {
    return c.json({ ok: true, requestId: c.get('requestId') }, 202)
  }

  try {
    const saved = await saveMarketingLead(c.env, parsed.data)
    return c.json({ ok: true, id: saved.id, requestId: c.get('requestId') }, 201)
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      requestId: c.get('requestId'),
      event: 'marketing_lead_save_failed',
      message: error instanceof Error ? error.message : 'unknown'
    }))
    return c.json({
      error: 'LEAD_SAVE_FAILED',
      message: 'Não foi possível registrar seu interesse agora. Tente novamente em instantes.',
      requestId: c.get('requestId')
    }, 500)
  }
})

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
      level: user.aal,
      required: user.requiresMfa,
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
    requestId: c.get('requestId')
  })
})

app.get('/api/v1/openapi.json', (c) => c.json({
  openapi: '3.1.0',
  info: {
    title: 'iFarm Core API',
    version: '0.5.0',
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
    '/public/leads': {
      post: { summary: 'Registra interesse vindo do site público em Cloudflare D1', responses: { '201': { description: 'Lead registrado' }, '400': { description: 'Dados inválidos' } } }
    },
    '/me': {
      get: {
        summary: 'Identidade e contexto autenticado',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Identidade autenticada' }, '401': { description: 'Token ausente ou inválido' } }
      }
    },
    '/me/permissions': {
      get: {
        summary: 'Permissões efetivas do usuário no tenant ativo',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Lista de permission codes' }, '401': { description: 'Token ausente ou inválido' } }
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
