export const OUTREACH_PROMPT_VERSION = 2

export function getOutreachPrompt(enrichmentData: Record<string, unknown>, senderInfo: { name: string; company: string; what_you_sell: string }): string {
  return `Generate personalized B2B outreach for this prospect.

PROSPECT DATA: ${JSON.stringify(enrichmentData, null, 2)}
SENDER: ${senderInfo.name} at ${senderInfo.company}
WHAT WE SELL: ${senderInfo.what_you_sell}
PERSUASION STYLE: ${String(enrichmentData['persuasion_profile'])}

Return ONLY valid JSON with these exact fields:
{
  "linkedin_connection_request": "max 300 chars, personal, reference one specific detail about their company",
  "linkedin_dm": "follow-up DM after they accept, value-first, ends with one low-friction question, max 500 chars",
  "email_fallback_subject": "subject line for email fallback when no LinkedIn available",
  "email_fallback_body": "email body, open with observation about their business, end with open question, no hard pitch"
}`
}
