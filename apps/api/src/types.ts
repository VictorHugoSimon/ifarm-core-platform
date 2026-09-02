export type AuthenticatorAssuranceLevel = 'aal1' | 'aal2'

export type AuthUser = {
  id: string
  email?: string
  sessionId?: string
  aal: AuthenticatorAssuranceLevel
  tenantId?: string
  membershipId?: string
  roleId?: string
  coreRole?: string
  isIfarmAdmin: boolean
  requiresMfa: boolean
}

export type ApiBindings = {
  APP_ENV?: string
  SITE_ORIGIN?: string
  SUPABASE_URL?: string
  SUPABASE_PUBLISHABLE_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

export type ApiVariables = {
  requestId: string
  authUser?: AuthUser
}

export type ApiEnv = {
  Bindings: ApiBindings
  Variables: ApiVariables
}
