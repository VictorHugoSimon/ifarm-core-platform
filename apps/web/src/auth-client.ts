import { createAuthClient } from '@neondatabase/auth'
import { BetterAuthReactAdapter } from '@neondatabase/auth/react/adapters'

const authUrl = import.meta.env.VITE_NEON_AUTH_URL as string | undefined

if (!authUrl) {
  console.warn('VITE_NEON_AUTH_URL não configurada. O login ficará indisponível neste ambiente.')
}

export const authClient = createAuthClient(authUrl ?? 'http://127.0.0.1/invalid-neon-auth', {
  adapter: BetterAuthReactAdapter()
})
