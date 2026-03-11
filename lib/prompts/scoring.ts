// Engagement scoring rules — matches CLAUDE.md specification
export const SCORING_EVENTS = {
  linkedin_accept: 2,
  linkedin_dm_reply: 3,
  email_open: 1,
  email_click: 2,
  email_reply: 4,
} as const

export type ScoreEvent = keyof typeof SCORING_EVENTS

export const SCORE_LEVELS = {
  cold: { min: 0, max: 3, label: 'Cold' },
  warming: { min: 4, max: 6, label: 'Warming' },
  engaged: { min: 7, max: 8, label: 'Engaged' },
  warm: { min: 9, max: 10, label: 'WARM' },
} as const

export function applyScoreEvent(currentScore: number, event: ScoreEvent): number {
  const delta = SCORING_EVENTS[event]
  return Math.min(10, Math.max(0, currentScore + delta))
}

export function getScoreLevel(score: number): string {
  if (score <= 3) return 'cold'
  if (score <= 6) return 'warming'
  if (score <= 8) return 'engaged'
  return 'warm'
}

export function isWarm(score: number): boolean {
  return score >= 9
}

// What to do after a score event
export function getNextAction(event: ScoreEvent, leadId: string): {
  generateMessage: boolean
  channel?: string
  waitDays?: number
} {
  switch (event) {
    case 'linkedin_accept':
      // Generate DM immediately after acceptance
      return { generateMessage: true, channel: 'linkedin_dm' }
    case 'linkedin_dm_reply':
      // Human follow-up needed, no automated message
      return { generateMessage: false }
    case 'email_open':
      // Wait and see — don't generate next email yet
      return { generateMessage: false }
    case 'email_click':
      // Strong signal — next email sooner
      return { generateMessage: false, waitDays: 3 }
    case 'email_reply':
      // Human takes over
      return { generateMessage: false }
    default:
      return { generateMessage: false }
  }
}
