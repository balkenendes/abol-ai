export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { generateOutreach, type EnrichmentData } from '@/lib/anthropic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { leadId?: string }
    const { leadId } = body

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 })
    }

    const { data: lead, error: leadError } = await adminClient
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (!lead.enrichment_data) {
      return NextResponse.json({ error: 'Lead not yet enriched' }, { status: 400 })
    }

    const { data: userProfile } = await adminClient
      .from('users')
      .select('name, company_name, what_you_sell')
      .eq('id', lead.user_id as string)
      .single()

    const senderInfo = {
      name: (userProfile?.name as string | null) ?? 'Sales Rep',
      company: (userProfile?.company_name as string | null) ?? 'Our Company',
      what_you_sell: (userProfile?.what_you_sell as string | null) ?? 'B2B solutions',
    }

    const outreachMessages = await generateOutreach(
      lead.enrichment_data as EnrichmentData,
      senderInfo
    )

    // Delete existing draft messages to replace them
    await adminClient
      .from('outreach_messages')
      .delete()
      .eq('lead_id', leadId)
      .eq('status', 'draft')

    const messagesToInsert = []

    if (outreachMessages.linkedin_connection_request) {
      messagesToInsert.push({
        lead_id: leadId,
        user_id: lead.user_id as string,
        channel: 'linkedin_request',
        content: outreachMessages.linkedin_connection_request,
        status: 'draft',
        prompt_version: 2,
      })
    }

    if (outreachMessages.linkedin_dm) {
      messagesToInsert.push({
        lead_id: leadId,
        user_id: lead.user_id as string,
        channel: 'linkedin_dm',
        content: outreachMessages.linkedin_dm,
        status: 'draft',
        prompt_version: 2,
      })
    }

    if (outreachMessages.email_fallback_body) {
      messagesToInsert.push({
        lead_id: leadId,
        user_id: lead.user_id as string,
        channel: 'email_fallback',
        subject: outreachMessages.email_fallback_subject || null,
        content: outreachMessages.email_fallback_body,
        status: 'draft',
        prompt_version: 2,
      })
    }

    const { error: insertError } = await adminClient
      .from('outreach_messages')
      .insert(messagesToInsert)

    if (insertError) throw insertError

    return NextResponse.json({
      success: true,
      messageCount: messagesToInsert.length,
    })
  } catch (error) {
    console.error('POST /api/ai/generate-messages error:', error)
    return NextResponse.json({ error: 'Message generation failed' }, { status: 500 })
  }
}
