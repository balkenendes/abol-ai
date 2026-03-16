export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { executeApprovedMessage } from '@/agents/vincent'
import { sendOutreachEmail } from '@/lib/resend'
import { publishEvent, EVENTS } from '@/lib/message-bus'

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
      .select('*, outreach_messages(*), leads(id, first_name, last_name, company, linkedin_url, email, stage)')
      .eq('id', reviewId)
      .eq('user_id', user.id)
      .single()

    if (reviewError || !review) {
      return NextResponse.json({ error: 'Review item not found' }, { status: 404 })
    }

    if (review.status !== 'pending') {
      return NextResponse.json({ error: 'Already reviewed' }, { status: 400 })
    }

    const message = review.outreach_messages as { id: string; channel: string; content: string; subject: string | null }
    const lead = review.leads as { id: string; first_name: string; last_name: string; company: string; linkedin_url: string | null; email: string | null; stage: string }

    // If Sam edited the content, save it
    const finalContent = editedContent?.trim() ?? message.content

    // Update message status to approved
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
        .eq('id', lead.id)
    }

    // EXECUTE: Send the message
    let sendResult = { success: false, error: '' }

    if (message.channel === 'linkedin_request' || message.channel === 'linkedin_dm') {
      // LinkedIn channels → Vincent sends via PhantomBuster
      const vincentResult = await executeApprovedMessage(message.id)
      sendResult = { success: vincentResult.success, error: vincentResult.error ?? '' }
    } else if (message.channel === 'email_fallback') {
      // Email fallback → send directly via Resend
      if (lead.email) {
        try {
          const { data: userProfile } = await adminClient
            .from('users')
            .select('name, company_name, email')
            .eq('id', user.id)
            .single()

          const senderName = (userProfile?.name as string | null) ?? 'Sales Rep'

          await sendOutreachEmail({
            to: lead.email,
            subject: message.subject ?? `Quick question for ${lead.first_name}`,
            body: finalContent,
            senderName,
            replyTo: (userProfile?.email as string | null) ?? undefined,
          })

          await adminClient
            .from('outreach_messages')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', message.id)

          sendResult = { success: true, error: '' }

          await publishEvent({
            type: EVENTS.MESSAGE_SENT,
            from: 'system',
            to: 'alexander',
            payload: { messageId: message.id, channel: 'email_fallback', leadId: lead.id },
          })
        } catch (err) {
          sendResult = { success: false, error: String(err) }
        }
      } else {
        sendResult = { success: false, error: 'No email address for this lead' }
      }
    }

    // Log
    await adminClient
      .from('agent_logs')
      .insert({
        agent_name: 'vincent',
        status: sendResult.success ? 'success' : 'warning',
        summary: sendResult.success
          ? `Approved and sent: ${message.channel} to ${lead.first_name} ${lead.last_name} at ${lead.company}`
          : `Approved but send failed: ${sendResult.error}`,
        details: { reviewId, channel: message.channel, leadId: lead.id, edited: !!editedContent, sent: sendResult.success },
      })

    return NextResponse.json({
      success: true,
      channel: message.channel,
      sent: sendResult.success,
      sendError: sendResult.success ? undefined : sendResult.error,
    })
  } catch (error) {
    console.error('POST /api/review/approve error:', error)
    return NextResponse.json({ error: 'Failed to approve review' }, { status: 500 })
  }
}

function getStageForChannel(channel: string, currentStage: string): string {
  if (channel === 'linkedin_request' && currentStage === 'enriched') return 'contacted'
  if (channel === 'linkedin_dm' && currentStage === 'contacted') return 'connected'
  if (channel === 'email_fallback' && currentStage === 'enriched') return 'contacted'
  return currentStage
}
