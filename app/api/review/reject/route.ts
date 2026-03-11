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

    const body = await request.json() as { reviewId?: string; reason?: string }
    const { reviewId, reason } = body

    if (!reviewId) {
      return NextResponse.json({ error: 'reviewId is required' }, { status: 400 })
    }

    // Get review — must belong to this user
    const { data: review, error: reviewError } = await adminClient
      .from('review_queue')
      .select('*, outreach_messages(channel)')
      .eq('id', reviewId)
      .eq('user_id', user.id)
      .single()

    if (reviewError || !review) {
      return NextResponse.json({ error: 'Review item not found' }, { status: 404 })
    }

    if (review.status !== 'pending') {
      return NextResponse.json({ error: 'Already reviewed' }, { status: 400 })
    }

    // Update message to rejected
    await adminClient
      .from('outreach_messages')
      .update({ status: 'draft' })
      .eq('id', review.message_id as string)

    // Mark review as rejected
    await adminClient
      .from('review_queue')
      .update({
        status: 'rejected',
        sam_notes: reason ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', reviewId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/review/reject error:', error)
    return NextResponse.json({ error: 'Failed to reject review' }, { status: 500 })
  }
}
