export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// GDPR Article 17 — Right to Erasure
// Deletes ALL data for the authenticated user

export async function DELETE() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = user.id

    // Delete in correct order (foreign key constraints)
    await adminClient.from('review_queue').delete().eq('user_id', userId)
    await adminClient.from('outreach_messages').delete().eq('user_id', userId)
    await adminClient.from('lead_imports').delete().eq('user_id', userId)
    await adminClient.from('leads').delete().eq('user_id', userId)
    await adminClient.from('campaigns').delete().eq('user_id', userId)
    await adminClient.from('user_icp').delete().eq('user_id', userId)
    await adminClient.from('users').delete().eq('id', userId)

    // Delete auth user (last)
    await adminClient.auth.admin.deleteUser(userId)

    return NextResponse.json({ success: true, message: 'All data deleted' })
  } catch (error) {
    console.error('DELETE /api/data-delete error:', error)
    return NextResponse.json({ error: 'Deletion failed' }, { status: 500 })
  }
}
