export const OUTREACH_PROMPT_VERSION = 1

export function getOutreachPrompt(enrichmentData: Record<string, unknown>, senderInfo: { name: string; company: string; what_you_sell: string }): string {
  return `Generate personalized B2B outreach for this prospect.

PROSPECT DATA: ${JSON.stringify(enrichmentData, null, 2)}
SENDER: ${senderInfo.name} at ${senderInfo.company}
WHAT WE SELL: ${senderInfo.what_you_sell}
PERSUASION STYLE: ${String(enrichmentData['persuasion_profile'])}

Return ONLY valid JSON with these exact fields:
{
  "linkedin_connection_request": "max 300 chars",
  "linkedin_dm": "day 2 DM",
  "email_1_subject": "subject",
  "email_1_body": "body",
  "email_2_subject": "subject",
  "email_2_body": "body",
  "email_3_subject": "subject",
  "email_3_body": "body",
  "email_4_subject": "subject",
  "email_4_body": "body"
}`
}
