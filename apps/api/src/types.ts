export type AuthUser = {
  id: string
  email?: string
  sessionId?: string
  mfaVerified: boolean
  tenantId?: string
  membershipId?: string
  roleId?: string
  coreRole?: string
  isIfarmAdmin: boolean
  requiresMfa: boolean
}

export type ApiBindings = {
  APP_ENV?: string
  NEON_AUTH_JWKS_URL?: string
  NEON_AUTH_ISSUER?: string
  NEON_DATA_API_URL?: string
  DATABASE_URL?: string
}

export type ApiVariables = {
  requestId: string
  authUser?: AuthUser
}

export type ApiEnv = {
  Bindings: ApiBindings
  Variables: ApiVariables
}
