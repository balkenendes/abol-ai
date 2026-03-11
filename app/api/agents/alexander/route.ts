export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { runAlexander } from '@/agents/alexander'

// Secured endpoint — called by Vercel Cron at 20:00 daily
// Also callable manually by Sam from settings

export async function POST(request: NextRequest) {
  // Verify the request is from Vercel Cron or an internal call
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET ?? process.env.WEBHOOK_SECRET

  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  const isAuthorized = authHeader === `Bearer ${cronSecret}`

  if (!isVercelCron && !isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[Alexander] Daily report triggered at', new Date().toISOString())

  const result = await runAlexander()

  if (!result.success) {
    console.error('[Alexander] Failed:', result.error)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true, reportLength: result.report?.length ?? 0 })
}

// Allow GET from Vercel Cron (some cron implementations use GET)
export async function GET(request: NextRequest) {
  return POST(request)
}
