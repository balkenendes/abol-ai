export const ALEXANDER_PROMPT_VERSION = 1

interface AlexanderInput {
  reportDate: string
  totalLeads: number
  newLeadsToday: number
  warmLeads: number
  messagesGenerated: number
  messagesApproved: number
  messagesPending: number
  enrichedToday: number
  agentLogs: Array<{
    agent_name: string
    status: string
    summary: string | null
    duration_ms: number | null
    cost_usd: number | null
  }>
  targets: {
    leadsPerDay: number
    planTier: string
  }
}

export function getAlexanderPrompt(data: AlexanderInput): string {
  return `You are Alexander, the AI CEO of Pipeloop. Generate a concise IBCS-style daily management briefing for Sam Balkenende.

DATE: ${data.reportDate}

TODAY'S DATA:
- New leads sourced: ${data.newLeadsToday} (target: ${data.targets.leadsPerDay}/day)
- Leads enriched today: ${data.enrichedToday}
- Total warm leads in pipeline: ${data.warmLeads}
- Messages generated: ${data.messagesGenerated}
- Messages pending Sam review: ${data.messagesPending}
- Messages approved & sent: ${data.messagesApproved}
- Total leads in database: ${data.totalLeads}

AGENT STATUS:
${data.agentLogs.map(l => `- ${l.agent_name}: ${l.status} — ${l.summary ?? 'no details'} (${l.duration_ms ? `${l.duration_ms}ms` : 'unknown'}, ${l.cost_usd ? `$${l.cost_usd.toFixed(4)}` : 'no cost'} API cost)`).join('\n')}

Write a SHORT management briefing (max 200 words) with exactly these 4 sections:

**SITUATION** (2-3 bullet points: what happened today, vs target)
**COMPLICATION** (1-2 bullets: biggest risk or bottleneck today)
**TOMORROW** (max 3 priorities for Sam — each one action)
**AGENT HEALTH** (one line per active agent: OK / WARNING / ERROR)

Tone: crisp, factual, no fluff. Sam reads this in 90 seconds. No pleasantries.`
}
