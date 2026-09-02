import { z } from 'zod'
import type { ApiBindings } from './types'

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().max(max).optional()
)

export const marketingLeadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: optionalText(30),
  organization: optionalText(160),
  profile: z.enum(['farm', 'institutional', 'investor', 'technology', 'research', 'other']),
  message: z.string().trim().min(10).max(4000),
  privacyConsent: z.literal(true),
  website: optionalText(200),
  source: z.string().trim().max(80).optional().default('smart-farm-site')
})

export type MarketingLeadInput = z.infer<typeof marketingLeadSchema>

export async function saveMarketingLead(env: ApiBindings, lead: MarketingLeadInput) {
  if (!env.DB) {
    throw new Error('Cloudflare D1 não configurado neste ambiente.')
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const result = await env.DB
    .prepare(`
      insert into marketing_lead (
        id, created_at, name, email, phone, organization, profile,
        message, source, status, privacy_consent, consent_at, metadata
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 1, ?, '{}')
    `)
    .bind(
      id,
      now,
      lead.name,
      lead.email.toLowerCase(),
      lead.phone ?? null,
      lead.organization ?? null,
      lead.profile,
      lead.message,
      lead.source,
      now
    )
    .run()

  if (!result.success) {
    throw new Error('Falha ao persistir lead no Cloudflare D1.')
  }

  return { id }
}
