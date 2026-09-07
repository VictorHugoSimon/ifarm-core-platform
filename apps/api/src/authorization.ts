import type { Context, MiddlewareHandler } from 'hono'
import { assertPrivilegedMfa, extractBearerToken } from './auth'
import { callDataApiRpc, DataApiConfigurationError, DataApiRequestError } from './data-api'
import type { PermissionCode } from './permissions'
import type { ApiEnv, AuthUser } from './types'

export class AuthorizationFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 403 | 500 = 403
  ) {
    super(message)
    this.name = 'AuthorizationFailure'
  }
}

export function assertTenantContext(user: AuthUser): void {
  if (!user.isIfarmAdmin && !user.tenantId) {
    throw new AuthorizationFailure(
      'TENANT_CONTEXT_REQUIRED',
      'Selecione uma organização/empresa válida para continuar.'
    )
  }
}

async function checkPermission(
  c: Context<ApiEnv>,
  permission: PermissionCode
): Promise<boolean> {
  const token = extractBearerToken(c.req.header('authorization'))

  try {
    const data = await callDataApiRpc<boolean>(
      c.env,
      token,
      'app_has_permission',
      { requested_permission: permission }
    )
    return data === true
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      requestId: c.get('requestId'),
      event: 'permission_check_failed',
      permission,
      databaseCode: error instanceof DataApiRequestError ? error.code : undefined
    }))
    throw new AuthorizationFailure(
      'PERMISSION_CHECK_FAILED',
      'Não foi possível validar a autorização.',
      500
    )
  }
}

export const requirePermission = (permission: PermissionCode): MiddlewareHandler<ApiEnv> => {
  return async (c, next) => {
    try {
      const user = c.get('authUser')
      if (!user) {
        return c.json({
          error: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória.',
          requestId: c.get('requestId')
        }, 401)
      }

      assertTenantContext(user)
      assertPrivilegedMfa(user)

      if (!(await checkPermission(c, permission))) {
        return c.json({
          error: 'FORBIDDEN',
          message: 'Você não possui permissão para esta operação.',
          requestId: c.get('requestId')
        }, 403)
      }

      await next()
    } catch (error) {
      if (error instanceof AuthorizationFailure) {
        return c.json({
          error: error.code,
          message: error.message,
          requestId: c.get('requestId')
        }, error.status)
      }
      if (error instanceof DataApiConfigurationError) {
        return c.json({
          error: 'DATABASE_NOT_CONFIGURED',
          message: error.message,
          requestId: c.get('requestId')
        }, 500)
      }
      throw error
    }
  }
}

export async function listMyPermissions(
  env: ApiEnv['Bindings'],
  accessToken: string
): Promise<string[]> {
  try {
    const data = await callDataApiRpc<unknown>(env, accessToken, 'app_my_permissions')
    if (!Array.isArray(data)) return []

    return data
      .map((row) => typeof row === 'string' ? row : (row as { code?: unknown })?.code)
      .filter((code): code is string => typeof code === 'string')
  } catch {
    throw new AuthorizationFailure(
      'PERMISSION_CHECK_FAILED',
      'Não foi possível carregar as permissões.',
      500
    )
  }
}
