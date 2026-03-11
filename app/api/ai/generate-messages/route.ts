export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { generateOutreach, type EnrichmentData } from '@/lib/anthropic'

const CHANNEL_MAP: Record<string, string> = {
  linkedin_connection_request: 'linkedin_request',
  linkedin_dm: 'linkedin_dm',
  email_1_body: 'email_1',
  email_2_body: 'email_2',
  email_3_body: 'email_3',
  email_4_body: 'email_4',
}

const SUBJECT_MAP: Record<string, string> = {
  linkedin_request: '',
  linkedin_dm: '',
  email_1: 'email_1_subject',
  email_2: 'email_2_subject',
  email_3: 'email_3_subject',
  email_4: 'email_4_subject',
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { leadId?: string }
    const { leadId } = body

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 })
    }

    // Get lead with enrichment data
    const { data: lead, error: leadError } = await adminClient
      .from('leads')
      .select('*, users(name, company_name, what_you_sell)')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (!lead.enrichment_data) {
      return NextResponse.json({ error: 'Lead not yet enriched' }, { status: 400 })
    }

    // Get user profile for sender info
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

    // Generate outreach messages
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

    // Save messages to database
    const messagesToInsert = []

    // LinkedIn messages
    if (outreachMessages.linkedin_connection_request) {
      messagesToInsert.push({
        lead_id: leadId,
        user_id: lead.user_id as string,
        channel: 'linkedin_request',
        content: outreachMessages.linkedin_connection_request,
        status: 'draft',
        prompt_version: 1,
      })
    }

    if (outreachMessages.linkedin_dm) {
      messagesToInsert.push({
        lead_id: leadId,
        user_id: lead.user_id as string,
        channel: 'linkedin_dm',
        content: outreachMessages.linkedin_dm,
        status: 'draft',
        prompt_version: 1,
      })
    }

    // Email messages
    for (let i = 1; i <= 4; i++) {
      const bodyKey = `email_${i}_body` as keyof typeof outreachMessages
      const subjectKey = `email_${i}_subject` as keyof typeof outreachMessages
      const body = outreachMessages[bodyKey]
      const subject = outreachMessages[subjectKey]

      if (body) {
        messagesToInsert.push({
          lead_id: leadId,
          user_id: lead.user_id as string,
          channel: `email_${i}`,
          subject: subject as string || null,
          content: body as string,
          status: 'draft',
          prompt_version: 1,
        })
      }
    }

    const { error: insertError } = await adminClient
      .from('outreach_messages')
      .insert(messagesToInsert)

    if (insertError) throw insertError

    // Suppress unused variable warnings
    void CHANNEL_MAP
    void SUBJECT_MAP

    return NextResponse.json({
      success: true,
      messageCount: messagesToInsert.length,
    })
  } catch (error) {
    console.error('POST /api/ai/generate-messages error:', error)
    return NextResponse.json({ error: 'Message generation failed' }, { status: 500 })
  }
}
