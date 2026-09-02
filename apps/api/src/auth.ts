import { createClient } from '@supabase/supabase-js'
import type { MiddlewareHandler } from 'hono'
import { z } from 'zod'
import type { ApiBindings, ApiEnv, AuthUser } from './types'

const verifiedClaimsSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email().optional(),
  role: z.literal('authenticated'),
  aal: z.enum(['aal1', 'aal2']).optional().default('aal1'),
  session_id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  membership_id: z.string().uuid().optional(),
  role_id: z.string().uuid().optional(),
  core_role: z.string().min(1).optional(),
  is_ifarm_admin: z.boolean().optional().default(false),
  requires_mfa: z.boolean().optional().default(false),
  is_anonymous: z.boolean().optional().default(false)
}).passthrough()

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
  return {
    id: claims.sub,
    email: claims.email,
    sessionId: claims.session_id,
    aal: claims.aal,
    tenantId: claims.tenant_id,
    membershipId: claims.membership_id,
    roleId: claims.role_id,
    coreRole: claims.core_role,
    isIfarmAdmin: claims.is_ifarm_admin,
    requiresMfa: claims.requires_mfa || claims.is_ifarm_admin
  }
}

export function isMfaSatisfied(user: AuthUser): boolean {
  return !user.requiresMfa || user.aal === 'aal2'
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

async function verifyWithSupabase(token: string, env: ApiBindings): Promise<AuthUser> {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new AuthFailure(
      'AUTH_NOT_CONFIGURED',
      'Provedor de identidade não configurado neste ambiente.',
      500
    )
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  })

  const { data, error } = await supabase.auth.getClaims(token)
  if (error || !data?.claims) {
    throw new AuthFailure('INVALID_ACCESS_TOKEN', 'Token de acesso inválido.')
  }

  return normalizeVerifiedClaims(data.claims)
}

export const requireAuth: MiddlewareHandler<ApiEnv> = async (c, next) => {
  try {
    const token = extractBearerToken(c.req.header('authorization'))
    const user = await verifyWithSupabase(token, c.env)
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
