import { notFound } from "next/navigation";
import Link from "next/link";
import { decodeAuditToken } from "@/lib/audit-token";
import { scanSite } from "@/lib/scan";
import type { AuditResult } from "@/lib/audit-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: { token: string };
}

function verdictLine(audit: AuditResult): string {
  if (!audit.findings) return `Could not produce an audit for ${audit.finalUrl}.`;
  const platform = audit.platform.platform;
  const version = audit.platform.version ? ` ${audit.platform.version}` : "";
  if (audit.findings.platformEol) {
    return `${platform}${version}. End-of-Life since June 2020. Three other critical issues stacked on top.`;
  }
  if (audit.scoreBand === "critical") {
    return `${platform}${version}. Critical risk score (${audit.outdatedScore}/10). The store is leaking conversions in three specific places.`;
  }
  if (audit.scoreBand === "outdated") {
    return `${platform}${version}. Outdated (${audit.outdatedScore}/10). Two structural fixes would make a measurable difference.`;
  }
  if (audit.scoreBand === "ageing") {
    return `${platform}${version}. Ageing (${audit.outdatedScore}/10). Not urgent. Worth fixing before the next platform major.`;
  }
  return `${platform}${version}. Modern stack (${audit.outdatedScore}/10). The fundamentals are in place.`;
}

function findingDetail(audit: AuditResult, key: string): { label: string; evidence: string } | null {
  if (!audit.findings || !audit.site || !audit.performance) return null;
  switch (key) {
    case "eol":
      if (!audit.findings.platformEol) return null;
      return {
        label: "Platform reached End-of-Life — no security updates from Adobe.",
        evidence: `Detection signals: ${audit.platform.signals.join("; ")}. See Adobe's official EOL announcement (June 2020).`,
      };
    case "outdated":
      if (audit.findings.platformEol || !audit.findings.platformOutdated) return null;
      return {
        label: "Platform version is several majors behind current.",
        evidence: `Detected: ${audit.platform.platform}${audit.platform.version ? ` ${audit.platform.version}` : ""}.`,
      };
    case "https":
      if (!audit.findings.missingHttps) return null;
      return {
        label: "Checkout is not secured with HTTPS.",
        evidence: `Final URL after redirects: ${audit.finalUrl}. Browsers warn shoppers and Google deranks the page.`,
      };
    case "viewport":
      if (!audit.findings.missingMobileViewport) return null;
      return {
        label: "Mobile rendering is broken.",
        evidence: `No <meta name="viewport"> tag found in the homepage <head>. Phones render desktop-width layouts.`,
      };
    case "schema":
      if (!audit.findings.missingStructuredData) return null;
      return {
        label: "Invisible to ChatGPT, Perplexity, and Google AI Overviews.",
        evidence: `No JSON-LD Organization/Store schema found. AI search engines cannot identify the store name, address, or product catalogue.`,
      };
    case "legacyJs":
      if (!audit.findings.legacyJsLibraries) return null;
      return {
        label: "Loads legacy JavaScript libraries.",
        evidence: `Detected: ${audit.performance.estimatedHeavyAssets.slice(0, 2).join(", ")}. Last meaningful update was over a decade ago.`,
      };
    case "bloat":
      if (!audit.findings.bloatedHtml) return null;
      return {
        label: "HTML payload is unusually large.",
        evidence: `Homepage HTML is ${(audit.performance.htmlBytes / 1024).toFixed(0)}KB before scripts and images. Slow first paint on mobile.`,
      };
    default:
      return null;
  }
}

