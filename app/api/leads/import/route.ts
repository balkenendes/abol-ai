export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { importCSVSchema } from '@/lib/validation'

const PLAN_LIMITS: Record<string, number> = {
  trial: 10,
  starter: 100,
  growth: 200,
  scale: 400,
}

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user plan
    const { data: profile } = await supabase
      .from('users')
      .select('plan_tier')
      .eq('id', user.id)
      .single()

    const planTier = profile?.plan_tier ?? 'trial'
    const limit = PLAN_LIMITS[planTier] ?? 10

    // Check current lead count
    const { count: currentCount } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((currentCount ?? 0) >= limit) {
      return NextResponse.json(
        { error: `Lead limit reached. Your ${planTier} plan allows ${limit} leads.` },
        { status: 403 }
      )
    }

    const body = await request.json() as unknown
    const parsed = importCSVSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { leads } = parsed.data
    const availableSlots = limit - (currentCount ?? 0)
    const leadsToImport = leads.slice(0, availableSlots)

    // Create import record
    const { data: importRecord } = await supabase
      .from('lead_imports')
      .insert({
        user_id: user.id,
        source: 'csv',
        total_rows: leads.length,
        status: 'processing',
      })
      .select()
      .single()

    let imported = 0
    let duplicates_skipped = 0
    let errors = 0
    const importedIds: string[] = []

    for (const lead of leadsToImport) {
      try {
        const dedup_hash = simpleHash(
          `${lead.first_name.toLowerCase()}${lead.last_name.toLowerCase()}${lead.company.toLowerCase()}`
        )

        const insertData: Record<string, unknown> = {
          user_id: user.id,
          first_name: lead.first_name,
          last_name: lead.last_name,
          company: lead.company,
          source: 'csv',
          dedup_hash,
        }

        if (lead.email) insertData['email'] = lead.email
        if (lead.phone) insertData['phone'] = lead.phone
        if (lead.title) insertData['title'] = lead.title
        if (lead.linkedin_url) insertData['linkedin_url'] = lead.linkedin_url
        if (lead.website) insertData['website'] = lead.website

        const { data: newLead, error } = await supabase
          .from('leads')
          .insert(insertData)
          .select('id')
          .single()

        if (error) {
          if (error.code === '23505') {
            duplicates_skipped++
          } else {
            errors++
          }
        } else if (newLead) {
          imported++
          importedIds.push(newLead.id)
        }
      } catch {
        errors++
      }
    }

    // Update import record
    await supabase
      .from('lead_imports')
      .update({
        imported,
        duplicates_skipped,
        errors,
        status: 'completed',
      })
      .eq('id', importRecord?.id)

    // Queue first 3 leads for immediate enrichment
    const immediateEnrich = importedIds.slice(0, 3)
    for (const leadId of immediateEnrich) {
      void fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/leads/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      }).catch(err => console.error('Enrichment trigger error:', err))
    }

    return NextResponse.json({
      imported,
      duplicates_skipped,
      errors,
      import_id: importRecord?.id,
      total_submitted: leads.length,
      slots_available: availableSlots,
    })
  } catch (error) {
    console.error('POST /api/leads/import error:', error)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
