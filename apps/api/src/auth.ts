import { createRemoteJWKSet, jwtVerify, type JWTVerifyOptions } from 'jose'
import type { MiddlewareHandler } from 'hono'
import { z } from 'zod'
import { callDataApiRpc } from './data-api'
import type { ApiBindings, ApiEnv, AuthUser } from './types'

const verifiedClaimsSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email().optional(),
  sid: z.string().optional(),
  session_id: z.string().optional(),
  aal: z.enum(['aal1', 'aal2']).optional(),
  amr: z.array(z.string()).optional(),
  mfa_verified: z.boolean().optional(),
  two_factor_verified: z.boolean().optional(),
  is_anonymous: z.boolean().optional().default(false)
}).passthrough()

const identityContextSchema = z.object({
  tenant_id: z.string().uuid().nullable().optional(),
  membership_id: z.string().uuid().nullable().optional(),
  role_id: z.string().uuid().nullable().optional(),
  core_role: z.string().nullable().optional(),
  is_ifarm_admin: z.boolean().optional().default(false),
  requires_mfa: z.boolean().optional().default(false)
})

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export class AuthFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 401 | 403 | 500 = 401
  ) {
    super(message)
    this.name = 'AuthFailure'
  }
}

export function extractBearerToken(authorization?: string): string {
  if (!authorization) {
    throw new AuthFailure('AUTH_REQUIRED', 'Token de acesso obrigatório.')
  }

  const [scheme, token, extra] = authorization.trim().split(/\s+/)
  if (scheme?.toLowerCase() !== 'bearer' || !token || extra) {
    throw new AuthFailure('INVALID_AUTH_HEADER', 'Cabeçalho Authorization inválido.')
  }

  return token
}

export function normalizeVerifiedClaims(raw: unknown): AuthUser {
  const result = verifiedClaimsSchema.safeParse(raw)
  if (!result.success || result.data.is_anonymous) {
    throw new AuthFailure('INVALID_ACCESS_TOKEN', 'Token de acesso inválido.')
  }

  const claims = result.data
  const amr = claims.amr?.map((value) => value.toLowerCase()) ?? []
  const mfaVerified = Boolean(
    claims.mfa_verified
    || claims.two_factor_verified
    || claims.aal === 'aal2'
    || amr.some((method) => ['mfa', '2fa', 'totp', 'otp'].includes(method))
  )

  return {
    id: claims.sub,
    email: claims.email,
    sessionId: claims.sid ?? claims.session_id,
    mfaVerified,
    isIfarmAdmin: false,
    requiresMfa: false
  }
}

export function isMfaSatisfied(user: AuthUser): boolean {
  return !user.requiresMfa || user.mfaVerified
}

export function assertPrivilegedMfa(user: AuthUser): void {
  if (!isMfaSatisfied(user)) {
    throw new AuthFailure(
      'MFA_REQUIRED',
      'Este acesso exige autenticação multifator concluída.',
      403
    )
  }
}

function getJwks(url: string) {
  let jwks = jwksCache.get(url)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url))
    jwksCache.set(url, jwks)
  }
  return jwks
}

async function loadIdentityContext(
  token: string,
  env: ApiBindings,
  user: AuthUser
): Promise<AuthUser> {
  const raw = await callDataApiRpc<unknown>(env, token, 'app_identity_context')
  const candidate = Array.isArray(raw) ? raw[0] : raw
  const parsed = identityContextSchema.safeParse(candidate ?? {})

  if (!parsed.success) {
    throw new AuthFailure(
      'INVALID_IDENTITY_CONTEXT',
      'Contexto de identidade inválido.',
      500
    )
  }

  const context = parsed.data
  return {
    ...user,
    tenantId: context.tenant_id ?? undefined,
    membershipId: context.membership_id ?? undefined,
    roleId: context.role_id ?? undefined,
    coreRole: context.core_role ?? undefined,
    isIfarmAdmin: context.is_ifarm_admin,
    requiresMfa: context.requires_mfa
  }
}

async function verifyWithNeon(token: string, env: ApiBindings): Promise<AuthUser> {
  if (!env.NEON_AUTH_JWKS_URL || !env.NEON_DATA_API_URL) {
    throw new AuthFailure(
      'AUTH_NOT_CONFIGURED',
      'Neon Auth/Data API não configurados neste ambiente.',
      500
    )
  }

  const options: JWTVerifyOptions = {}
  if (env.NEON_AUTH_ISSUER) options.issuer = env.NEON_AUTH_ISSUER

  try {
    const { payload } = await jwtVerify(
      token,
      getJwks(env.NEON_AUTH_JWKS_URL),
      options
    )
    const user = normalizeVerifiedClaims(payload)
    return await loadIdentityContext(token, env, user)
  } catch (error) {
    if (error instanceof AuthFailure) throw error
    throw new AuthFailure('INVALID_ACCESS_TOKEN', 'Token de acesso inválido.')
  }
}

export const requireAuth: MiddlewareHandler<ApiEnv> = async (c, next) => {
  try {
    const token = extractBearerToken(c.req.header('authorization'))
    const user = await verifyWithNeon(token, c.env)
    c.set('authUser', user)
    await next()
  } catch (error) {
    if (error instanceof AuthFailure) {
      return c.json({
        error: error.code,
        message: error.message,
        requestId: c.get('requestId')
      }, error.status)
    }
    throw error
  }
}
