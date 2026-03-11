export const ENRICHMENT_PROMPT_VERSION = 1

export function getEnrichmentPrompt(websiteContent: string, linkedinUrl?: string): string {
  return `You are an expert B2B sales researcher analyzing a company for outbound sales.

Website content: ${websiteContent.slice(0, 3000)}
LinkedIn: ${linkedinUrl ?? 'not provided'}

Analyze and return ONLY valid JSON:
{
  "company_summary": "2 sentences max",
  "what_they_sell": "clear description",
  "target_market": "who they sell to",
  "company_size_estimate": "1-10 / 11-50 / 51-200 / 201-500 / 500+",
  "tech_stack_signals": ["array of detected technologies"],
  "recent_news_or_activity": "any signals of growth/change",
  "key_challenges": ["challenge1", "challenge2", "challenge3"],
  "persuasion_profile": "analytical or visionary or relational or driver",
  "persuasion_reasoning": "1 sentence why",
  "conversation_hooks": ["hook1", "hook2", "hook3"]
}`
}
