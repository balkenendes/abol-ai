// send-email — transactional email router for abol.ai
// =====================================================
// One Supabase Edge Function, three email flows:
//
//   whitepaper    — confirmation after waitlist signup ("Send me the PDF")
//   scan_result   — after scan completion: user's score + upsell link
//   paid_report   — after Stripe payment: "report on its way within 1 hour"
//
// Callable from:
//   - Browser (app.html) via supabase.functions.invoke('send-email', {body: {...}})
//   - Server-side (thanks.html fetch with anon key)
//
// Uses Resend API. Currently sends from `onboarding@resend.dev` (Resend test
// domain — always works without DNS verification). Reply-to is `info@abol.ai`
// so buyer replies land in Sam's STRATO inbox.
//
// To switch to real abol.ai sender: verify abol.ai in Resend (3 DNS records),
// then change FROM_ADDRESS below to `ABOL.ai <info@abol.ai>`.
//
// Resend API key is a function secret:
//   supabase secrets set RESEND_API_KEY=re_...
//
// Deploy:
//   supabase functions deploy send-email --project-ref cnoudltgcxeyzfelvbuv

// @ts-ignore — Deno global
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://cnoudltgcxeyzfelvbuv.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FROM_ADDRESS = "ABOL.ai <onboarding@resend.dev>";
const REPLY_TO = "info@abol.ai";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Look up a buyer's email + score + rating from abol_assessments using the
// service role (bypasses RLS). Used by the paid_report branch when the
// caller (thanks.html) only has the assessment UUID, not the email.
async function lookupAssessment(assessmentId: string) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null;
  const url = `${SUPABASE_URL}/rest/v1/abol_assessments?id=eq.${encodeURIComponent(assessmentId)}&select=email,overall_percentage,overall_rating,sector`;
  const resp = await fetch(url, {
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) {
    console.warn("lookup_assessment_failed", { status: resp.status, assessmentId });
    return null;
  }
  const rows = await resp.json();
  return rows && rows[0] ? rows[0] : null;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- Templates ----------

function whitepaperTemplate(): { subject: string; html: string; text: string } {
  return {
    subject: "You're on the list — ABOL.ai State of EU Cyber 2026",
    text: `Thanks for signing up.

You're on the list for the 2026 AI and Quantum Threat Outlook. We'll send it
the moment the data backs every number. Until then, if you want your own
numbers today, the 9-minute scan at abol.ai produces a personalized benchmark
against Thales 2026, IBM 2024, ENISA 2025, and Verizon DBIR 2025.

Reply to this email if you have questions.

ABOL.ai
https://abol.ai
`,
    html: cardTemplate({
      kicker: "ABOL.ai · waitlist confirmed",
      heading: "You're on the list.",
      body: `<p style="margin:0 0 12px;">Thanks for signing up for the 2026 AI and Quantum Threat Outlook.</p>
<p style="margin:0 0 12px;">We'll send it the moment the data backs every number. Our bar: every claim in the report is traceable to a public source or a large-enough proprietary cohort. That bar takes time to clear.</p>
<p style="margin:0;">Want your own numbers today? The 9-minute scan at <a href="https://abol.ai" style="color:#E8650A;">abol.ai</a> produces a personalized benchmark in real time — same 4 sources, applied to your organization.</p>`,
      cta: { label: "Run the 9-min scan", href: "https://abol.ai" },
    }),
  };
}

function scanResultTemplate(data: {
  score: number;
  rating: string;
  assessment_id: string;
  sector: string;
}): { subject: string; html: string; text: string } {
  const short = data.assessment_id.slice(0, 8);
  return {
    subject: `Your ABOL.ai score: ${data.score.toFixed(1)}/100 — ${data.rating}`,
    text: `Your ABOL.ai benchmark score

Overall:  ${data.score.toFixed(1)}/100
Rating:   ${data.rating}
Sector:   ${data.sector}
Ref:      ${short}

Your scan is saved. You can return to https://abol.ai any time — your score
stays linked to the email above.

Want the full 43-page report? It ranks your 10 biggest gaps by euro exposure,
shows your dimension-level position against the peer median and top quartile,
and delivers a 3-year investment roadmap.

Unlock for EUR 425:
https://buy.stripe.com/test_fZueV7cRBau221QdYi00001?client_reference_id=${data.assessment_id}

Reply to this email if you have questions.

ABOL.ai
https://abol.ai
`,
    html: cardTemplate({
      kicker: `ABOL.ai · scan complete · ref ${short}`,
      heading: `Your score: ${data.score.toFixed(1)}/100`,
      rating: data.rating,
      score: data.score,
      body: `<p style="margin:0 0 12px;">Your scan is saved. The full 43-page report ranks your 10 biggest gaps by euro exposure, shows your position against the peer median + top-quartile threshold for every pillar, and gives you a 3-year investment roadmap.</p>
<p style="margin:0;">It's what most IT directors take into the board meeting.</p>`,
      cta: {
        label: "Unlock the full report — €425",
        href: `https://buy.stripe.com/test_fZueV7cRBau221QdYi00001?client_reference_id=${data.assessment_id}`,
      },
    }),
  };
}

function paidReportTemplate(data: {
  assessment_id: string;
  score?: number;
  rating?: string;
}): { subject: string; html: string; text: string } {
  const short = data.assessment_id.slice(0, 8);
  return {
    subject: `Thanks for your purchase — report incoming (ref ${short})`,
    text: `Thanks for your purchase.

We're compiling your 43-page ABOL.ai benchmark report now. It arrives by
email within the next hour during CET business hours, with the PDF attached.

Reference: ${short}

If it hasn't arrived within 2 hours, reply to this email with your reference
number and we'll resend immediately.

ABOL.ai
https://abol.ai
`,
    html: cardTemplate({
      kicker: `ABOL.ai · purchase confirmed · ref ${short}`,
      heading: "Report on its way.",
      body: `<p style="margin:0 0 12px;">We're compiling your 43-page benchmark report now. It arrives by email within the next hour during CET business hours, with the PDF attached.</p>
<p style="margin:0 0 12px;"><strong>Reference:</strong> <span style="font-family:'JetBrains Mono',Menlo,monospace;">${short}</span></p>
<p style="margin:0;">If it hasn't arrived within 2 hours, reply to this email with your reference and we'll resend immediately.</p>`,
    }),
  };
}

function cardTemplate(opts: {
  kicker: string;
  heading: string;
  body: string;
  score?: number;
  rating?: string;
  cta?: { label: string; href: string };
}): string {
  const scoreBlock = opts.score != null
    ? `<tr><td style="padding:20px 32px 8px;">
         <div style="padding:20px;background:#FDF5E6;border-left:3px solid #E8650A;">
           <div style="font-size:11px;letter-spacing:0.5px;color:#8A7D6A;text-transform:uppercase;margin-bottom:6px;font-family:'JetBrains Mono',Menlo,monospace;">Your score</div>
           <div style="font-size:36px;font-weight:700;color:#14110F;font-family:'JetBrains Mono',Menlo,monospace;letter-spacing:-1px;line-height:1;">${opts.score.toFixed(1)}<span style="font-size:20px;color:#8A7D6A;font-weight:500;">/100</span></div>
           ${opts.rating ? `<div style="font-size:13px;color:#4A3E30;margin-top:8px;">${opts.rating}</div>` : ""}
         </div>
       </td></tr>`
    : "";

  const ctaBlock = opts.cta
    ? `<tr><td style="padding:8px 32px 24px;">
         <a href="${opts.cta.href}" style="display:inline-block;padding:14px 28px;background:#E8650A;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;border-radius:2px;">${opts.cta.label}</a>
       </td></tr>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF6EF;font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;color:#14110F;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6EF;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E5DCC8;">
        <tr><td style="padding:32px 32px 0;">
          <div style="font-family:'JetBrains Mono',Menlo,monospace;font-size:11px;letter-spacing:0.5px;color:#8A7D6A;text-transform:uppercase;">${opts.kicker}</div>
          <h1 style="font-size:22px;font-weight:700;color:#14110F;margin:12px 0 6px;letter-spacing:-0.3px;">${opts.heading}</h1>
        </td></tr>
        ${scoreBlock}
        <tr><td style="padding:16px 32px 24px;font-size:13px;color:#4A3E30;line-height:1.6;">${opts.body}</td></tr>
        ${ctaBlock}
        <tr><td style="padding:20px 32px;border-top:1px solid #E5DCC8;font-size:11px;color:#8A7D6A;font-family:'JetBrains Mono',Menlo,monospace;">
          ABOL.ai · <a href="https://abol.ai" style="color:#8A7D6A;text-decoration:underline;">abol.ai</a> · info@abol.ai
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ---------- Handler ----------

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  let { type, to, data } = body ?? {};
  if (!type) {
    return json({ error: "type is required" }, 400);
  }

  // Special handling for paid_report: caller may pass just assessment_id
  // (from Stripe success_url client_reference_id). Look up email via
  // service role.
  if (type === "paid_report" && !to && data?.assessment_id) {
    const row = await lookupAssessment(data.assessment_id);
    if (!row || !row.email) {
      return json({ error: "assessment not found or no email on record" }, 404);
    }
    to = row.email;
    data = {
      ...data,
      score: data.score ?? row.overall_percentage,
      rating: data.rating ?? row.overall_rating,
    };
  }

  if (!to) {
    return json({ error: "to is required (or assessment_id for paid_report)" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json({ error: "invalid to address" }, 400);
  }

  let tpl: { subject: string; html: string; text: string };
  try {
    if (type === "whitepaper") tpl = whitepaperTemplate();
    else if (type === "scan_result") tpl = scanResultTemplate(data ?? {});
    else if (type === "paid_report") tpl = paidReportTemplate(data ?? {});
    else return json({ error: `unknown type: ${type}` }, 400);
  } catch (e) {
    return json({ error: `template error: ${e}` }, 500);
  }

  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping send");
    return json({ skipped: true, reason: "RESEND_API_KEY not set" }, 200);
  }

  const resp = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      reply_to: REPLY_TO,
      to: [to],
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [{ name: "type", value: type.slice(0, 50) }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("resend_error", { status: resp.status, body: errText.slice(0, 500), type });
    return json({ error: "send failed", status: resp.status, detail: errText.slice(0, 300) }, 502);
  }

  const j = await resp.json();
  console.log("resend_ok", { type, to, id: j.id });
  return json({ sent: true, id: j.id, type }, 200);
});

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
