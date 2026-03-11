export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as {
      stepId?: string
      stepLabel?: string
      agentName?: string
      leadsAtStep?: number
      totalLeads?: number
      userMessage?: string
    }

    const { stepId, stepLabel, agentName, leadsAtStep, totalLeads, userMessage } = body

    if (!stepId || !userMessage) {
      return NextResponse.json({ error: 'stepId and userMessage are required' }, { status: 400 })
    }

    const systemPrompts: Record<string, string> = {
      icp: `You are Scout AI, responsible for ICP (Ideal Customer Profile) targeting in Pipeloop's autonomous sales pipeline. You help identify and qualify B2B SaaS founders with €0-2M ARR in the Netherlands and DACH region. You're data-driven and specific.`,
      research: `You are Insight AI, responsible for lead research and pain point identification. You analyze prospect companies to find the strongest problem-market fit signals. You focus on: no structured pipeline, founder-led sales bottleneck, low outbound reply rates.`,
      scrape: `You are Crawler AI, responsible for website scanning and tech stack detection. You scrape company websites using Jina.ai to extract firmographic data, tech stack signals, and content that reveals buying intent and pain points.`,
      enrichment: `You are Enrich AI, responsible for data enrichment using Claude AI. You analyze website content to build persuasion profiles (analytical/visionary/relational/driver), identify conversation hooks, and map key challenges. You produce the enrichment data that drives personalized outreach.`,
      linkedin: `You are Vincent, the LinkedIn outreach agent. You send connection requests and DMs via PhantomBuster automation. You manage timing (best: Tue-Thu 9-11am), rate limits (<10/day to stay safe), and connection rates. You know LinkedIn's automation rules and how to avoid detection.`,
      outreach: `You are Outreach AI, responsible for follow-up outreach including LinkedIn DMs after connection acceptance and email fallback via Resend when LinkedIn isn't available. You optimize message tone based on persuasion profiles.`,
      warm: `You are Convert AI, tracking warm leads — prospects with high engagement scores who have shown buying intent. You monitor engagement signals, trigger warm alerts to Sam, and recommend next steps to convert prospects into meetings.`,
    }

    const systemPrompt = systemPrompts[stepId] ?? `You are an AI agent in Pipeloop's autonomous sales pipeline, managing the ${stepLabel ?? stepId} step.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: systemPrompt + `\n\nCurrent pipeline context:\n- You are managing: ${stepLabel}\n- Leads at this step: ${leadsAtStep ?? 0}\n- Total leads in pipeline: ${totalLeads ?? 0}\n\nBe concise, specific, and actionable. Max 3-4 sentences. No markdown formatting.`,
      messages: [{ role: 'user', content: userMessage }],
    })

    const reply = (message.content[0] as { type: string; text: string }).text

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('POST /api/ai/pipeline-chat error:', error)
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 })
  }
}
