import { describe, expect, it } from 'vitest'
import app from './index'

const allowedOrigin = 'https://ifarm-core-web-dev.pages.dev'

describe('CORS boundary', () => {
  it('allows the configured web origin exactly', async () => {
    const response = await app.request('/api/v1/health', {
      method: 'OPTIONS',
      headers: {
        Origin: allowedOrigin,
        'Access-Control-Request-Method': 'GET'
      }
    }, {
      APP_ENV: 'development',
      CORS_ORIGIN: allowedOrigin
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigin)
  })

  it('does not authorize an unrelated browser origin', async () => {
    const externalOrigin = 'https://example.invalid'
    const response = await app.request('/api/v1/health', {
      method: 'OPTIONS',
      headers: {
        Origin: externalOrigin,
        'Access-Control-Request-Method': 'GET'
      }
    }, {
      APP_ENV: 'development',
      CORS_ORIGIN: allowedOrigin
    })

    expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe(externalOrigin)
    expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('*')
  })
})
