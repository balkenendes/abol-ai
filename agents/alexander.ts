// Alexander — CEO Agent
// Generates daily IBCS-style management briefing at 20:00
// Triggered by Vercel Cron via POST /api/agents/alexander

import { adminClient } from '@/lib/supabase/admin'
import { getAlexanderPrompt } from '@/lib/prompts/alexander'
import { sendAlexanderReport } from '@/lib/resend'
import { publishEvent, EVENTS } from '@/lib/message-bus'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

export async function runAlexander(): Promise<{ success: boolean; report?: string; error?: string }> {
  const startTime = Date.now()
  const reportDate = new Date().toLocaleDateString('nl-NL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayIso = today.toISOString()

    // Gather all KPIs in parallel
    const [
      totalLeadsResult,
      newLeadsTodayResult,
      warmLeadsResult,
      messagesResult,
      pendingReviewResult,
      enrichedTodayResult,
      agentLogsResult,
    ] = await Promise.all([
      adminClient.from('leads').select('id', { count: 'exact', head: true }),
      adminClient.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', todayIso),
      adminClient.from('leads').select('id', { count: 'exact', head: true }).eq('is_warm', true),
      adminClient.from('outreach_messages').select('status', { count: 'exact' }),
      adminClient.from('review_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      adminClient.from('leads').select('id', { count: 'exact', head: true }).gte('enriched_at', todayIso),
      adminClient.from('agent_logs').select('agent_name, status, summary, duration_ms, cost_usd').gte('run_at', todayIso).order('run_at', { ascending: false }).limit(20),
    ])

    const messages = (messagesResult.data ?? []) as Array<{ status: string }>
    const messagesApproved = messages.filter(m => m.status === 'approved' || m.status === 'sent').length
    const messagesGenerated = messages.length

    // Get user plan info (for targets)
    const { data: users } = await adminClient
      .from('users')
      .select('plan_tier, email')
      .eq('onboarding_completed', true)
      .limit(100)

    // Default targets (use first paying user or trial)
    const planTier = (users?.[0]?.plan_tier as string | null) ?? 'trial'
    const leadsPerDay = planTier === 'scale' ? 5 : planTier === 'growth' ? 2 : 1

    // Build prompt input
    const promptInput = {
      reportDate,
      totalLeads: totalLeadsResult.count ?? 0,
      newLeadsToday: newLeadsTodayResult.count ?? 0,
      warmLeads: warmLeadsResult.count ?? 0,
      messagesGenerated,
      messagesApproved,
      messagesPending: pendingReviewResult.count ?? 0,
      enrichedToday: enrichedTodayResult.count ?? 0,
      agentLogs: (agentLogsResult.data ?? []) as Array<{
        agent_name: string
        status: string
        summary: string | null
        duration_ms: number | null
        cost_usd: number | null
      }>,
      targets: { leadsPerDay, planTier },
    }

    // Generate report with Claude
    const response = await callWithRetry(async () => {
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages: [{ role: 'user', content: getAlexanderPrompt(promptInput) }]
      })
      return (msg.content[0] as { type: string; text: string }).text
    })

    const durationMs = Date.now() - startTime
    const kpis = {
      totalLeads: promptInput.totalLeads,
      newLeadsToday: promptInput.newLeadsToday,
      warmLeads: promptInput.warmLeads,
      messagesGenerated: promptInput.messagesGenerated,
      messagesApproved: promptInput.messagesApproved,
      messagesPending: promptInput.messagesPending,
    }

    // Save report to DB
    await adminClient
      .from('daily_reports')
      .upsert({
        report_date: new Date().toISOString().split('T')[0],
        summary: response,
        kpis,
        agent_health: promptInput.agentLogs,
        priorities: [],
      }, { onConflict: 'report_date' })

    // Log Alexander's run
    await adminClient.from('agent_logs').insert({
      agent_name: 'alexander',
      status: 'success',
      summary: `Daily report generated for ${reportDate}`,
      details: kpis,
      duration_ms: durationMs,
    })

    // Send email to each active user
    for (const user of (users ?? [])) {
      if (user.email) {
        await sendAlexanderReport({
          toEmail: user.email,
          reportDate,
          reportHtml: response.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'),
        }).catch(err => console.error('[Alexander] Email send failed:', err))
      }
    }

    // Publish event
    await publishEvent({
      type: EVENTS.REPORT_GENERATED,
      from: 'alexander',
      to: 'sam',
      payload: { reportDate, kpis },
    })

    return { success: true, report: response }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errMsg = String(error)

    try {
      await adminClient.from('agent_logs').insert({
        agent_name: 'alexander',
        status: 'error',
        summary: 'Daily report failed',
        error_message: errMsg,
        duration_ms: durationMs,
      })
    } catch {}

    return { success: false, error: errMsg }
  }
}
