export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type Channel = 'linkedin_request' | 'linkedin_dm' | 'email_1' | 'email_2' | 'email_3' | 'email_4'

const TONE_MAP: Record<string, string> = {
  analytical: 'Use data, ROI, and benchmarks. Be precise and logical.',
  visionary: 'Focus on possibilities, innovation, and the future. Be inspiring.',
  relational: 'Be personal, warm, and focus on trust and shared values.',
  driver: 'Be direct, results-focused, and concise. No fluff.',
}

const CHANNEL_INSTRUCTIONS: Record<Channel, string> = {
  linkedin_request: 'Write a LinkedIn connection request. Max 300 characters. Reference one specific detail about their company or recent activity. Never generic.',
  linkedin_dm: 'Write a LinkedIn DM sent right after they accepted the connection. Lead with a specific observation about their business. End with one low-friction open question. Max 500 characters. No pitch.',
  email_1: 'Write Email 1 of the sequence — a cold outreach email. Subject + body. Open with a specific insight about their company or industry. Mention one relevant result we achieved for a similar company. End with a soft question, not a hard CTA. Max 200 words.',
  email_2: 'Write Email 2 — a follow-up assuming Email 1 was opened but not replied to. Subject + body. Lead with a short case study or data point. Include a personalized landing page mention. End with a Calendly link suggestion. Max 150 words.',
  email_3: 'Write Email 3 — a breakup email. Subject + body. Be direct and respectful. Say you will stop reaching out if not relevant. Give one final compelling reason. Max 80 words.',
  email_4: 'Write Email 4 — a re-engagement email sent 30 days after email 3. Subject + body. Fresh angle, reference something new (season, industry news, their recent activity). Short and punchy. Max 100 words.',
}

const VALID_CHANNELS: Channel[] = ['linkedin_request', 'linkedin_dm', 'email_1', 'email_2', 'email_3', 'email_4']

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { leadId?: string; channel?: string }
    const { leadId, channel } = body

    if (!leadId || !channel) {
      return NextResponse.json({ error: 'leadId and channel are required' }, { status: 400 })
    }

    if (!VALID_CHANNELS.includes(channel as Channel)) {
      return NextResponse.json({ error: `Invalid channel. Valid: ${VALID_CHANNELS.join(', ')}` }, { status: 400 })
    }

    const typedChannel = channel as Channel

    // Get lead + enrichment data
    const { data: lead, error: leadError } = await adminClient
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (!lead.enrichment_data) {
      return NextResponse.json({ error: 'Lead not yet enriched — run enrichment first' }, { status: 400 })
    }

    // Get sender info
    const { data: userProfile } = await adminClient
      .from('users')
      .select('name, company_name, what_you_sell')
      .eq('id', lead.user_id as string)
      .single()

    const senderName = (userProfile?.name as string | null) ?? 'Sales Rep'
    const senderCompany = (userProfile?.company_name as string | null) ?? 'Our Company'
    const whatYouSell = (userProfile?.what_you_sell as string | null) ?? 'B2B solutions'
    const profile = (lead.persuasion_profile as string | null) ?? 'driver'
    const tone = TONE_MAP[profile] ?? TONE_MAP['driver']
    const instruction = CHANNEL_INSTRUCTIONS[typedChannel]
    const enrichment = lead.enrichment_data as Record<string, unknown>

    const needsSubject = typedChannel.startsWith('email_')

    // Generate single message on demand
    const result = await callWithRetry(async () => {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `You are an expert B2B sales copywriter. Generate ONE outreach message.

PROSPECT:
- Company: ${String(enrichment.company_summary ?? '')}
- What they sell: ${String(enrichment.what_they_sell ?? '')}
- Key challenges: ${JSON.stringify(enrichment.key_challenges ?? [])}
- Conversation hooks: ${JSON.stringify(enrichment.conversation_hooks ?? [])}
- Lead name: ${String(lead.first_name ?? '')} ${String(lead.last_name ?? '')}

SENDER: ${senderName} at ${senderCompany}
WHAT WE SELL: ${whatYouSell}
TONE: ${tone}

TASK: ${instruction}

${needsSubject ? `Return JSON: {"subject": "...", "body": "..."}` : `Return JSON: {"content": "..."}`}
Return ONLY valid JSON, no other text.`
        }]
      })
      const text = (message.content[0] as { type: string; text: string }).text
      return JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim()) as Record<string, string>
    })

    const content = needsSubject ? (result['body'] ?? '') : (result['content'] ?? '')
    const subject = needsSubject ? (result['subject'] ?? '') : undefined

    // Save message to outreach_messages
    const { data: savedMessage, error: insertError } = await adminClient
      .from('outreach_messages')
      .insert({
        lead_id: leadId,
        user_id: lead.user_id as string,
        channel: typedChannel,
        content,
        subject: subject ?? null,
        status: 'pending_review',
        prompt_version: 2,
      })
      .select('id')
      .single()

    if (insertError || !savedMessage) {
      throw new Error('Failed to save message')
    }

    // Add to review_queue for Sam to approve
    await adminClient
      .from('review_queue')
      .insert({
        lead_id: leadId,
        message_id: savedMessage.id,
        user_id: lead.user_id as string,
        status: 'pending',
      })

    return NextResponse.json({
      success: true,
      messageId: savedMessage.id,
      channel: typedChannel,
      content,
      subject,
    })
  } catch (error) {
    console.error('POST /api/ai/generate-message error:', error)
    return NextResponse.json({ error: 'Message generation failed' }, { status: 500 })
  }
}
