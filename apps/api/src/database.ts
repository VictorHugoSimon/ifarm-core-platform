import { createClient } from '@supabase/supabase-js'
import type { ApiBindings } from './types'

export class DatabaseConfigurationError extends Error {
  constructor() {
    super('Banco/autorização Supabase não configurado neste ambiente.')
    this.name = 'DatabaseConfigurationError'
  }
}

export function createUserDatabase(env: ApiBindings, accessToken: string) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new DatabaseConfigurationError()
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    accessToken: async () => accessToken,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  })
}

export function createServiceDatabase(env: ApiBindings) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new DatabaseConfigurationError()
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  })
}
