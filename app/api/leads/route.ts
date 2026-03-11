export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { leadSchema } from '@/lib/validation'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') ?? ''
    const stage = searchParams.get('stage') ?? ''
    const status = searchParams.get('status') ?? ''
    const page = parseInt(searchParams.get('page') ?? '1', 10)
    const pageSize = 50
    const offset = (page - 1) * pageSize

    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (stage) query = query.eq('stage', stage)
    if (status) query = query.eq('enrichment_status', status)
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%`
      )
    }

    const { data: leads, count, error } = await query

    if (error) throw error

    return NextResponse.json({ leads, total: count, page, pageSize })
  } catch (error) {
    console.error('GET /api/leads error:', error)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as unknown
    const parsed = leadSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid lead data', details: parsed.error.flatten() }, { status: 400 })
    }

    const lead = parsed.data
    const dedup_hash = simpleHash(
      `${lead.first_name.toLowerCase()}${lead.last_name.toLowerCase()}${lead.company.toLowerCase()}`
    )

    const { data, error } = await supabase
      .from('leads')
      .insert({ ...lead, user_id: user.id, dedup_hash, source: 'manual' })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ lead: data }, { status: 201 })
  } catch (error) {
    console.error('POST /api/leads error:', error)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
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
