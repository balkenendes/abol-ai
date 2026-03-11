export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as { reviewId?: string; editedContent?: string }
    const { reviewId, editedContent } = body

    if (!reviewId) {
      return NextResponse.json({ error: 'reviewId is required' }, { status: 400 })
    }

    // Get review queue item — must belong to this user
    const { data: review, error: reviewError } = await adminClient
      .from('review_queue')
      .select('*, outreach_messages(*), leads(first_name, last_name, company, linkedin_url, stage)')
      .eq('id', reviewId)
      .eq('user_id', user.id)
      .single()

    if (reviewError || !review) {
      return NextResponse.json({ error: 'Review item not found' }, { status: 404 })
    }

    if (review.status !== 'pending') {
      return NextResponse.json({ error: 'Already reviewed' }, { status: 400 })
    }

    const message = review.outreach_messages as { id: string; channel: string; content: string }
    const lead = review.leads as { first_name: string; last_name: string; company: string; linkedin_url: string; stage: string }

    // If Sam edited the content, save it
    const finalContent = editedContent?.trim() ?? message.content

    // Update message
    await adminClient
      .from('outreach_messages')
      .update({
        content: finalContent,
        status: 'approved',
      })
      .eq('id', message.id)

    // Mark review as approved
    await adminClient
      .from('review_queue')
      .update({
        status: editedContent ? 'edited' : 'approved',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', reviewId)

    // Update lead stage based on channel
    const newStage = getStageForChannel(message.channel, lead.stage)
    if (newStage !== lead.stage) {
      await adminClient
        .from('leads')
        .update({ stage: newStage, updated_at: new Date().toISOString() })
        .eq('id', review.lead_id as string)
    }

    // Log for agent tracking
    await adminClient
      .from('agent_logs')
      .insert({
        agent_name: 'vincent',
        status: 'success',
        summary: `Message approved: ${message.channel} to ${lead.first_name} ${lead.last_name} at ${lead.company}`,
        details: { reviewId, channel: message.channel, leadId: review.lead_id, edited: !!editedContent },
      })

    return NextResponse.json({ success: true, channel: message.channel })
  } catch (error) {
    console.error('POST /api/review/approve error:', error)
    return NextResponse.json({ error: 'Failed to approve review' }, { status: 500 })
  }
}

function getStageForChannel(channel: string, currentStage: string): string {
  if (channel === 'linkedin_request' && currentStage === 'enriched') return 'contacted'
  if (channel === 'linkedin_dm' && currentStage === 'contacted') return 'connected'
  if (channel.startsWith('email_') && currentStage === 'enriched') return 'contacted'
  return currentStage
}
