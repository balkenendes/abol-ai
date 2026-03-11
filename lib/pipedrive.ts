// Pipedrive CRM sync
// Syncs leads and deal stages to Pipedrive when enabled

const PIPEDRIVE_BASE = 'https://api.pipedrive.com/v1'

export interface PipedriveLead {
  first_name: string
  last_name: string
  email?: string | null
  phone?: string | null
  company?: string | null
  title?: string | null
  linkedin_url?: string | null
  engagement_score?: number
  stage?: string
}

async function pipedriveRequest(
  path: string,
  method: string,
  apiKey: string,
  body?: unknown
) {
  const separator = path.includes('?') ? '&' : '?'
  const res = await fetch(`${PIPEDRIVE_BASE}${path}${separator}api_token=${apiKey}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    throw new Error(`Pipedrive error ${res.status}`)
  }
  return res.json() as Promise<{ data: Record<string, unknown> | null; success: boolean }>
}

export async function syncLeadToPipedrive(apiKey: string, lead: PipedriveLead): Promise<string | null> {
  if (!apiKey) return null

  try {
    // Create or update person
    const personData: Record<string, unknown> = {
      name: `${lead.first_name} ${lead.last_name}`,
      ...(lead.email ? { email: [{ value: lead.email, primary: true }] } : {}),
      ...(lead.phone ? { phone: [{ value: lead.phone, primary: true }] } : {}),
      org_name: lead.company ?? undefined,
      job_title: lead.title ?? undefined,
    }

    const personResult = await pipedriveRequest('/persons', 'POST', apiKey, personData)
    const personId = personResult.data?.['id'] as number | undefined
    if (!personId) return null

    // Create deal
    const dealData: Record<string, unknown> = {
      title: `${lead.first_name} ${lead.last_name} — ${lead.company ?? 'Unknown'}`,
      person_id: personId,
      status: 'open',
    }

    const dealResult = await pipedriveRequest('/deals', 'POST', apiKey, dealData)
    const dealId = dealResult.data?.['id'] as number | undefined

    return dealId ? String(dealId) : null
  } catch (error) {
    console.error('[Pipedrive] Sync failed:', error)
    return null
  }
}

export async function updateDealStage(apiKey: string, dealId: string, stage: string): Promise<void> {
  if (!apiKey || !dealId) return

  // Map Pipeloop stage to Pipedrive stage name
  const stageMap: Record<string, string> = {
    contacted: 'Contacted',
    connected: 'Connected',
    engaged: 'Engaged',
    warm: 'Warm',
    meeting_booked: 'Meeting Booked',
    closed_won: 'Won',
    closed_lost: 'Lost',
  }

  const pipedriveStage = stageMap[stage]
  if (!pipedriveStage) return

  try {
    await pipedriveRequest(`/deals/${dealId}`, 'PUT', apiKey, {
      stage_id: pipedriveStage,
    })
  } catch (error) {
    console.error('[Pipedrive] Stage update failed:', error)
  }
}
