export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { runSequence } from '@/agents/sequence'

export async function POST(request: NextRequest) {
  // Auth: Vercel Cron or internal webhook secret
  const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  const isWebhook = request.headers.get('authorization') === `Bearer ${process.env.WEBHOOK_SECRET}`

  if (!isVercelCron && !isWebhook) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runSequence()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('Sequence agent error:', err)
    return NextResponse.json({ error: 'Sequence failed' }, { status: 500 })
  }
}

// Also allow GET for manual trigger from dashboard
export async function GET(request: NextRequest) {
  const isWebhook = request.headers.get('authorization') === `Bearer ${process.env.WEBHOOK_SECRET}`
  if (!isWebhook) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await runSequence()
  return NextResponse.json({ success: true, ...result })
}
