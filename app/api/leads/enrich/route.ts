export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { enrichLead } from '@/lib/anthropic'

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { leadId?: string }
    const { leadId } = body

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 })
    }

    // Get lead
    const { data: lead, error: fetchError } = await adminClient
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (fetchError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Skip if already completed
    if (lead.enrichment_status === 'completed') {
      return NextResponse.json({ success: true, message: 'Already enriched' })
    }

    // Mark as processing
    await adminClient
      .from('leads')
      .update({ enrichment_status: 'processing' })
      .eq('id', leadId)

    // Fetch website content
    let websiteContent = ''
    const websiteUrl = (lead.website as string | null) ?? (lead.company ? `https://www.${(lead.company as string).toLowerCase().replace(/\s+/g, '')}.com` : null)

    if (websiteUrl) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8000)
        const res = await fetch(websiteUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Pipeloop-Bot/1.0)' },
        })
        clearTimeout(timeout)
        if (res.ok) {
          const html = await res.text()
          websiteContent = stripHtml(html)
        }
      } catch {
        // Website fetch failed, continue with company name
        websiteContent = `Company: ${String(lead.company ?? 'Unknown')}`
      }
    } else {
      websiteContent = `Company: ${String(lead.company ?? 'Unknown')}`
    }

    // Call Claude for enrichment
    const enrichmentData = await enrichLead(websiteContent, lead.linkedin_url as string | undefined)

    // Calculate engagement score based on enrichment
    const score = calculateEngagementScore(enrichmentData)
    const isWarm = score >= 7

    // Save enrichment data
    await adminClient
      .from('leads')
      .update({
        enrichment_data: enrichmentData,
        persuasion_profile: enrichmentData.persuasion_profile,
        enrichment_status: 'completed',
        enriched_at: new Date().toISOString(),
        engagement_score: score,
        is_warm: isWarm,
        stage: 'enriched',
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)

    // ON DEMAND: Generate ONLY the LinkedIn connection request — the first step
    // Never pre-generate all messages. Each step generates one message when needed.
    void fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/generate-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, channel: 'linkedin_request' }),
    }).catch(err => console.error('LinkedIn request generation error:', err))

    return NextResponse.json({ success: true, score, isWarm })
  } catch (error) {
    console.error('POST /api/leads/enrich error:', error)

    // Mark as failed if we have a leadId
    try {
      const body = await request.clone().json() as { leadId?: string }
      if (body.leadId) {
        await adminClient
          .from('leads')
          .update({ enrichment_status: 'failed' })
          .eq('id', body.leadId)
      }
    } catch {}

    return NextResponse.json({ error: 'Enrichment failed' }, { status: 500 })
  }
}

interface EnrichmentResult {
  key_challenges?: string[]
  tech_stack_signals?: string[]
  conversation_hooks?: string[]
  company_size_estimate?: string
  persuasion_profile?: string
}

function calculateEngagementScore(enrichment: EnrichmentResult): number {
  let score = 3 // base score

  // Has meaningful challenges
  if (enrichment.key_challenges && enrichment.key_challenges.length >= 2) score += 1
  // Has tech stack signals (indicates mature company)
  if (enrichment.tech_stack_signals && enrichment.tech_stack_signals.length >= 2) score += 1
  // Has conversation hooks
  if (enrichment.conversation_hooks && enrichment.conversation_hooks.length >= 2) score += 1
  // Company size signals
  if (enrichment.company_size_estimate && (
    enrichment.company_size_estimate.includes('11-50') ||
    enrichment.company_size_estimate.includes('51-200') ||
    enrichment.company_size_estimate.includes('201-500')
  )) score += 1
  // Strong persuasion profile signals
  if (enrichment.persuasion_profile && enrichment.persuasion_profile !== 'unknown') score += 1

  return Math.min(10, Math.max(0, score))
}
