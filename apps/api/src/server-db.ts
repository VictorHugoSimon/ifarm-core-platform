import { neon } from '@neondatabase/serverless'
import type { ApiBindings } from './types'

export class ServerDatabaseConfigurationError extends Error {
  constructor() {
    super('Conexão server-side do Neon não configurada neste ambiente.')
    this.name = 'ServerDatabaseConfigurationError'
  }
}

export function createServerDatabase(env: ApiBindings) {
  if (!env.DATABASE_URL) throw new ServerDatabaseConfigurationError()
  return neon(env.DATABASE_URL)
}
