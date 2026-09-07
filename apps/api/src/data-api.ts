import type { ApiBindings } from './types'

export class DataApiConfigurationError extends Error {
  constructor() {
    super('Neon Data API não configurada neste ambiente.')
    this.name = 'DataApiConfigurationError'
  }
}

export class DataApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'DataApiRequestError'
  }
}

function dataApiBaseUrl(env: ApiBindings): string {
  if (!env.NEON_DATA_API_URL) throw new DataApiConfigurationError()
  return env.NEON_DATA_API_URL.replace(/\/$/, '')
}

export async function callDataApiRpc<T>(
  env: ApiBindings,
  accessToken: string,
  functionName: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(
    `${dataApiBaseUrl(env)}/rpc/${encodeURIComponent(functionName)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  )

  if (!response.ok) {
    let code = 'DATA_API_REQUEST_FAILED'
    let message = 'Falha ao consultar o contexto de autorização.'

    try {
      const payload = await response.json() as { code?: string; message?: string }
      code = payload.code || code
      message = payload.message || message
    } catch {
      // Mantém mensagem sanitizada; não vaza resposta bruta do banco.
    }

    throw new DataApiRequestError(response.status, code, message)
  }

  if (response.status === 204) return undefined as T
  return await response.json() as T
}