export default async function AuditResultPage({ params }: PageProps) {
  const { token } = params;
  const url = decodeAuditToken(token);
  if (!url) notFound();

  let audit: AuditResult;
  try {
    audit = await scanSite(url);
  } catch (err) {
    audit = {
      scannedAt: new Date().toISOString(),
      url,
      finalUrl: url,
      status: "fetch-failed",
      errorMessage: err instanceof Error ? err.message : "scan-error",
      platform: { platform: "unknown", version: null, confidence: 0, signals: [] },
      site: null,
      performance: null,
      company: null,
      findings: null,
      outdatedScore: 0,
      scoreBand: "modern",
      topReasons: [],
    };
  }

  if (audit.status === "blocked" || audit.status === "fetch-failed") {
    return <ErrorView audit={audit} />;
  }

  const findingKeys = ["eol", "outdated", "https", "viewport", "schema", "legacyJs", "bloat"];
  const findings = findingKeys
    .map((k) => findingDetail(audit, k))
    .filter((f): f is { label: string; evidence: string } => f !== null)
    .slice(0, 3);

  const company = audit.company?.name || new URL(audit.finalUrl).hostname;

  return (
    <main className="min-h-screen bg-[#faf8f5] text-[#1a1a1a]">
      <header className="max-w-5xl mx-auto px-6 pt-6 pb-12 flex items-center justify-between">
        <Link href="/" className="font-serif text-2xl tracking-tight font-medium hover:text-[#8a4a1a] transition-colors">
          pipeloop
        </Link>
        <a href="mailto:sam@pipeloop.ai" className="text-sm text-[#5a5a5a] hover:text-[#1a1a1a] transition-colors">
          sam@pipeloop.ai
        </a>
      </header>

      <section className="max-w-3xl mx-auto px-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8a4a1a] mb-3">
          Diagnostic report · {new Date(audit.scannedAt).toISOString().slice(0, 10)}
        </p>
        <h1 className="font-serif text-2xl sm:text-3xl tracking-tight mb-2">{company}</h1>
        <a href={audit.finalUrl} target="_blank" rel="noopener" className="font-mono text-sm text-[#8a8580] hover:text-[#1a1a1a] transition-colors break-all">
          {audit.finalUrl}
        </a>

        <div className="mt-10 mb-10 border-l-2 border-[#8a4a1a] pl-4 py-2">
          <p className="font-serif text-2xl leading-tight text-[#1a1a1a]">{verdictLine(audit)}</p>
        </div>

        {findings.length > 0 ? (
          <section className="mb-12">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8a4a1a] mb-6">
              Top {findings.length} findings
            </p>
            <ol className="space-y-6">
              {findings.map((f, i) => (
                <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-3">
                  <div className="font-mono text-2xl text-[#8a8580] leading-none pt-1">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <p className="font-serif text-lg leading-snug mb-2">{f.label}</p>
                    <p className="font-mono text-xs text-[#5a5a5a] leading-relaxed">{f.evidence}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <section className="mb-12 border border-[#1a1a1a]/10 p-6 bg-white">
            <p className="font-serif text-lg">We didn&apos;t find critical issues on the homepage.</p>
            <p className="font-mono text-xs text-[#5a5a5a] mt-2">
              That&apos;s good. The audit only reads the homepage. If you want us to look at checkout, product pages, or admin performance, email sam@pipeloop.ai.
            </p>
          </section>
        )}
      </section>

      <hr className="max-w-5xl mx-auto my-12 border-[#1a1a1a]/10" />

      <section className="max-w-3xl mx-auto px-6 mb-16">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8a4a1a] mb-6">
          What we&apos;d do
        </p>
        <h2 className="font-serif text-3xl leading-tight tracking-tight mb-6">
          Rebuild the store on a current stack. Fixed price. 14 days. Refund if we miss the date.
        </h2>
        <p className="text-base text-[#3a3a3a] leading-relaxed mb-8 max-w-2xl">
          Migration done, conversion basics fixed, modern checkout, mobile-first, structured data so you appear in AI search. One price. One deadline. One clean handover.
        </p>

        <div className="border border-[#1a1a1a]/20 p-6 bg-white mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 font-mono text-sm">
            <div>
              <div className="text-[#8a8580] text-xs uppercase tracking-wider mb-1">Price</div>
              <div className="font-serif text-2xl">$7,500</div>
            </div>
            <div>
              <div className="text-[#8a8580] text-xs uppercase tracking-wider mb-1">Timeline</div>
              <div className="font-serif text-2xl">14 days</div>
            </div>
            <div>
              <div className="text-[#8a8580] text-xs uppercase tracking-wider mb-1">Guarantee</div>
              <div className="font-serif text-2xl">Full refund</div>
            </div>
          </div>
        </div>

        <a
          href={`mailto:sam@pipeloop.ai?subject=${encodeURIComponent(`Rebuild for ${company}`)}&body=${encodeURIComponent(`Hi Sam,\n\nI saw the audit at https://pipeloop.ai/r/${token} and would like to talk about rebuilding ${company}.\n\nMy availability:\n\nThanks.`)}`}
          className="inline-block px-6 py-3 bg-[#1a1a1a] text-[#faf8f5] font-medium hover:bg-[#8a4a1a] transition-colors"
        >
          Reply to book a 15-minute call →
        </a>
        <p className="font-mono text-xs text-[#8a8580] mt-3">
          You email me. I email back within one business day. No calendar widget, no auto-responder.
        </p>
      </section>

      <hr className="max-w-5xl mx-auto my-12 border-[#1a1a1a]/10" />

      <section className="max-w-3xl mx-auto px-6 mb-24">
        <details className="group">
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-[0.18em] text-[#8a4a1a] mb-6 list-none flex items-center gap-2">
            <span className="group-open:rotate-90 inline-block transition-transform">▸</span>
            Methodology + raw scan output
          </summary>
          <div className="mt-6 space-y-4 font-mono text-xs text-[#3a3a3a] leading-relaxed">
            <p>
              <strong>Platform detection:</strong> {audit.platform.platform}
              {audit.platform.version ? ` (${audit.platform.version})` : ""}, confidence {(audit.platform.confidence * 100).toFixed(0)}%.
            </p>
            <p>
              <strong>Signals:</strong> {audit.platform.signals.join("; ") || "none"}
            </p>
            <p>
              <strong>Site metadata:</strong> SSL: {audit.site?.ssl ? "yes" : "no"}; viewport meta: {audit.site?.hasViewport ? "yes" : "no"}; JSON-LD schema: {audit.site?.hasOrganizationSchema ? "yes" : "no"}; lang: {audit.site?.language ?? "—"}
            </p>
            <p>
              <strong>Performance proxy:</strong> HTML {(audit.performance?.htmlBytes ?? 0).toLocaleString()} bytes; external scripts: {audit.performance?.externalScriptCount ?? 0}; legacy JS: {audit.performance?.hasOldJqueryOrPrototype ? "yes" : "no"}
            </p>
            <p>
              <strong>Score breakdown:</strong> {audit.outdatedScore}/10 ({audit.scoreBand}). Top reasons: {audit.topReasons.join("; ") || "none"}.
            </p>
          </div>
        </details>
      </section>

      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-[#1a1a1a]/10 font-mono text-xs text-[#8a8580]">
        Pipeloop diagnostic generated on {new Date(audit.scannedAt).toUTCString()}. We only fetch the homepage, never the admin or backend.
      </footer>
    </main>
  );
}

function ErrorView({ audit }: { audit: AuditResult }) {
  const blocked = audit.status === "blocked";
  return (
    <main className="min-h-screen bg-[#faf8f5] text-[#1a1a1a]">
      <header className="max-w-5xl mx-auto px-6 pt-6 pb-12 flex items-center justify-between">
        <Link href="/" className="font-serif text-2xl tracking-tight font-medium hover:text-[#8a4a1a] transition-colors">
          pipeloop
        </Link>
        <a href="mailto:sam@pipeloop.ai" className="text-sm text-[#5a5a5a] hover:text-[#1a1a1a] transition-colors">
          sam@pipeloop.ai
        </a>
      </header>
      <section className="max-w-3xl mx-auto px-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8a4a1a] mb-3">Scan halted</p>
        <h1 className="font-serif text-3xl leading-tight tracking-tight mb-4">
          {blocked ? "Your site blocks automated requests." : "We could not reach this site."}
        </h1>
        <p className="text-base text-[#3a3a3a] leading-relaxed mb-6 max-w-2xl">
          {blocked ? (
            <>That&apos;s actually a good sign. Most well-run stores filter bots. The downside is that we cannot generate the automated audit. Email me and I&apos;ll do it manually.</>
          ) : (
            <>Reason: <span className="font-mono text-sm">{audit.errorMessage}</span>. This usually means the URL is wrong, the site is down, or it sits behind a private network.</>
          )}
        </p>
        <a
          href={`mailto:sam@pipeloop.ai?subject=${encodeURIComponent("Manual audit request")}&body=${encodeURIComponent(`Hi Sam,\n\nThe automated scan could not run on ${audit.url}. Please do it manually.\n\nThanks.`)}`}
          className="inline-block px-6 py-3 bg-[#1a1a1a] text-[#faf8f5] font-medium hover:bg-[#8a4a1a] transition-colors"
        >
          Email Sam for a manual audit →
        </a>
      </section>
    </main>
  );
}
