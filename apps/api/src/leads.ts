import { z } from 'zod'
import { createServiceDatabase } from './database'
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
  const database = createServiceDatabase(env)
  const { data, error } = await database
    .from('marketing_lead')
    .insert({
      name: lead.name,
      email: lead.email.toLowerCase(),
      phone: lead.phone ?? null,
      organization: lead.organization ?? null,
      profile: lead.profile,
      message: lead.message,
      source: lead.source,
      privacy_consent: true,
      consent_at: new Date().toISOString()
    })
    .select('id')
    .single()

  if (error) throw error
  return data
}
