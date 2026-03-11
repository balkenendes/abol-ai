import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function callWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (error: unknown) {
      const err = error as { status?: number }
      if (err?.status === 429 && i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
        continue
      }
      throw error
    }
  }
  throw new Error('Max retries exceeded')
}

export interface EnrichmentData {
  company_summary: string
  what_they_sell: string
  target_market: string
  company_size_estimate: string
  tech_stack_signals: string[]
  key_challenges: string[]
  persuasion_profile: 'analytical' | 'visionary' | 'relational' | 'driver'
  persuasion_reasoning: string
  conversation_hooks: string[]
}

export interface OutreachMessages {
  linkedin_connection_request: string
  linkedin_dm: string
  email_1_subject: string
  email_1_body: string
  email_2_subject: string
  email_2_body: string
  email_3_subject: string
  email_3_body: string
  email_4_subject: string
  email_4_body: string
}

export interface SenderInfo {
  name: string
  company: string
  what_you_sell: string
}

export async function enrichLead(websiteContent: string, linkedinUrl?: string): Promise<EnrichmentData> {
  return callWithRetry(async () => {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are an expert B2B sales researcher. Analyze this company and return a JSON object.

Website content: ${websiteContent.slice(0, 3000)}
LinkedIn URL: ${linkedinUrl ?? 'not provided'}

Return ONLY valid JSON with this exact structure:
{
  "company_summary": "2 sentence summary",
  "what_they_sell": "description",
  "target_market": "description",
  "company_size_estimate": "1-10 / 11-50 / 51-200 / 201-500 / 500+",
  "tech_stack_signals": ["tech1", "tech2"],
  "key_challenges": ["challenge1", "challenge2", "challenge3"],
  "persuasion_profile": "analytical",
  "persuasion_reasoning": "why this profile",
  "conversation_hooks": ["hook1", "hook2", "hook3"]
}`
      }]
    })
    const text = (message.content[0] as { type: string; text: string }).text
    return JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim()) as EnrichmentData
  })
}

export async function generateOutreach(
  enrichmentData: EnrichmentData,
  senderInfo: SenderInfo
): Promise<OutreachMessages> {
  return callWithRetry(async () => {
    const profile = enrichmentData.persuasion_profile
    const toneMap: Record<string, string> = {
      analytical: 'Use data, ROI, and benchmarks. Be precise and logical.',
      visionary: 'Focus on possibilities, innovation, and the future. Be inspiring.',
      relational: 'Be personal, warm, and focus on trust and shared values.',
      driver: 'Be direct, results-focused, and concise. No fluff.'
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are an expert B2B sales copywriter. Generate personalized outreach messages.

Prospect company: ${JSON.stringify(enrichmentData)}
Sender: ${senderInfo.name} from ${senderInfo.company} - ${senderInfo.what_you_sell}
Persuasion style: ${toneMap[profile] ?? toneMap['driver']}

Return ONLY valid JSON:
{
  "linkedin_connection_request": "max 300 chars, personal, reference specific detail",
  "linkedin_dm": "day 2 follow-up, value-first, ends with meeting ask",
  "email_1_subject": "subject line",
  "email_1_body": "day 8 email - AI intro, open question, no pitch",
  "email_2_subject": "subject line",
  "email_2_body": "day 12 - concrete insight, CTA 15 min?",
  "email_3_subject": "subject line",
  "email_3_body": "day 17 - acknowledge persistence, share resource",
  "email_4_subject": "subject line",
  "email_4_body": "day 22 - close loop, door open"
}`
      }]
    })
    const text = (message.content[0] as { type: string; text: string }).text
    return JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim()) as OutreachMessages
  })
}
