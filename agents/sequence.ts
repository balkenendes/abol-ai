// Sequence Agent — runs every 6 hours
// Drives the 8-step sales cycle automatically:
// new → enrich → linkedin_request → linkedin_dm → email_1 → email_2 → email_3
// Generates one message per step, drops it in Sam's review queue.

import { adminClient } from '@/lib/supabase/admin'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pipeloop.ai'

/* ── call existing API routes internally ── */
async function enrichLead(leadId: string) {
  try {
    await fetch(`${APP_URL}/api/leads/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId }),
    })
  } catch (err) {
    console.error(`[Sequence] Enrich failed for ${leadId}:`, err)
  }
}

async function generateMessage(leadId: string, channel: string) {
  try {
    const res = await fetch(`${APP_URL}/api/ai/generate-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, channel }),
    })
    const data = await res.json() as { success?: boolean; error?: string }
    if (!data.success) console.error(`[Sequence] generate-message failed:`, data.error)
    return data.success ?? false
  } catch (err) {
    console.error(`[Sequence] generate-message error:`, err)
    return false
  }
}

/* ── check if a message channel was already generated for a lead ── */
async function messageExists(leadId: string, channel: string): Promise<boolean> {
  const { count } = await adminClient
    .from('outreach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('channel', channel)
  return (count ?? 0) > 0
}

/* ── send warm alert to Sam ── */
async function sendWarmAlert(userId: string, leadId: string, leadName: string, company: string, score: number) {
  try {
    const { data: user } = await adminClient
      .from('users')
      .select('email, name')
      .eq('id', userId)
      .single()

    if (!user?.email) return

    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: 'Alexander <alexander@pipeloop.ai>',
      to: user.email as string,
      subject: `🔥 Warm lead alert: ${leadName} at ${company} (score ${score}/10)`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;background:#0a0a0f;color:#e2e2ef;padding:32px;border-radius:12px">
          <h2 style="color:#00d4aa;margin-bottom:8px">🔥 Hot lead detected</h2>
          <p style="color:#a0a0b0">Alexander here. <strong style="color:#fff">${leadName} at ${company}</strong> just hit a score of <strong style="color:#ef4444">${score}/10</strong>.</p>
          <p style="color:#a0a0b0">This means they've shown strong engagement signals. Now is the best time to reach out personally.</p>
          <a href="${APP_URL}/dashboard/leads" style="display:inline-block;margin-top:16px;background:#00d4aa;color:#0a0a0f;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            View lead →
          </a>
          <p style="color:#44445a;font-size:12px;margin-top:24px">Alexander · Pipeloop AI · Daily briefing at 20:00</p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[Sequence] Warm alert failed:', err)
  }
}

/* ═══════════════════════════════════════════════════════════ */
export async function runSequence(): Promise<{ processed: number; errors: number }> {
  let processed = 0
  let errors = 0
  const now = new Date()

  try {
    // Get all active users (completed onboarding)
    const { data: users } = await adminClient
      .from('users')
      .select('id, email')
      .eq('onboarding_completed', true)

    if (!users?.length) return { processed: 0, errors: 0 }

    for (const user of users) {
      const userId = user.id as string

      try {
        /* ── STEP 1: Enrich pending leads ── */
        const { data: pendingLeads } = await adminClient
          .from('leads')
          .select('id')
          .eq('user_id', userId)
          .eq('enrichment_status', 'pending')
          .eq('stage', 'new')
          .limit(5) // max 5 per run to avoid timeout

        for (const lead of pendingLeads ?? []) {
          await enrichLead(lead.id as string)
          processed++
        }

        /* ── STEP 2: Generate LI request for enriched leads with no messages ── */
        // Note: enrich route already fires this automatically.
        // This is a safety net for leads that slipped through.
        const { data: enrichedNoMsg } = await adminClient
          .from('leads')
          .select('id')
          .eq('user_id', userId)
          .eq('enrichment_status', 'completed')
          .eq('stage', 'enriched')
          .limit(5)

        for (const lead of enrichedNoMsg ?? []) {
          const exists = await messageExists(lead.id as string, 'linkedin_request')
          if (!exists) {
            await generateMessage(lead.id as string, 'linkedin_request')
            processed++
          }
        }

        /* ── STEP 3: LI DM for contacted leads (3+ days after request) ── */
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
        const { data: contactedLeads } = await adminClient
          .from('leads')
          .select('id, updated_at')
          .eq('user_id', userId)
          .eq('stage', 'contacted')
          .lte('next_action_at', now.toISOString())
          .limit(5)

        for (const lead of contactedLeads ?? []) {
          const updatedAt = new Date(lead.updated_at as string)
          if (updatedAt <= threeDaysAgo) {
            const dmExists = await messageExists(lead.id as string, 'linkedin_dm')
            if (!dmExists) {
              await generateMessage(lead.id as string, 'linkedin_dm')
              processed++
            }
          }
        }

        /* ── STEP 4: Email 1 for contacted 7+ days (no LI acceptance) ── */
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const { data: stalledLeads } = await adminClient
          .from('leads')
          .select('id, updated_at')
          .eq('user_id', userId)
          .eq('stage', 'contacted')
          .lte('updated_at', sevenDaysAgo.toISOString())
          .limit(5)

        for (const lead of stalledLeads ?? []) {
          const email1Exists = await messageExists(lead.id as string, 'email_1')
          if (!email1Exists) {
            await generateMessage(lead.id as string, 'email_1')
            processed++
          }
        }

        /* ── STEP 5: Email 1 for connected leads (DM sent, 6+ days) ── */
        const { data: connectedLeads } = await adminClient
          .from('leads')
          .select('id')
          .eq('user_id', userId)
          .eq('stage', 'connected')
          .lte('next_action_at', now.toISOString())
          .limit(5)

        for (const lead of connectedLeads ?? []) {
          const email1Exists = await messageExists(lead.id as string, 'email_1')
          if (!email1Exists) {
            await generateMessage(lead.id as string, 'email_1')
            processed++
          }
        }

        /* ── STEP 6: Email 2 for engaged leads (email_1 sent) ── */
        const { data: engagedLeads } = await adminClient
          .from('leads')
          .select('id')
          .eq('user_id', userId)
          .eq('stage', 'engaged')
          .lte('next_action_at', now.toISOString())
          .limit(5)

        for (const lead of engagedLeads ?? []) {
          const email2Exists = await messageExists(lead.id as string, 'email_2')
          if (!email2Exists) {
            await generateMessage(lead.id as string, 'email_2')
            processed++
          }
        }

        /* ── STEP 7: Warm alerts (score ≥ 8, not yet marked warm) ── */
        const { data: warmLeads } = await adminClient
          .from('leads')
          .select('id, first_name, last_name, company, engagement_score')
          .eq('user_id', userId)
          .eq('is_warm', false)
          .gte('engagement_score', 8)

        for (const lead of warmLeads ?? []) {
          const name = `${String(lead.first_name ?? '')} ${String(lead.last_name ?? '')}`.trim()
          await sendWarmAlert(userId, lead.id as string, name, String(lead.company ?? ''), lead.engagement_score as number)
          await adminClient
            .from('leads')
            .update({ is_warm: true, stage: 'warm', updated_at: now.toISOString() })
            .eq('id', lead.id as string)
          processed++
        }

      } catch (userErr) {
        console.error(`[Sequence] Error for user ${userId}:`, userErr)
        errors++
      }
    }

    // Log the run
    await adminClient.from('agent_logs').insert({
      agent_name: 'sequence',
      status: errors === 0 ? 'success' : 'error',
      summary: `Sequence run complete: ${processed} actions, ${errors} errors`,
      details: { processed, errors, run_at: now.toISOString() },
    })

  } catch (err) {
    console.error('[Sequence] Fatal error:', err)
    errors++
  }

  return { processed, errors }
}
