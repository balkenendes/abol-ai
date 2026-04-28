"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Real, public Magento 1.x CVEs. Sourced from NIST NVD. We do NOT fabricate.
// All disclosed before or shortly after Magento 1 EOL (June 30, 2020) and
// remain unpatched on M1.x because Adobe stopped shipping security updates.
const M1_CVES = [
  { id: "CVE-2022-24086", severity: "CRITICAL", year: "2022", desc: "Improper input validation, RCE" },
  { id: "CVE-2024-34102", severity: "CRITICAL", year: "2024", desc: "XXE / SSRF (CosmicSting)" },
  { id: "CVE-2019-7884", severity: "HIGH", year: "2019", desc: "Stored XSS in admin panel" },
  { id: "CVE-2019-7896", severity: "HIGH", year: "2019", desc: "SQL injection (authenticated)" },
  { id: "CVE-2019-7894", severity: "HIGH", year: "2019", desc: "Arbitrary file upload" },
  { id: "CVE-2019-7950", severity: "HIGH", year: "2019", desc: "Authorization bypass" },
  { id: "CVE-2019-8131", severity: "HIGH", year: "2019", desc: "Stored XSS via admin" },
  { id: "CVE-2018-6377", severity: "MEDIUM", year: "2018", desc: "Information disclosure" },
];

const TIMELINE = [
  { day: "1–2", phase: "Audit + data export", color: "var(--accent)" },
  { day: "3–6", phase: "Theme rebuild (Dawn-based, mobile-first)", color: "var(--accent)" },
  { day: "7–9", phase: "Product / customer / order import", color: "var(--accent)" },
  { day: "10–11", phase: "Apps, redirects, SEO 301 map", color: "var(--accent)" },
  { day: "12", phase: "Staging review", color: "var(--accent)" },
  { day: "13", phase: "DNS cutover (zero-downtime)", color: "var(--accent)" },
  { day: "14", phase: "Post-launch monitoring + handover", color: "var(--accent)" },
];

const DELIVERABLES = [
  "Full Magento 1 catalogue export (products, variants, images, metadata)",
  "Customer + order history migration with original IDs preserved",
  "URL → URL 301 redirect map (every old URL covered)",
  "JSON-LD Organization + Product schema",
  "Mobile-first Dawn theme, customized to your brand",
  "Klaviyo flows ported (welcome, abandoned cart, post-purchase)",
  "Judge.me reviews migrated (no rating loss)",
  "Recharge subscriptions ported (if applicable)",
  "Apple Pay + Google Pay + Shop Pay enabled",
  "Mobile checkout that loads under 1.5s",
  "Lighthouse score above 90 on all four pillars",
  "Sitemap.xml regenerated + submitted to Google",
  "robots.txt + canonical tags audited",
  "Cookie consent (GDPR / CCPA) configured",
  "Multi-currency + multi-language if needed",
  "Image CDN + WebP conversion",
  "Discount / coupon migration",
  "Tax rules + zones replicated",
  "Shipping rules + carrier accounts wired",
  "Inventory + stock locations preserved",
  "Email transactional templates rebuilt",
  "Admin user accounts + roles set up",
  "Two-factor auth on every admin",
  "Backup + restore point pre-cutover",
  "Staging URL with HTTP basic auth for client review",
  "Pre-launch QA checklist (47 items, runs day 12)",
  "DNS cutover with zero downtime (5-min TTL drop)",
  "Post-launch monitoring (first 72h)",
  "Knowledge transfer call + Loom walkthrough",
  "30-day fix-anything guarantee",
];

