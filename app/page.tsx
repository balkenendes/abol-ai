"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SCAN_STEPS = [
  "Resolving hostname",
  "Fetching homepage",
  "Detecting platform",
  "Reading meta tags",
  "Checking SSL + viewport",
  "Looking for structured data",
  "Measuring HTML payload",
  "Scoring",
];

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanning) return;
    setStepIndex(0);
    const id = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, SCAN_STEPS.length - 1));
    }, 900);
    return () => clearInterval(id);
  }, [scanning]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || scanning) return;
    setError(null);
    setScanning(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanning(false);
        if (data.error === "blocked") {
          setError(
            "Your site blocks automated requests. That's actually a good sign. Email sam@pipeloop.ai for a manual audit.",
          );
        } else if (data.error === "fetch-failed") {
          setError(`Could not reach this site: ${data.message ?? "unknown error"}.`);
        } else {
          setError(data.error ?? "Scan failed. Try again or email sam@pipeloop.ai.");
        }
        return;
      }
      router.push(`/r/${data.token}`);
    } catch (err) {
      setScanning(false);
      setError(err instanceof Error ? err.message : "Network error.");
    }
  }

  return (
    <main className="min-h-screen bg-[#faf8f5] text-[#1a1a1a]" style={{ fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <header className="max-w-5xl mx-auto px-6 pt-6 pb-12 flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          <span className="font-serif text-2xl tracking-tight">pipeloop</span>
        </div>
        <a href="mailto:sam@pipeloop.ai" className="text-sm text-[#5a5a5a] hover:text-[#1a1a1a] transition-colors">
          sam@pipeloop.ai
        </a>
      </header>

      <section className="max-w-3xl mx-auto px-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8a4a1a] mb-6">
          Free e-commerce diagnostic
        </p>
        <h1 className="font-serif text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-6">
          Find out what your outdated store is costing you.
        </h1>
        <p className="text-lg text-[#3a3a3a] leading-relaxed mb-10 max-w-2xl">
          Paste your store URL. We scan the platform, the markup, the load weight, and the trust signals. You get the report in under 15 seconds. No signup, no email gate, no fluff.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yourstore.com"
              disabled={scanning}
              className="flex-1 px-4 py-3 border border-[#1a1a1a]/20 rounded-none bg-white focus:outline-none focus:border-[#1a1a1a] text-base font-mono placeholder:text-[#8a8580] disabled:opacity-50"
              aria-label="Store URL"
            />
            <button
              type="submit"
              disabled={scanning || !url.trim()}
              className="px-6 py-3 bg-[#1a1a1a] text-[#faf8f5] font-medium hover:bg-[#8a4a1a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {scanning ? "Scanning…" : "Run the audit"}
            </button>
          </div>
          <p className="text-xs text-[#8a8580] font-mono">
            We only fetch the homepage. We don&apos;t store your URL until you book a call.
          </p>
        </form>

        {scanning && (
          <div className="mt-10 border-l-2 border-[#8a4a1a] pl-4 font-mono text-sm space-y-1">
            {SCAN_STEPS.slice(0, stepIndex + 1).map((step, i) => (
              <div key={step} className="text-[#3a3a3a]">
                <span className="text-[#8a8580]">{String(i + 1).padStart(2, "0")}.</span>{" "}
                <span>
                  {step}
                  {i === stepIndex ? "…" : " ✓"}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-8 border-l-2 border-[#a02828] bg-[#fdf3f0] p-4 text-sm text-[#3a3a3a]">
            {error}
          </div>
        )}
      </section>

      <hr className="max-w-5xl mx-auto my-24 border-[#1a1a1a]/10" />

      <section className="max-w-3xl mx-auto px-6 mb-24">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8a4a1a] mb-6">
          What we do after the audit
        </p>
        <h2 className="font-serif text-3xl leading-tight tracking-tight mb-6">
          Fixed price. Fixed scope. 14 days. Refund if we miss the date.
        </h2>
        <p className="text-base text-[#3a3a3a] leading-relaxed mb-10 max-w-2xl">
          If the audit shows your store is on a platform that&apos;s past End-of-Life, missing mobile, or invisible to AI search, we rebuild it. New stack, migration done, conversion basics fixed, modern checkout. One price. One deadline. If we miss the deadline, you get your money back.
        </p>

        <div className="border border-[#1a1a1a]/20 p-6 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 font-mono text-sm">
            <div>
              <div className="text-[#8a8580] text-xs uppercase tracking-wider mb-1">Price</div>
              <div className="font-serif text-2xl">$7,500</div>
              <div className="text-xs text-[#8a8580] mt-1">flat. no upsells.</div>
            </div>
            <div>
              <div className="text-[#8a8580] text-xs uppercase tracking-wider mb-1">Timeline</div>
              <div className="font-serif text-2xl">14 days</div>
              <div className="text-xs text-[#8a8580] mt-1">from kickoff to live.</div>
            </div>
            <div>
              <div className="text-[#8a8580] text-xs uppercase tracking-wider mb-1">Guarantee</div>
              <div className="font-serif text-2xl">Full refund</div>
              <div className="text-xs text-[#8a8580] mt-1">if we miss the date.</div>
            </div>
          </div>
        </div>
      </section>

      <hr className="max-w-5xl mx-auto my-12 border-[#1a1a1a]/10" />

      <section className="max-w-3xl mx-auto px-6 mb-24">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8a4a1a] mb-6">
          How the audit works
        </p>
        <ol className="space-y-4 text-base text-[#3a3a3a] leading-relaxed list-none">
          <li className="grid grid-cols-[2rem_1fr] gap-2">
            <span className="font-mono text-xs text-[#8a8580] pt-1">01.</span>
            <span>
              <strong className="font-medium">Platform fingerprint.</strong> We look at HTTP headers, generator meta tags, JS module patterns, and asset paths to identify Magento, WooCommerce, Shopify, PrestaShop, BigCommerce, Wix, Squarespace, Shopware, or OpenCart. We invert the Magento 1/2 logic to avoid false-positive EOL claims.
            </span>
          </li>
          <li className="grid grid-cols-[2rem_1fr] gap-2">
            <span className="font-mono text-xs text-[#8a8580] pt-1">02.</span>
            <span>
              <strong className="font-medium">Trust + crawlability.</strong> SSL, mobile viewport, JSON-LD Organization/Store schema, language tag, page title and meta description. No structured data means you don&apos;t appear in ChatGPT, Perplexity, or Google AI Overviews.
            </span>
          </li>
          <li className="grid grid-cols-[2rem_1fr] gap-2">
            <span className="font-mono text-xs text-[#8a8580] pt-1">03.</span>
            <span>
              <strong className="font-medium">Performance proxy.</strong> HTML payload size, external script count, presence of jQuery 1.x or Prototype.js. We don&apos;t run Lighthouse from your IP, so this is a conservative read of front-end weight.
            </span>
          </li>
          <li className="grid grid-cols-[2rem_1fr] gap-2">
            <span className="font-mono text-xs text-[#8a8580] pt-1">04.</span>
            <span>
              <strong className="font-medium">Outdated score, 0–10.</strong> Weighted across the checks above. Bands: 0–1 modern, 2–3 ageing, 4–5 outdated, 6+ critical.
            </span>
          </li>
        </ol>
      </section>

      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-[#1a1a1a]/10 font-mono text-xs text-[#8a8580] flex flex-col sm:flex-row justify-between gap-4">
        <div>Pipeloop. Built for shop owners who already know their site is leaking money.</div>
        <a href="/readiness" className="hover:text-[#1a1a1a] transition-colors">
          The 5 Outbound Traps assessment →
        </a>
      </footer>
    </main>
  );
}
