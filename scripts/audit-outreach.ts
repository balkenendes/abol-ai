#!/usr/bin/env tsx
/**
 * audit-outreach — the money-making CLI.
 *
 * Usage:
 *   npx tsx scripts/audit-outreach.ts <prospects.txt> [--send] [--from name@domain]
 *
 * prospects.txt format (one per line):
 *   <store-url>,<owner-email>[,<owner-name>]
 *
 *   Example:
 *     https://magentoshop.example,owner@magentoshop.example,Jane Doe
 *     https://oldwoocommerce.example,info@oldwoocommerce.example
 *
 * Behaviour:
 *   - Default dry-run: scans, generates email, prints what would be sent. Nothing leaves.
 *   - --send flag: actually sends each email via Resend. Skips prospects whose audit band
 *     is "modern" (no real findings = no honest cold-pitch).
 *   - Writes a JSONL log to data/outreach.jsonl with every attempt.
 *   - Skips URLs already logged within the last 30 days (no double-pitching).
 *
 * Required env (.env.local):
 *   ANTHROPIC_API_KEY  — for audit email generation
 *   RESEND_API_KEY     — only required when --send is used
 */

import { readFile, mkdir, appendFile, readFile as readFileMaybe } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { Resend } from "resend";
import { scanSite } from "../lib/scan";
import { generateAuditEmail, type AuditEmail } from "../lib/audit-email";
import { encodeAuditToken } from "../lib/audit-token";

config({ path: ".env.local" });

const PUBLIC_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://pipeloop.ai";
const FROM_DEFAULT = "Sam Balkenende <sam@pipeloop.ai>";
const REPLY_TO = "sam@pipeloop.ai";
const LOG_PATH = path.join(process.cwd(), "data", "outreach.jsonl");
const SEND_DELAY_MS = 6000; // be polite — 1 send per 6s = 10/min, well under Resend's limit
const DEDUPE_WINDOW_DAYS = 30;

interface Prospect {
  url: string;
  email: string;
  name?: string;
}

interface OutreachLog {
  ts: string;
  url: string;
  email: string;
  dryRun: boolean;
  sent: boolean;
  skipped?: string;
  scoreBand?: string;
  outdatedScore?: number;
  subject?: string;
  body?: string;
  resendId?: string;
  error?: string;
}

function parseArgs(argv: string[]): { file: string; send: boolean; from: string } {
  const args = argv.slice(2);
  let file = "";
  let send = false;
  let from = FROM_DEFAULT;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--send") send = true;
    else if (a === "--from") from = args[++i] ?? from;
    else if (!file) file = a;
  }
  if (!file) {
    console.error("usage: tsx scripts/audit-outreach.ts <prospects.txt> [--send] [--from 'Name <a@b>']");
    process.exit(1);
  }
  return { file, send, from };
}

async function readProspects(file: string): Promise<Prospect[]> {
  const raw = await readFile(file, "utf8");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const out: Prospect[] = [];
  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    const [url, email, name] = parts;
    if (!url || !email) {
      console.warn(`skipping malformed line: ${line}`);
      continue;
    }
    out.push({ url, email, name });
  }
  return out;
}

async function readLog(): Promise<Map<string, string>> {
  // Map of normalized URL → most-recent ISO timestamp logged.
  const map = new Map<string, string>();
  if (!existsSync(LOG_PATH)) return map;
  const raw = await readFileMaybe(LOG_PATH, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    try {
      const e = JSON.parse(line) as OutreachLog;
      if (e.url && e.ts) {
        const cur = map.get(e.url);
        if (!cur || e.ts > cur) map.set(e.url, e.ts);
      }
    } catch {
      // ignore corrupt lines
    }
  }
  return map;
}

function isWithin(daysAgo: number, isoTs: string): boolean {
  const cutoff = Date.now() - daysAgo * 24 * 3600 * 1000;
  return new Date(isoTs).getTime() > cutoff;
}

async function logResult(entry: OutreachLog) {
  await mkdir(path.dirname(LOG_PATH), { recursive: true });
  await appendFile(LOG_PATH, JSON.stringify(entry) + "\n", "utf8");
}

function formatPreview(p: Prospect, scoreBand: string, score: number, email: AuditEmail): string {
  const lines = [
    "─".repeat(72),
    `to:      ${p.email}${p.name ? ` (${p.name})` : ""}`,
    `url:     ${p.url}`,
    `score:   ${score}/10  band: ${scoreBand}`,
    `subject: ${email.subject}`,
    "",
    email.body,
    "",
    `cta:     ${email.ctaUrl}`,
  ];
  if (email.warnings.length > 0) {
    lines.push("", "warnings:");
    for (const w of email.warnings) lines.push(`  ! ${w}`);
  }
  return lines.join("\n");
}