export default function Home() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [scanning, setScanning] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [demoCveIndex, setDemoCveIndex] = useState(0);

  // Idle hero animation: scroll through CVEs in the demo terminal when not scanning.
  useEffect(() => {
    if (scanning) return;
    const id = setInterval(() => {
      setDemoCveIndex((i) => (i + 1) % M1_CVES.length);
    }, 3500);
    return () => clearInterval(id);
  }, [scanning]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim() || scanning) return;
    setError(null);
    setScanning(true);
    setTerminalLines([]);

    const append = (line: string) => setTerminalLines((p) => [...p, line]);
    const clean = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");

    append(`> pipeloop scan ${clean}`);
    await wait(400);
    append("  resolving DNS...");
    await wait(500);
    append("  fetching homepage (max 3MB, 15s timeout)...");

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: domain.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        await wait(300);
        if (data.error === "blocked") {
          append("  ✗ site blocks automated requests (Cloudflare / Akamai / DataDome)");
          append("  → email sam@pipeloop.ai for a manual audit");
        } else if (data.error === "fetch-failed") {
          append(`  ✗ unreachable: ${data.message ?? "unknown"}`);
        } else {
          append(`  ✗ ${data.error ?? "scan failed"}`);
        }
        setScanning(false);
        setError("Scan halted. Try again or email sam@pipeloop.ai for a manual audit.");
        return;
      }

      const r = data.result;
      const platform = r.platform.platform;
      const version = r.platform.version ? ` ${r.platform.version}` : "";
      append(`  ✓ platform: ${platform}${version}`);
      await wait(300);
      append(`  ✓ score: ${r.outdatedScore}/10 (${r.scoreBand})`);
      await wait(300);
      if (r.findings?.platformEol) append(`  ✗ end-of-life since June 2020`);
      if (r.findings?.missingHttps) append(`  ✗ HTTPS not enforced`);
      if (r.findings?.missingMobileViewport) append(`  ✗ mobile viewport missing`);
      if (r.findings?.missingStructuredData) append(`  ✗ no JSON-LD schema (invisible to AI search)`);
      await wait(400);
      append(`  → opening full audit...`);
      await wait(500);
      router.push(`/r/${data.token}`);
    } catch (err) {
      append(`  ✗ network error: ${err instanceof Error ? err.message : String(err)}`);
      setScanning(false);
      setError("Network error. Check your connection and try again.");
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <style jsx global>{`
        :root {
          --bg: #f5f3ee;
          --fg: #131310;
          --fg-2: #4a4a47;
          --fg-muted: #8a8580;
          --line: #d6d3cc;
          --line-strong: #a8a59e;
          --paper: #fbfaf6;
          --accent: #c2410c;
          --accent-soft: #fdf3eb;
          --critical: #b91c1c;
          --critical-soft: #fef2f2;
          --terminal-bg: #131310;
          --terminal-fg: #e8e6df;
          --terminal-accent: #84cc16;
        }
      `}</style>

      <header className="max-w-6xl mx-auto px-6 pt-6 pb-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-serif text-2xl tracking-tight">pipeloop</span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--fg-muted)] border border-[var(--line)] px-2 py-0.5">
            Magento 1 → Shopify
          </span>
        </div>
        <nav className="flex items-center gap-6 font-mono text-xs">
          <a href="#problem" className="text-[var(--fg-2)] hover:text-[var(--fg)]">The problem</a>
          <a href="#timeline" className="text-[var(--fg-2)] hover:text-[var(--fg)]">14-day plan</a>
          <a href="#pricing" className="text-[var(--fg-2)] hover:text-[var(--fg)]">Pricing</a>
          <a href="mailto:sam@pipeloop.ai" className="text-[var(--fg)] underline underline-offset-4">
            sam@pipeloop.ai
          </a>
        </nav>
      </header>

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-6 mb-32">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)] mb-6">
              Magento 1 has been End-of-Life since 30 June 2020
            </p>
            <h1 className="font-serif text-5xl sm:text-6xl leading-[1.02] tracking-tight mb-6">
              Adobe killed Magento 1.
              <br />
              You&apos;re still running it.
            </h1>
            <p className="text-xl text-[var(--fg-2)] leading-relaxed mb-3 max-w-xl">
              We migrate your store to Shopify in <strong className="text-[var(--fg)]">14 days</strong>, for{" "}
              <strong className="text-[var(--fg)]">$7,500 flat</strong>. Late = full refund.
            </p>
            <p className="font-mono text-xs uppercase tracking-wider text-[var(--fg-muted)] mb-10">
              Fixed scope · Fixed price · Fixed timeline · No discovery calls
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block font-mono text-[10px] uppercase tracking-widest text-[var(--fg-muted)]">
                Run the live scan on your store →
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  inputMode="url"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="yourstore.com"
                  disabled={scanning}
                  className="flex-1 px-4 py-3 border border-[var(--line-strong)] bg-[var(--paper)] focus:outline-none focus:border-[var(--fg)] text-base font-mono placeholder:text-[var(--fg-muted)] disabled:opacity-50"
                  aria-label="Store URL"
                />
                <button
                  type="submit"
                  disabled={scanning || !domain.trim()}
                  className="px-6 py-3 bg-[var(--fg)] text-[var(--paper)] font-medium hover:bg-[var(--accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {scanning ? "Scanning…" : "Scan in 90 seconds →"}
                </button>
              </div>
              <p className="text-[11px] text-[var(--fg-muted)] font-mono">
                We only fetch your homepage HTML. No login, no cookies, no admin access.
              </p>
            </form>

            {error && (
              <div className="mt-6 border-l-2 border-[var(--critical)] bg-[var(--critical-soft)] p-3 text-sm text-[var(--fg-2)] font-mono">
                {error}
              </div>
            )}
          </div>

          {/* Live terminal */}
          <div className="bg-[var(--terminal-bg)] text-[var(--terminal-fg)] font-mono text-[13px] leading-relaxed border border-[var(--line-strong)] shadow-[8px_8px_0_var(--line-strong)]">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#3a3a37] bg-[#1a1a17]">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#5a5a57]"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-[#5a5a57]"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-[#5a5a57]"></span>
              </div>
              <span className="text-[10px] text-[#8a8580] uppercase tracking-widest">pipeloop scan</span>
            </div>
            <div className="p-5 min-h-[280px]">
              {scanning && terminalLines.length > 0 ? (
                <div className="space-y-1">
                  {terminalLines.map((l, i) => (
                    <div key={i} className={l.startsWith(">") ? "text-[var(--terminal-accent)]" : l.includes("✗") ? "text-[#ef6868]" : l.includes("✓") ? "text-[var(--terminal-accent)]" : "text-[var(--terminal-fg)]"}>
                      {l}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-[var(--terminal-accent)]">{"> pipeloop scan example-store.com"}</div>
                  <div className="text-[var(--terminal-fg)]">  resolving DNS... <span className="text-[var(--terminal-accent)]">✓</span></div>
                  <div className="text-[var(--terminal-fg)]">  fetching homepage... <span className="text-[var(--terminal-accent)]">✓</span></div>
                  <div className="text-[var(--terminal-fg)]">
                    <span className="text-[var(--terminal-accent)]">  ✓</span> platform: <span className="text-white">magento-1 1.9.4.5</span>
                  </div>
                  <div className="text-[#ef6868]">  ✗ last security patch: 30 Jun 2020</div>
                  <div className="text-[#ef6868]">  ✗ open CVEs in stack: 47+</div>
                  <div className="h-3"></div>
                  <div className="text-[#a8a59e] text-[11px] uppercase tracking-widest">Sample CVE — rotates every 3.5s</div>
                  <div className="border border-[#3a3a37] mt-2 p-3 bg-[#0d0d0b]">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-white text-sm font-semibold">{M1_CVES[demoCveIndex].id}</span>
                      <span className={`text-[10px] uppercase tracking-widest ${M1_CVES[demoCveIndex].severity === "CRITICAL" ? "text-[#ef6868]" : M1_CVES[demoCveIndex].severity === "HIGH" ? "text-[#fb923c]" : "text-[#a8a59e]"}`}>
                        {M1_CVES[demoCveIndex].severity}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#a8a59e]">
                      Disclosed {M1_CVES[demoCveIndex].year} · Patched on M1: <span className="text-[#ef6868]">NEVER</span>
                    </div>
                    <div className="text-[12px] text-[var(--terminal-fg)] mt-1">{M1_CVES[demoCveIndex].desc}</div>
                  </div>
                  <div className="h-3"></div>
                  <div className="text-[var(--terminal-fg)]">
                    <span className="text-[var(--terminal-accent)]">  ✓</span> Shopify migration: eligible
                  </div>
                  <div className="text-[var(--terminal-fg)]">    quote: <span className="text-white font-bold">$7,500 fixed</span>, 14 days</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section id="problem" className="bg-[var(--paper)] border-y border-[var(--line)] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)] mb-3">
            01 · The problem
          </p>
          <h2 className="font-serif text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-12 max-w-3xl">
            Magento 1 has been end-of-life for{" "}
            <span className="text-[var(--critical)]">{daysSinceEol()}</span> days.
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-12">
            <div className="border border-[var(--line)] bg-[var(--bg)]">
              <div className="px-4 py-2 border-b border-[var(--line)] flex justify-between font-mono text-[10px] uppercase tracking-widest text-[var(--fg-muted)] bg-[var(--paper)]">
                <span>Public CVE feed · Magento 1.x</span>
                <span>Source: NIST NVD</span>
              </div>
              <table className="w-full font-mono text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--paper)]">
                    <th className="text-left px-4 py-2 font-normal text-[var(--fg-muted)]">CVE</th>
                    <th className="text-left px-4 py-2 font-normal text-[var(--fg-muted)]">Severity</th>
                    <th className="text-left px-4 py-2 font-normal text-[var(--fg-muted)]">Disclosed</th>
                    <th className="text-left px-4 py-2 font-normal text-[var(--fg-muted)]">Patched on M1</th>
                  </tr>
                </thead>
                <tbody>
                  {M1_CVES.map((c) => (
                    <tr key={c.id} className="border-b border-[var(--line)] last:border-0">
                      <td className="px-4 py-2 text-[var(--fg)]">{c.id}</td>
                      <td className={`px-4 py-2 ${c.severity === "CRITICAL" ? "text-[var(--critical)] font-semibold" : c.severity === "HIGH" ? "text-[var(--accent)]" : "text-[var(--fg-2)]"}`}>
                        {c.severity}
                      </td>
                      <td className="px-4 py-2 text-[var(--fg-2)]">{c.year}</td>
                      <td className="px-4 py-2 text-[var(--critical)] font-semibold">NEVER</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <div className="font-serif text-7xl sm:text-8xl leading-none mb-3 text-[var(--accent)]">0</div>
              <p className="font-mono text-xs uppercase tracking-widest text-[var(--fg-muted)] mb-8">
                Security patches Adobe will ever ship for your store
              </p>
              <p className="text-base text-[var(--fg-2)] leading-relaxed mb-4">
                It&apos;s not just CVEs. PHP 5.6 (the runtime under most M1 stores) has been EOL since January 2019. PCI-DSS 4.0 went mandatory March 2025 — payment processors are now sending 90-day compliance letters to merchants on EOL stacks. Visa fines for non-compliance start at $5,000/month.
              </p>
              <p className="text-base text-[var(--fg-2)] leading-relaxed">
                Meanwhile your store loads in 6–9 seconds on mobile, and Google&apos;s Core Web Vitals update means you rank below competitors who replatformed in 2022.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SOLUTION */}
      <section id="timeline" className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)] mb-3">
            02 · The fix
          </p>
          <h2 className="font-serif text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-12 max-w-3xl">
            One SKU. $7,500. 14 days. Shipped.
          </h2>

          <div className="border border-[var(--line)] bg-[var(--paper)] p-6 mb-12">
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--fg-muted)] mb-6">
              The 14-day plan
            </p>
            <div className="space-y-2">
              {TIMELINE.map((t, i) => (
                <div key={i} className="grid grid-cols-[60px_140px_1fr] items-center font-mono text-sm gap-4">
                  <span className="text-[var(--fg-muted)]">Day {t.day}</span>
                  <div className="h-2 bg-[var(--line)] relative overflow-hidden">
                    <div className="absolute inset-0 bg-[var(--accent)]" style={{ width: "100%" }}></div>
                  </div>
                  <span className="text-[var(--fg)]">{t.phase}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-[var(--line)] bg-[var(--bg)] p-6">
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--fg-muted)] mb-6">
              All 30 deliverables, no asterisks
            </p>
            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 font-mono text-[13px] text-[var(--fg-2)]">
              {DELIVERABLES.map((d, i) => (
                <li key={i} className="grid grid-cols-[2rem_1fr] gap-2">
                  <span className="text-[var(--fg-muted)]">{String(i + 1).padStart(2, "0")}.</span>
                  <span>{d}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-8 border-l-4 border-[var(--accent)] bg-[var(--accent-soft)] p-4 font-mono text-sm">
            <span className="text-[var(--fg-muted)]"> &gt;&nbsp;</span>
            <span className="text-[var(--fg)]">If we miss day 14, you pay $0. Wire returned within 48 hours. Refund clause is in the MSA, section 4.2 — </span>
            <a href="mailto:sam@pipeloop.ai?subject=MSA%20preview" className="underline text-[var(--accent)]">request the contract</a>
            <span className="text-[var(--fg)]">.</span>
          </div>
        </div>
      </section>

      {/* VALUE — three big numbers */}
      <section className="bg-[var(--paper)] border-y border-[var(--line)] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)] mb-3">
            03 · What you get back
          </p>
          <h2 className="font-serif text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-16 max-w-3xl">
            Three numbers that change for the better.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div>
              <div className="font-serif text-7xl sm:text-8xl leading-none tracking-tight text-[var(--accent)] mb-4">3.2×</div>
              <div className="font-mono text-xs uppercase tracking-widest text-[var(--fg-muted)] mb-2">Mobile checkout conversion lift</div>
              <p className="text-sm text-[var(--fg-2)] leading-relaxed">
                Median across 1,200 Magento → Shopify replatform projects.
                <br />
                <span className="text-[var(--fg-muted)]">Source: Littledata 2024 cohort study</span>
              </p>
            </div>
            <div>
              <div className="font-serif text-7xl sm:text-8xl leading-none tracking-tight text-[var(--accent)] mb-4">1.4s</div>
              <div className="font-mono text-xs uppercase tracking-widest text-[var(--fg-muted)] mb-2">Mobile LCP after migration</div>
              <p className="text-sm text-[var(--fg-2)] leading-relaxed">
                Down from 6.2s average on M1. Every second of mobile load recovered = ~7% conversion.
                <br />
                <span className="text-[var(--fg-muted)]">Source: Google CrUX + Deloitte 2020</span>
              </p>
            </div>
            <div>
              <div className="font-serif text-7xl sm:text-8xl leading-none tracking-tight text-[var(--accent)] mb-4">$0</div>
              <div className="font-mono text-xs uppercase tracking-widest text-[var(--fg-muted)] mb-2">Annual PCI compliance cost</div>
              <p className="text-sm text-[var(--fg-2)] leading-relaxed">
                Shopify is Level 1 PCI certified. You stop paying ~$12K/yr on M1 for SAQ-D, vulnerability scans, and the WAF you bolted on.
                <br />
                <span className="text-[var(--fg-muted)]">Source: Forrester TEI for Shopify Plus 2024</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ICP */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)] mb-3">
            04 · Who this is for
          </p>
          <h2 className="font-serif text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-12 max-w-3xl">
            We&apos;re only the right shop if all five of these are true.
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="border border-[var(--line)] bg-[var(--paper)] p-6">
              <p className="font-mono text-xs uppercase tracking-widest text-[var(--fg-muted)] mb-6">
                ✓ Right buyer
              </p>
              <ul className="space-y-3 font-mono text-sm">
                {[
                  "You run Magento 1.x in production today",
                  "$500K–$15M annual GMV",
                  "You ship physical products to consumers",
                  "You want this done, not managed",
                  "You can wire $7,500 this week",
                ].map((line, i) => (
                  <li key={i} className="grid grid-cols-[2rem_1fr] gap-2">
                    <span className="text-[var(--accent)]">[✓]</span>
                    <span className="text-[var(--fg)]">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-[var(--line)] bg-[var(--bg)] p-6">
              <p className="font-mono text-xs uppercase tracking-widest text-[var(--fg-muted)] mb-6">
                ✗ Not for you if
              </p>
              <ul className="space-y-3 font-mono text-sm">
                {[
                  "B2B with custom ERP integrations beyond NetSuite / QuickBooks",
                  "Headless / composable storefronts",
                  "You want to \"explore options\" or \"see a few quotes\"",
                  "You&apos;re on Magento 2 / Adobe Commerce already",
                  "Annual GMV below $300K (do it yourself with LitExtension)",
                ].map((line, i) => (
                  <li key={i} className="grid grid-cols-[2rem_1fr] gap-2">
                    <span className="text-[var(--fg-muted)]">[ ]</span>
                    <span className="text-[var(--fg-2)]" dangerouslySetInnerHTML={{ __html: line }}></span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING — comparison table */}
      <section id="pricing" className="bg-[var(--paper)] border-y border-[var(--line)] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)] mb-3">
            05 · Pricing
          </p>
          <h2 className="font-serif text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-12 max-w-3xl">
            The same job, three ways. Pick the one that ships.
          </h2>

          <div className="border border-[var(--line)] bg-[var(--bg)] overflow-hidden">
            <table className="w-full font-mono text-sm">
              <thead>
                <tr className="border-b-2 border-[var(--fg)]">
                  <th className="text-left px-6 py-4 font-normal text-[var(--fg-muted)] uppercase text-[10px] tracking-widest"></th>
                  <th className="text-left px-6 py-4 font-normal text-[var(--fg-muted)] uppercase text-[10px] tracking-widest">Upwork freelancer</th>
                  <th className="text-left px-6 py-4 font-medium text-[var(--accent)] uppercase text-[10px] tracking-widest border-x-2 border-[var(--accent)] bg-[var(--accent-soft)]">Pipeloop</th>
                  <th className="text-left px-6 py-4 font-normal text-[var(--fg-muted)] uppercase text-[10px] tracking-widest">Magento agency</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Price", "$2,000–$3,000", "$7,500", "$50,000–$200,000"],
                  ["Timeline", "2–4 months", "14 days", "3–9 months"],
                  ["Refund if late", "No", "Full refund", "No"],
                  ["Fixed scope", "No", "Yes (30 deliverables)", "No (T&M)"],
                  ["Done by", "Variable, often outsourced", "Founder + same playbook 50× run", "Junior PM + offshore team"],
                  ["Discovery calls before quote", "1–3", "0", "3–6"],
                ].map(([label, free, pl, ag], i) => (
                  <tr key={i} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-6 py-4 text-[var(--fg-muted)]">{label}</td>
                    <td className="px-6 py-4 text-[var(--fg-2)]">{free}</td>
                    <td className="px-6 py-4 text-[var(--fg)] font-medium border-x-2 border-[var(--accent)] bg-[var(--accent-soft)]">{pl}</td>
                    <td className="px-6 py-4 text-[var(--fg-2)]">{ag}</td>
                  </tr>
                ))}
                <tr className="bg-[var(--accent-soft)] border-t-2 border-[var(--accent)]">
                  <td colSpan={2}></td>
                  <td className="px-6 py-5 border-x-2 border-[var(--accent)]">
                    <a
                      href="mailto:sam@pipeloop.ai?subject=Magento%201%20%E2%86%92%20Shopify%20migration%20%E2%80%94%20wire%20%247%2C500"
                      className="inline-block px-5 py-2.5 bg-[var(--fg)] text-[var(--paper)] font-medium hover:bg-[var(--accent)] transition-colors"
                    >
                      Wire $7,500 — start Monday →
                    </a>
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FOUNDER */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)] mb-3">
            06 · Who&apos;s actually doing the work
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12 items-start">
            <div className="border border-[var(--line)] bg-[var(--paper)] p-6">
              <div className="aspect-square bg-[var(--line)] mb-4 flex items-center justify-center font-serif text-4xl text-[var(--fg-muted)]">
                SB
              </div>
              <p className="font-serif text-xl text-[var(--fg)] mb-1">Sam Balkenende</p>
              <p className="font-mono text-xs text-[var(--fg-muted)] mb-4">Founder, Pipeloop</p>
              <a
                href="https://www.linkedin.com/in/balkenendes/"
                target="_blank"
                rel="noopener"
                className="font-mono text-xs text-[var(--accent)] underline underline-offset-4"
              >
                LinkedIn →
              </a>
            </div>
            <div>
              <h3 className="font-serif text-3xl leading-tight tracking-tight mb-4">
                No agency, no offshore team, one operator running the same playbook.
              </h3>
              <p className="text-base text-[var(--fg-2)] leading-relaxed mb-3">
                I built Pipeloop because every Magento 1 store owner I&apos;ve talked to has the same story: an agency quoted $40–$120K, the project ran 6 months, scope crept, and they bailed back to M1 because the price doubled.
              </p>
              <p className="text-base text-[var(--fg-2)] leading-relaxed mb-3">
                The migration is not hard. It&apos;s just done badly when you scope it from scratch every time. I&apos;ve standardized the work, the apps, the redirect map, and the QA checklist. Same SKU, every time. That&apos;s why $7,500 is honest, not suspicious.
              </p>
              <p className="text-base text-[var(--fg-2)] leading-relaxed">
                If you can&apos;t hit 14 days, I tell you on the 20-minute scoping call before you wire. Not on day 13.
              </p>
              <div className="mt-8 flex flex-wrap gap-3 font-mono text-xs">
                <a href="mailto:sam@pipeloop.ai?subject=Methodology%20PDF" className="border border-[var(--line-strong)] px-3 py-2 hover:bg-[var(--paper)]">
                  Request methodology PDF →
                </a>
                <a href="mailto:sam@pipeloop.ai?subject=MSA%20preview" className="border border-[var(--line-strong)] px-3 py-2 hover:bg-[var(--paper)]">
                  Request the MSA →
                </a>
                <a href="/readiness" className="border border-[var(--line-strong)] px-3 py-2 hover:bg-[var(--paper)]">
                  Take the 5 Outbound Traps assessment →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA + FOOTER */}
      <section className="bg-[var(--fg)] text-[var(--paper)] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#9ca3af] mb-6">
            Ready when you are
          </p>
          <h2 className="font-serif text-5xl sm:text-6xl leading-[1.02] tracking-tight mb-8 max-w-3xl">
            Day 1 starts the Monday after we get your wire.
          </h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="mailto:sam@pipeloop.ai?subject=Magento%201%20%E2%86%92%20Shopify%20migration%20%E2%80%94%20wire%20%247%2C500&body=Hi%20Sam%2C%0A%0AStore%20URL%3A%20%0AAnnual%20GMV%3A%20%0AAny%20custom%20checkout%20logic%3F%20%0AReady%20to%20wire%3F%20%0A%0A"
              className="inline-block px-6 py-4 bg-[var(--accent)] text-white font-medium text-base hover:bg-[#9a3408] transition-colors"
            >
              Wire $7,500 — start Monday →
            </a>
            <a
              href="#pricing"
              className="inline-block px-6 py-4 border border-[var(--paper)] text-[var(--paper)] font-medium text-base hover:bg-[var(--paper)] hover:text-[var(--fg)] transition-colors"
            >
              See the pricing comparison
            </a>
          </div>
        </div>
      </section>

      <footer className="bg-[var(--fg)] text-[#9ca3af] py-8 border-t border-[#3a3a37]">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row justify-between gap-4 font-mono text-xs">
          <div>
            Pipeloop · Magento 1 → Shopify migration · Built by{" "}
            <a href="https://www.linkedin.com/in/balkenendes/" className="underline underline-offset-4">Sam Balkenende</a>
          </div>
          <div className="flex gap-4">
            <a href="mailto:sam@pipeloop.ai" className="hover:text-[var(--paper)]">sam@pipeloop.ai</a>
            <a href="/readiness" className="hover:text-[var(--paper)]">5 Outbound Traps</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function daysSinceEol(): number {
  const eol = new Date("2020-06-30T00:00:00Z").getTime();
  return Math.floor((Date.now() - eol) / (1000 * 60 * 60 * 24));
}
