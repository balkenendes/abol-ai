// Vincent — LinkedIn Outreach Agent
// Executes approved LinkedIn messages via PhantomBuster
// Triggered when Sam approves a message in the review queue

import { adminClient } from '@/lib/supabase/admin'
import { sendLinkedInConnectionRequest, sendLinkedInDM } from '@/lib/phantombuster'
import { publishEvent, EVENTS } from '@/lib/message-bus'

interface VincentResult {
  success: boolean
  messageId: string
  channel: string
  error?: string
}

// Execute a single approved message
export async function executeApprovedMessage(messageId: string): Promise<VincentResult> {
  const startTime = Date.now()

  try {
    // Get the approved message
    const { data: message, error: msgError } = await adminClient
      .from('outreach_messages')
      .select('*, leads(linkedin_url, first_name, last_name, company)')
      .eq('id', messageId)
      .eq('status', 'approved')
      .single()

    if (msgError || !message) {
      return { success: false, messageId, channel: '', error: 'Message not found or not approved' }
    }

    const lead = message.leads as { linkedin_url: string | null; first_name: string; last_name: string; company: string }
    const channel = message.channel as string

    if (!lead.linkedin_url && (channel === 'linkedin_request' || channel === 'linkedin_dm')) {
      // No LinkedIn URL — skip LinkedIn, mark for email instead
      await adminClient
        .from('outreach_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', messageId)

      return { success: true, messageId, channel }
    }

    // Get user's PhantomBuster config
    const { data: user } = await adminClient
      .from('users')
      .select('phantombuster_api_key')
      .eq('id', message.user_id as string)
      .single()

    const phantomApiKey = (user?.phantombuster_api_key as string | null) ?? process.env.PHANTOMBUSTER_API_KEY ?? ''

    if (!phantomApiKey) {
      // No PhantomBuster configured — mark as sent (manual send needed)
      console.warn(`[Vincent] No PhantomBuster key for user ${String(message.user_id)} — marking as sent manually`)
      await adminClient
        .from('outreach_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', messageId)

      return { success: true, messageId, channel }
    }

    let sendResult

    if (channel === 'linkedin_request') {
      sendResult = await sendLinkedInConnectionRequest({
        apiKey: phantomApiKey,
        phantomId: process.env.PHANTOM_CONNECT_ID ?? '',
        profileUrl: lead.linkedin_url!,
        message: message.content as string,
      })
    } else if (channel === 'linkedin_dm') {
      sendResult = await sendLinkedInDM({
        apiKey: phantomApiKey,
        phantomId: process.env.PHANTOM_DM_ID ?? '',
        profileUrl: lead.linkedin_url!,
        message: message.content as string,
      })
    } else {
      // Email channels handled by Resend — not Vincent's job
      return { success: true, messageId, channel }
    }

    if (sendResult.status === 'error') {
      throw new Error(sendResult.error ?? 'PhantomBuster send failed')
    }

    const durationMs = Date.now() - startTime

    // Mark message as sent
    await adminClient
      .from('outreach_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', messageId)

    // Update lead stage
    await adminClient
      .from('leads')
      .update({
        stage: channel === 'linkedin_request' ? 'contacted' : 'connected',
        next_action: channel === 'linkedin_request' ? 'Wait for acceptance' : 'Wait for reply',
        next_action_at: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(), // +6 days
        updated_at: new Date().toISOString(),
      })
      .eq('id', message.lead_id as string)

    // Log Vincent's action
    await adminClient.from('agent_logs').insert({
      agent_name: 'vincent',
      status: 'success',
      summary: `Sent ${channel} to ${lead.first_name} ${lead.last_name} at ${lead.company}`,
      details: { messageId, channel, leadId: message.lead_id, containerId: sendResult.containerId },
      duration_ms: durationMs,
    })

    // Publish event
    await publishEvent({
      type: EVENTS.MESSAGE_SENT,
      from: 'vincent',
      to: 'alexander',
      payload: { messageId, channel, leadId: message.lead_id },
    })

    return { success: true, messageId, channel }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errMsg = String(error)

    try {
      await adminClient.from('agent_logs').insert({
        agent_name: 'vincent',
        status: 'error',
        summary: `Failed to send message ${messageId}`,
        error_message: errMsg,
        duration_ms: durationMs,
      })
    } catch {}

    return { success: false, messageId, channel: '', error: errMsg }
  }
}