async function main() {
  const { file, send, from } = parseArgs(process.argv);
  console.log(`mode:     ${send ? "SEND (real emails)" : "DRY RUN (preview only)"}`);
  console.log(`from:     ${from}`);
  console.log(`reply-to: ${REPLY_TO}`);
  console.log(`log:      ${LOG_PATH}`);
  console.log("");

  const prospects = await readProspects(file);
  console.log(`prospects loaded: ${prospects.length}`);
  if (prospects.length === 0) process.exit(0);

  const seen = await readLog();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY not set in .env.local");
    process.exit(1);
  }
  let resend: Resend | null = null;
  if (send) {
    if (!process.env.RESEND_API_KEY) {
      console.error("ERROR: RESEND_API_KEY not set in .env.local (required for --send)");
      process.exit(1);
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }

  let stats = { scanned: 0, modern_skipped: 0, blocked: 0, dedupe_skipped: 0, sent: 0, errored: 0 };

  for (const p of prospects) {
    console.log(`\n[${stats.scanned + stats.dedupe_skipped + 1}/${prospects.length}] ${p.url}`);

    const lastSeen = seen.get(p.url);
    if (lastSeen && isWithin(DEDUPE_WINDOW_DAYS, lastSeen)) {
      console.log(`  ↳ skipped: pitched on ${lastSeen.slice(0, 10)} (within ${DEDUPE_WINDOW_DAYS}d window)`);
      stats.dedupe_skipped++;
      continue;
    }

    let audit;
    try {
      audit = await scanSite(p.url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ↳ scan-error: ${msg}`);
      await logResult({ ts: new Date().toISOString(), url: p.url, email: p.email, dryRun: !send, sent: false, skipped: "scan-error", error: msg });
      stats.errored++;
      continue;
    }
    stats.scanned++;

    if (audit.status !== "ok") {
      console.log(`  ↳ blocked: ${audit.status} (${audit.errorMessage ?? "n/a"})`);
      await logResult({ ts: new Date().toISOString(), url: p.url, email: p.email, dryRun: !send, sent: false, skipped: audit.status, scoreBand: audit.scoreBand, error: audit.errorMessage });
      stats.blocked++;
      continue;
    }

    if (audit.scoreBand === "modern") {
      console.log(`  ↳ skipped: site is modern (score ${audit.outdatedScore}/10) — no honest pitch to make`);
      await logResult({ ts: new Date().toISOString(), url: p.url, email: p.email, dryRun: !send, sent: false, skipped: "modern", scoreBand: audit.scoreBand, outdatedScore: audit.outdatedScore });
      stats.modern_skipped++;
      continue;
    }

    const token = encodeAuditToken(audit.finalUrl);
    const ctaUrl = `${PUBLIC_BASE}/r/${token}`;

    let email: AuditEmail;
    try {
      email = await generateAuditEmail(audit, { ctaUrl, fromName: from.split("<")[0].trim(), apiKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ↳ email-gen-error: ${msg}`);
      await logResult({ ts: new Date().toISOString(), url: p.url, email: p.email, dryRun: !send, sent: false, skipped: "email-gen-error", error: msg });
      stats.errored++;
      continue;
    }

    if (email.subject.startsWith("[skip]")) {
      console.log(`  ↳ skipped: model returned [skip] (${email.subject})`);
      await logResult({ ts: new Date().toISOString(), url: p.url, email: p.email, dryRun: !send, sent: false, skipped: "model-skip", subject: email.subject, scoreBand: audit.scoreBand, outdatedScore: audit.outdatedScore });
      stats.modern_skipped++;
      continue;
    }

    console.log(formatPreview(p, audit.scoreBand, audit.outdatedScore, email));

    if (!send) {
      await logResult({ ts: new Date().toISOString(), url: p.url, email: p.email, dryRun: true, sent: false, scoreBand: audit.scoreBand, outdatedScore: audit.outdatedScore, subject: email.subject, body: email.body });
      continue;
    }

    try {
      const html = email.body
        .split(/\n\n+/)
        .map((para) => `<p style="margin:0 0 14px;line-height:1.55;font-family:Georgia,serif;font-size:15px;color:#1a1a1a;">${para.replace(/\n/g, "<br>")}</p>`)
        .join("");
      const fullHtml = `<div style="max-width:560px;font-family:Georgia,serif;color:#1a1a1a;">${html}<p style="margin-top:32px;font-size:11px;color:#999;font-family:sans-serif;">If you'd rather not hear from me, just reply STOP.</p></div>`;
      const text = `${email.body}\n\n--\nIf you'd rather not hear from me, just reply STOP.`;

      const result = await resend!.emails.send({
        from,
        to: p.email,
        reply_to: REPLY_TO,
        subject: email.subject,
        html: fullHtml,
        text,
        headers: {
          "List-Unsubscribe": `<mailto:${REPLY_TO}?subject=Unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      if (result.error) throw new Error(result.error.message ?? JSON.stringify(result.error));
      const id = result.data?.id;
      console.log(`  ↳ SENT (resend id: ${id})`);
      await logResult({ ts: new Date().toISOString(), url: p.url, email: p.email, dryRun: false, sent: true, scoreBand: audit.scoreBand, outdatedScore: audit.outdatedScore, subject: email.subject, body: email.body, resendId: id });
      stats.sent++;
      // pace it
      await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ↳ send-error: ${msg}`);
      await logResult({ ts: new Date().toISOString(), url: p.url, email: p.email, dryRun: false, sent: false, skipped: "send-error", subject: email.subject, body: email.body, error: msg });
      stats.errored++;
    }
  }

  console.log("\n" + "═".repeat(72));
  console.log(`done.  scanned: ${stats.scanned}  modern-skipped: ${stats.modern_skipped}  blocked: ${stats.blocked}  dedupe-skipped: ${stats.dedupe_skipped}  errored: ${stats.errored}  sent: ${stats.sent}`);
  console.log(`log:   ${LOG_PATH}`);
  if (!send) console.log(`\nDry run complete. Review the log, then re-run with --send to actually send.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
