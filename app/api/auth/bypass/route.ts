// Sam's direct access bypass — no login wall
// Hit: /api/auth/bypass?token=YOUR_WEBHOOK_SECRET
// → Auto-signs in ADMIN_EMAIL → dashboard

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const secret = process.env.WEBHOOK_SECRET

  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) {
    return NextResponse.json({ error: 'ADMIN_EMAIL not configured' }, { status: 500 })
  }

  const admin = getAdminClient()

  // Step 1: Ensure the user exists in Supabase auth
  const { data: userList } = await admin.auth.admin.listUsers()
  const existingUser = userList?.users?.find(u => u.email === adminEmail)

  if (!existingUser) {
    const { error: createError } = await admin.auth.admin.createUser({
      email: adminEmail,
      email_confirm: true,
    })
    if (createError) {
      return NextResponse.json({ error: 'Could not create user', detail: createError.message }, { status: 500 })
    }
  }

  // Step 2: Generate a magic link
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pipeloop.ai'
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: adminEmail,
    options: {
      redirectTo: `${appUrl}/auth/callback?next=/dashboard`,
    },
  })

  if (error || !data?.properties?.action_link) {
    return NextResponse.json({
      error: 'Failed to generate link',
      detail: error?.message ?? 'no action_link returned',
    }, { status: 500 })
  }

  return NextResponse.redirect(data.properties.action_link)
}
