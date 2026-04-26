import Anthropic from "@anthropic-ai/sdk";
import type { AuditResult } from "./audit-types";

export interface AuditEmail {
  subject: string;
  body: string;
  ctaUrl: string;
  warnings: string[];
}

const SYSTEM_PROMPT = `You are a cold-email writer for Pipeloop, a service that rebuilds outdated e-commerce sites for a fixed $7,500 in 14 days, refund if missed.

Your reader is the OWNER of an e-commerce store. They are skeptical, busy, and have seen a thousand "your site is slow" pitches before. You break through by citing one or two SPECIFIC, VERIFIABLE facts about their actual site (not generic claims).

Hard rules — violations are unacceptable:
- Never fabricate numbers ("you're losing $X/mo") unless the audit JSON contains the figure with a source.
- Never use "AI-powered", "10x", "supercharge", "transform", "unlock", "leverage", "elevate", "synergy".
- No emoji. No exclamation marks. No "I hope this email finds you well." No "I noticed your business and..."
- Subject line includes their domain and one specific fact, under 65 characters.
- Body is 4-6 short sentences. One paragraph or two. No bullet points longer than 3 items.
- Sign-off: just the name, no title, no signature block.
- The CTA is a single sentence with the URL. The URL is provided in the input — use it verbatim.
- If the audit shows the site is actually MODERN (band: modern), do NOT send a cold pitch — return a subject like "[skip] site looks fine" so the caller knows to filter.
- Tone: a competent stranger who has done their homework, not a salesperson. The diagnosis IS the pitch.

Output strictly as JSON: {"subject": "...", "body": "...", "ctaUrl": "...", "warnings": ["any concerns about the audit data"]}.`;

function buildUserPrompt(audit: AuditResult, ctaUrl: string, fromName: string): string {
  const platform = audit.platform.platform;
  const version = audit.platform.version ?? "version unknown";
  const findings = audit.findings;
  const company = audit.company?.name ?? new URL(audit.finalUrl).hostname;
  const facts: string[] = [];

  if (findings?.platformEol) facts.push(`Platform: ${platform} ${version} — End-of-Life since June 2020 (Adobe announcement)`);
  else if (findings?.platformOutdated) facts.push(`Platform: ${platform} ${version} — several major versions behind current`);
  if (findings?.missingHttps) facts.push(`HTTPS: not enforced on ${audit.finalUrl}`);
  if (findings?.missingMobileViewport) facts.push("Mobile: no <meta viewport> tag — phones render desktop-width");
  if (findings?.missingStructuredData) facts.push("AI search: no Organization/Store JSON-LD — invisible to ChatGPT/Perplexity/Google AI Overviews");
  if (findings?.legacyJsLibraries) facts.push(`Legacy JS: loads ${audit.performance?.estimatedHeavyAssets[0] ?? "ancient jQuery/Prototype"}`);
  if (findings?.bloatedHtml && audit.performance) {
    facts.push(`HTML payload: ${(audit.performance.htmlBytes / 1024).toFixed(0)}KB before assets`);
  }

  const factBlock = facts.length === 0 ? "(no critical issues detected)" : facts.map((f) => `- ${f}`).join("\n");

  return `Audit JSON for ${company} (${audit.finalUrl}):

Score: ${audit.outdatedScore}/10 (${audit.scoreBand})
Platform: ${platform} (confidence ${(audit.platform.confidence * 100).toFixed(0)}%)
${audit.platform.signals.length > 0 ? `Detection signals: ${audit.platform.signals.join("; ")}` : ""}

Verified facts you may cite:
${factBlock}

Write the cold email from "${fromName}" to the owner of ${company}. The CTA url is ${ctaUrl}.
If band is "modern", return a subject prefixed with "[skip]" and an empty body — do not pitch a working site.`;
}

export async function generateAuditEmail(
  audit: AuditResult,
  opts: { ctaUrl: string; fromName?: string; apiKey?: string },
): Promise<AuditEmail> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("missing-anthropic-api-key");

  const client = new Anthropic({ apiKey });
  const userPrompt = buildUserPrompt(audit, opts.ctaUrl, opts.fromName ?? "Sam at Pipeloop");

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("no-text-response");
  }

  // Strip optional markdown fences and parse.
  const raw = textBlock.text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`malformed-json: ${raw.slice(0, 200)}`);
  }
  const obj = parsed as Partial<AuditEmail>;
  if (typeof obj.subject !== "string" || typeof obj.body !== "string" || typeof obj.ctaUrl !== "string") {
    throw new Error("missing-fields-in-response");
  }
  return {
    subject: obj.subject,
    body: obj.body,
    ctaUrl: obj.ctaUrl,
    warnings: Array.isArray(obj.warnings) ? obj.warnings : [],
  };
}
