export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { runNova } from '@/agents/nova'

// Called by Vercel Cron at 08:00 daily
// Also manually triggerable from settings

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET ?? process.env.WEBHOOK_SECRET

  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  const isAuthorized = authHeader === `Bearer ${cronSecret}`

  if (!isVercelCron && !isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[Nova] Lead search triggered at', new Date().toISOString())

  const result = await runNova()

  return NextResponse.json(result)
}

export async function GET(request: NextRequest) {
  return POST(request)
}
