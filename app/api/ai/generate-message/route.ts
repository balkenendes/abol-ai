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
  linkedin_request: 'Write a LinkedIn connection request. Max 300 characters. Reference one specific detail about their company. No generic messages.',
  linkedin_dm: 'Write a LinkedIn DM sent right after they accepted the connection. Lead with value, end with one low-friction question. Max 500 characters.',
  email_1: 'Write a cold email (day 8 of no LinkedIn reply). Subject + body. Open with an observation about their business. End with an open question — no pitch.',
  email_2: 'Write a follow-up email (day 12). Share one concrete insight or stat relevant to their business. Clear CTA: 15-minute call.',
  email_3: 'Write a follow-up email (day 17). Acknowledge you\'ve reached out before. Share a short resource (case study or idea). Soft ask.',
  email_4: 'Write a final email (day 22). Close the loop gracefully. Leave the door open. No pressure.',
}

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
    const body = await request.json() as { leadId?: string; channel?: Channel }
    const { leadId, channel } = body

    if (!leadId || !channel) {
      return NextResponse.json({ error: 'leadId and channel are required' }, { status: 400 })
    }

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
    const instruction = CHANNEL_INSTRUCTIONS[channel]
    const enrichment = lead.enrichment_data as Record<string, unknown>

    const needsSubject = channel.startsWith('email_')

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
        channel,
        content,
        subject: subject ?? null,
        status: 'pending_review',
        prompt_version: 1,
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
      channel,
      content,
      subject,
    })
  } catch (error) {
    console.error('POST /api/ai/generate-message error:', error)
    return NextResponse.json({ error: 'Message generation failed' }, { status: 500 })
  }
}
