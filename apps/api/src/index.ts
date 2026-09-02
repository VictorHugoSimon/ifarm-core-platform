import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { z } from 'zod'

type Bindings = {
  APP_ENV?: string
}

type Variables = {
  requestId: string
  tenantId?: string
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('*', requestId())
app.use('*', secureHeaders())
app.use('/api/*', cors({ origin: [], allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }))

const tenantIdSchema = z.string().uuid()

app.use('/api/v1/*', async (c, next) => {
  const publicPaths = ['/api/v1', '/api/v1/health', '/api/v1/openapi.json']
  if (publicPaths.includes(c.req.path)) return next()

  const rawTenantId = c.req.header('x-tenant-id')
  const parsed = tenantIdSchema.safeParse(rawTenantId)
  if (!parsed.success) {
    return c.json({
      error: 'TENANT_REQUIRED',
      message: 'Cabeçalho x-tenant-id com UUID válido é obrigatório.'
    }, 400)
  }

  c.set('tenantId', parsed.data)
  await next()
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
  requestId: c.get('requestId'),
  timestamp: new Date().toISOString()
}))

app.get('/api/v1/openapi.json', (c) => c.json({
  openapi: '3.1.0',
  info: {
    title: 'iFarm Core API',
    version: '0.1.0',
    description: 'API central compartilhada do ecossistema iFarm.'
  },
  servers: [{ url: '/api/v1' }],
  paths: {
    '/health': { get: { summary: 'Health check', responses: { '200': { description: 'OK' } } } }
  }
}))

app.get('/api/v1/context', (c) => c.json({
  tenantId: c.get('tenantId'),
  requestId: c.get('requestId')
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
