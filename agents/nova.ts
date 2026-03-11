// Nova — Lead Generation Agent
// Searches Apollo.io daily for new leads matching the client's ICP
// Triggered by Vercel Cron at 08:00 daily via POST /api/agents/nova

import { adminClient } from '@/lib/supabase/admin'
import { searchLeads, sizeToApolloRange } from '@/lib/apollo'
import { PLAN_LIMITS } from '@/lib/stripe'
import { publishEvent, EVENTS } from '@/lib/message-bus'

interface NovaResult {
  success: boolean
  userId: string
  leadsFound: number
  leadsImported: number
  duplicatesSkipped: number
  error?: string
}

export async function runNovaForUser(userId: string): Promise<NovaResult> {
  const startTime = Date.now()

  try {
    // Get user profile + ICP
    const { data: user, error: userError } = await adminClient
      .from('users')
      .select('plan_tier, apollo_api_key')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return { success: false, userId, leadsFound: 0, leadsImported: 0, duplicatesSkipped: 0, error: 'User not found' }
    }

    const { data: icp } = await adminClient
      .from('user_icp')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!icp) {
      return { success: false, userId, leadsFound: 0, leadsImported: 0, duplicatesSkipped: 0, error: 'No ICP configured' }
    }

    // How many leads can we import today?
    const planTier = (user.plan_tier as string | null) ?? 'trial'
    const limit = PLAN_LIMITS[planTier]?.leadsPerDay ?? 1

    // Check how many leads already added today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { count: todayCount } = await adminClient
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source', 'nova')
      .gte('created_at', today.toISOString())

    const remaining = limit - (todayCount ?? 0)
    if (remaining <= 0) {
      return { success: true, userId, leadsFound: 0, leadsImported: 0, duplicatesSkipped: 0 }
    }

    // Search Apollo for leads
    const apolloKey = (user.apollo_api_key as string | null) ?? process.env.APOLLO_API_KEY ?? ''
    const apolloLeads = await searchLeads(apolloKey, {
      titles: icp.target_title ? [icp.target_title] : undefined,
      industries: icp.target_industry ? [icp.target_industry] : undefined,
      countries: icp.target_country ? [icp.target_country] : undefined,
      employeeCount: icp.target_company_size ? sizeToApolloRange(icp.target_company_size as string) : undefined,
      perPage: remaining,
    })

    if (!apolloLeads.length) {
      return { success: true, userId, leadsFound: 0, leadsImported: 0, duplicatesSkipped: 0 }
    }

    let imported = 0
    let duplicates = 0

    for (const lead of apolloLeads) {
      // Build dedup hash
      const dedupStr = `${userId}-${lead.email ?? lead.linkedin_url ?? `${lead.first_name}-${lead.last_name}-${lead.company}`}`
      const dedupHash = Buffer.from(dedupStr).toString('base64').slice(0, 32)

      const { error: insertError } = await adminClient
        .from('leads')
        .insert({
          user_id: userId,
          first_name: lead.first_name,
          last_name: lead.last_name,
          email: lead.email ?? null,
          company: lead.company,
          title: lead.title,
          linkedin_url: lead.linkedin_url ?? null,
          website: lead.company_website ?? null,
          source: 'nova',
          dedup_hash: dedupHash,
          enrichment_status: 'pending',
          stage: 'new',
        })

      if (insertError) {
        if (insertError.code === '23505') {
          duplicates++
        } else {
          console.error('[Nova] Insert error:', insertError)
        }
      } else {
        imported++
      }
    }

    const durationMs = Date.now() - startTime

    // Log Nova's run
    await adminClient.from('agent_logs').insert({
      agent_name: 'nova',
      status: 'success',
      summary: `Found ${apolloLeads.length} leads, imported ${imported}, skipped ${duplicates} duplicates`,
      details: { userId, planTier, limit, imported, duplicates },
      duration_ms: durationMs,
    })

    // Notify Vincent to start enriching
    await publishEvent({
      type: EVENTS.LEAD_ENRICHED,
      from: 'nova',
      to: 'vincent',
      payload: { userId, count: imported },
    })

    return { success: true, userId, leadsFound: apolloLeads.length, leadsImported: imported, duplicatesSkipped: duplicates }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errMsg = String(error)

    try {
      await adminClient.from('agent_logs').insert({
        agent_name: 'nova',
        status: 'error',
        summary: 'Lead search failed',
        error_message: errMsg,
        duration_ms: durationMs,
        details: { userId },
      })
    } catch {}

    return { success: false, userId, leadsFound: 0, leadsImported: 0, duplicatesSkipped: 0, error: errMsg }
  }
}

// Run Nova for ALL active users
export async function runNova() {
  const { data: users } = await adminClient
    .from('users')
    .select('id')
    .eq('onboarding_completed', true)

  if (!users?.length) return { success: true, results: [] }

  const results = await Promise.allSettled(
    users.map(u => runNovaForUser(u.id as string))
  )

  return {
    success: true,
    results: results.map(r => r.status === 'fulfilled' ? r.value : { error: String(r) }),
  }
}
