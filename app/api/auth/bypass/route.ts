// Sam's direct access bypass — no login wall
// Hit: /api/auth/bypass?token=YOUR_WEBHOOK_SECRET
// → Auto-signs you in and redirects to dashboard

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const secret = process.env.WEBHOOK_SECRET

  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) {
    return NextResponse.json({ error: 'ADMIN_EMAIL not set in env vars' }, { status: 500 })
  }

  // Generate a magic link for the admin email
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: adminEmail,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`,
    },
  })

  if (error || !data?.properties?.action_link) {
    console.error('Bypass auth error:', error)
    return NextResponse.json({ error: 'Failed to generate login link' }, { status: 500 })
  }

  // Redirect directly — Sam lands on dashboard, already logged in
  return NextResponse.redirect(data.properties.action_link)
}
