export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { applyScoreEvent, getNextAction, isWarm, type ScoreEvent } from '@/lib/prompts/scoring'
import { sendWarmLeadAlert } from '@/lib/resend'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as { leadId?: string; event?: string }
    const { leadId, event } = body

    if (!leadId || !event) {
      return NextResponse.json({ error: 'leadId and event are required' }, { status: 400 })
    }

    const validEvents: ScoreEvent[] = ['linkedin_accept', 'linkedin_dm_reply', 'email_open', 'email_click', 'email_reply']
    if (!validEvents.includes(event as ScoreEvent)) {
      return NextResponse.json({ error: `Invalid event. Must be one of: ${validEvents.join(', ')}` }, { status: 400 })
    }

    // Get lead — must belong to this user
    const { data: lead, error: leadError } = await adminClient
      .from('leads')
      .select('id, engagement_score, is_warm, stage, first_name, last_name, company, user_id')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const currentScore = (lead.engagement_score as number) ?? 0
    const newScore = applyScoreEvent(currentScore, event as ScoreEvent)
    const wasWarm = lead.is_warm as boolean
    const nowWarm = isWarm(newScore)

    // Determine new stage
    let newStage = lead.stage as string
    if (event === 'linkedin_accept' && newStage === 'contacted') newStage = 'connected'
    if (event === 'linkedin_dm_reply' && newStage === 'connected') newStage = 'engaged'
    if (event === 'email_reply' && newStage === 'contacted') newStage = 'engaged'
    if (nowWarm) newStage = 'warm'

    // Update lead
    await adminClient
      .from('leads')
      .update({
        engagement_score: newScore,
        is_warm: nowWarm,
        stage: newStage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)

    // Send warm alert if just became warm
    if (!wasWarm && nowWarm) {
      const { data: userProfile } = await adminClient
        .from('users')
        .select('email')
        .eq('id', user.id)
        .single()

      if (userProfile?.email) {
        await sendWarmLeadAlert({
          toEmail: userProfile.email as string,
          leadName: `${String(lead.first_name)} ${String(lead.last_name)}`,
          company: String(lead.company),
          score: newScore,
          leadUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/leads/${leadId}`,
        }).catch(err => console.error('[Score] Warm alert failed:', err))
      }
    }

    // Check if we need to generate the next message on-demand
    const nextAction = getNextAction(event as ScoreEvent, leadId)
    if (nextAction.generateMessage && nextAction.channel) {
      void fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/generate-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, channel: nextAction.channel }),
      }).catch(err => console.error('[Score] Next message generation failed:', err))
    }

    return NextResponse.json({
      success: true,
      previousScore: currentScore,
      newScore,
      becameWarm: !wasWarm && nowWarm,
      newStage,
      nextAction,
    })
  } catch (error) {
    console.error('POST /api/ai/score error:', error)
    return NextResponse.json({ error: 'Score update failed' }, { status: 500 })
  }
}
