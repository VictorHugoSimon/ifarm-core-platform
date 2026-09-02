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

export type D1RunResult = {
  success: boolean
  meta?: Record<string, unknown>
}

export type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement
  run: () => Promise<D1RunResult>
}

export type D1DatabaseBinding = {
  prepare: (query: string) => D1PreparedStatement
}

export type ApiBindings = {
  APP_ENV?: string
  SITE_ORIGIN?: string
  DB?: D1DatabaseBinding
  SUPABASE_URL?: string
  SUPABASE_PUBLISHABLE_KEY?: string
}

export type ApiVariables = {
  requestId: string
  authUser?: AuthUser
}

export type ApiEnv = {
  Bindings: ApiBindings
  Variables: ApiVariables
}
