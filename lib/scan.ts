import * as cheerio from "cheerio";
import { promises as dns } from "node:dns";
import type {
  AuditFindings,
  AuditResult,
  CompanyHints,
  EcomPlatform,
  PerformanceProxy,
  PlatformDetection,
  SiteMetadata,
} from "./audit-types";

const FETCH_TIMEOUT_MS = 15000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const USER_AGENT =
  "Mozilla/5.0 (compatible; PipeloopAuditBot/1.0; +https://pipeloop.ai/bot)";

interface FetchResult {
  status: number;
  finalUrl: string;
  html: string;
  headers: Headers;
}

// SSRF protection: refuse private/loopback/link-local IPs.
function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const norm = ip.toLowerCase();
    if (norm === "::1" || norm === "::") return true;
    if (norm.startsWith("fc") || norm.startsWith("fd")) return true; // ULA
    if (norm.startsWith("fe80:")) return true; // link-local
    if (norm.startsWith("::ffff:")) return isPrivateIp(norm.slice(7));
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + AWS IMDS
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("invalid-url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("unsupported-scheme");
  }
  if (!parsed.hostname) throw new Error("missing-host");
  // Resolve and check every IP. DNS rebinding mitigation: we rely on the
  // resolver for the actual fetch matching what we just resolved.
  let addrs: string[];
  try {
    const lookup = await dns.lookup(parsed.hostname, { all: true });
    addrs = lookup.map((r) => r.address);
  } catch {
    throw new Error("dns-failed");
  }
  if (addrs.length === 0) throw new Error("no-address");
  if (addrs.some(isPrivateIp)) throw new Error("private-address");
  return parsed;
}

function normalizeInput(input: string): string {
  let url = input.trim();
  // Only prepend https:// when no scheme is present at all. If the user typed
  // ftp:// or file:// we leave it so assertSafeUrl can reject with the right error.
  if (!/^[a-z][a-z0-9+\-.]*:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

async function fetchSite(rawUrl: string): Promise<FetchResult> {
  const startUrl = normalizeInput(rawUrl);
  let currentUrl = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeUrl(currentUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        return { status: res.status, finalUrl: currentUrl, html: "", headers: res.headers };
      }
      currentUrl = new URL(loc, currentUrl).toString();
      continue;
    }

    // Cap the body read at MAX_BYTES so a malicious 100MB page can't OOM us.
    const html = await readCappedBody(res, MAX_BYTES);
    return { status: res.status, finalUrl: currentUrl, html, headers: res.headers };
  }
  throw new Error("too-many-redirects");
}

async function readCappedBody(res: Response, max: number): Promise<string> {
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > max) {
        try {
          await reader.cancel();
        } catch {
          /* noop */
        }
        throw new Error("body-too-large");
      }
      chunks.push(value);
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks));
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

// Cloudflare / Akamai / PerimeterX challenge bodies look like normal pages
// (HTTP 200) but contain only a JS challenge. We must NOT score them as the
// underlying site, otherwise we email the owner that their working site is broken.
function isChallengePage(html: string, $: cheerio.CheerioAPI): boolean {
  const lower = html.toLowerCase();
  if (lower.length < 2000 && /<noscript>/.test(lower) && !/<main|<article|<section/.test(lower)) {
    return true;
  }
  if (/cf-challenge|__cf_chl_|__cf_bm|cf-error-details|cdn-cgi\/challenge-platform/.test(lower)) {
    return true;
  }
  if (/just a moment\.\.\.|attention required! \| cloudflare|please enable cookies/i.test(lower)) {
    return true;
  }
  if (/window\._cf_chl_opt|chlPageData/.test(lower)) return true;
  // PerimeterX / DataDome / Akamai bot manager
  if (/_pxhd|datadome\.co|ak_bmsc|bm-verify/.test(lower)) return true;
  return false;
}

function detectPlatform(
  html: string,
  $: cheerio.CheerioAPI,
  headers: Headers,
): PlatformDetection {
  const signals: string[] = [];
  const cookieHeader = headers.get("set-cookie") ?? "";
  const generator = $('meta[name="generator"]').attr("content")?.toLowerCase() ?? "";
  const lower = html.toLowerCase();

  // Modern markers — presence of any means we DEFAULT TO M2 over M1.
  const m2Markers = [
    /data-mage-init/.test(html),
    /\bMagento_[A-Z]/.test(html),
    /mage\/cookies/.test(lower),
    /requirejs-config\.js/.test(lower),
    /\/static\/version\d+\//.test(lower),
    /window\.checkout\s*=/.test(html) && /magento/i.test(html),
  ].filter(Boolean).length;

  // M1-exclusive markers
  const m1Markers = [
    /\/skin\/frontend\//.test(html),
    /\/js\/varien\//.test(html),
    /\/js\/mage\/cookies\.js/.test(html),
    /var\s+Mage\s*=/.test(html),
    /Mage\.Cookies\.path/.test(html),
  ].filter(Boolean).length;

  let platform: EcomPlatform = "unknown";
  let version: string | null = null;

  if (m2Markers > 0) {
    platform = "magento-2";
    signals.push(`magento-2: ${m2Markers} modern markers`);
  } else if (m1Markers > 0) {
    platform = "magento-1";
    signals.push(`magento-1: ${m1Markers} M1-exclusive markers`);
  } else if (cookieHeader.includes("frontend=") && /\/index\.php\//.test(lower)) {
    // Ambiguous Magento — could be either; mark as unknown-version.
    platform = "magento-2";
    signals.push("magento (version ambiguous, defaulted to magento-2)");
  }

  // WooCommerce — generator meta is the most reliable signal.
  if (/woocommerce/i.test(generator)) {
    platform = "woocommerce";
    signals.push(`woocommerce generator: "${generator}"`);
    const m = generator.match(/woocommerce\s*([\d.]+)/);
    if (m) version = m[1];
  } else if (
    /wp-content\/plugins\/woocommerce/.test(lower) &&
    $('script[src*="woocommerce"], link[href*="woocommerce"]').length > 0
  ) {
    platform = "woocommerce";
    signals.push("woocommerce assets present");
  }

  // Shopify (Plus detection requires Shopify.shop.plan in inline JSON; otherwise default to "shopify").
  if (/cdn\.shopify\.com|window\.Shopify\b|Shopify\.theme/.test(html)) {
    const planMatch = html.match(/Shopify\.shop\s*=\s*\{[^}]*?"plan":"([^"]+)"/);
    if (planMatch && /plus|enterprise/i.test(planMatch[1])) {
      platform = "shopify-plus";
      signals.push(`shopify-plus: plan="${planMatch[1]}"`);
    } else {
      platform = "shopify";
      signals.push("shopify cdn/global");
    }
    const themeM = html.match(/Shopify\.theme\s*=\s*\{[^}]*?"name":"([^"]+)"/);
    if (themeM) version = `theme:${themeM[1]}`;
  }

  // PrestaShop
  if (/prestashop/i.test(generator) || /var\s+prestashop\s*=|window\.prestashop/i.test(html)) {
    platform = "prestashop";
    signals.push("prestashop generator/global");
    const m = generator.match(/prestashop\s*([\d.]+)/);
    if (m) version = m[1];
  }

  // BigCommerce
  if (/cdn11\.bigcommerce\.com|window\.BCData/.test(html)) {
    platform = "bigcommerce";
    signals.push("bigcommerce cdn/BCData");
  }

  // Wix
  if (
    /static\.wixstatic\.com|window\.wixBiSession/.test(html) ||
    /generator.*wix/i.test(generator)
  ) {
    platform = "wix";
    signals.push("wix static/biSession");
  }

  // Squarespace
  if (
    /static1\.squarespace\.com|Squarespace\.SQUARESPACE_CONTEXT|squarespace-cdn/.test(html) ||
    /generator.*squarespace/i.test(generator)
  ) {
    platform = "squarespace";
    signals.push("squarespace cdn/context");
  }

  // Shopware — anchor to meta application-name OR window.shopware JS context.
  if (
    $('meta[name="application-name"][content*="shopware" i]').length > 0 ||
    /window\.shopware\s*=|var\s+shopware\s*=\s*\{/.test(html)
  ) {
    platform = "shopware";
    signals.push("shopware application-name/window");
    const m = html.match(/shopware\.version\s*=\s*['"]([^'"]+)['"]/i);
    if (m) version = m[1];
  }

  // OpenCart — only if path appears in actual link/script src attributes, not raw HTML text.
  const ocAssets = $('link[href*="catalog/view/theme/"], script[src*="catalog/view/javascript/"]');
  if (ocAssets.length > 0 || /generator.*opencart/i.test(generator)) {
    platform = "opencart";
    signals.push("opencart asset paths in <link>/<script>");
  }

  const confidence = signals.length === 0 ? 0 : Math.min(1, signals.length / 2);
  return { platform, version, confidence, signals };
}

function extractMetadata($: cheerio.CheerioAPI, response: FetchResult): SiteMetadata {
  const title = $("title").first().text().trim() || null;
  const description = $('meta[name="description"]').attr("content")?.trim() ?? null;
  const language = $("html").attr("lang") ?? null;
  const hasViewport = $('meta[name="viewport"]').length > 0;

  const jsonLdScripts = $('script[type="application/ld+json"]');
  const hasJsonLd = jsonLdScripts.length > 0;
  let hasOrganizationSchema = false;
  jsonLdScripts.each((_, el) => {
    try {
      const json = JSON.parse($(el).contents().text());
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        const t = item?.["@type"];
        if (
          t === "Organization" ||
          t === "Store" ||
          t === "LocalBusiness" ||
          (Array.isArray(t) && t.some((x: string) => /Organization|Store|LocalBusiness/.test(x)))
        ) {
          hasOrganizationSchema = true;
        }
      }
    } catch {
      // malformed JSON-LD = a finding by itself, but we don't crash the scan
    }
  });

  const ssl = response.finalUrl.startsWith("https://");
  // Tighten cookie banner detection: must appear in an actual button or banner element.
  const cookieBannerDetected =
    $('button:contains("Accept"), button:contains("cookie"), [id*="cookie" i], [class*="cookie-banner" i], [class*="consent" i], [role="dialog"]:contains("cookie")')
      .length > 0;

  const missing: string[] = [];
  if (!hasViewport) missing.push("viewport meta");
  if (!ssl) missing.push("https");
  const mobileFriendlyHints = { passes: missing.length === 0, missing };

  return {
    url: response.finalUrl,
    finalUrl: response.finalUrl,
    status: response.status,
    title,
    description,
    language,
    hasViewport,
    hasJsonLd,
    hasOrganizationSchema,
    ssl,
    cookieBannerDetected,
    mobileFriendlyHints,
  };
}

function analyzePerformance(html: string, $: cheerio.CheerioAPI): PerformanceProxy {
  const externalScripts = $("script[src]");
  const externalScriptCount = externalScripts.length;
  const totalLinkCount = $('link[rel="stylesheet"]').length;
  const inlineScriptBytes = $("script:not([src])")
    .map((_, el) => $(el).text().length)
    .get()
    .reduce((a: number, b: number) => a + b, 0);
  const htmlBytes = Buffer.byteLength(html, "utf8");

  const heavy: string[] = [];
  externalScripts.each((_, el) => {
    const src = ($(el).attr("src") ?? "").toLowerCase();
    if (
      /jquery-1\./.test(src) ||
      /jquery\/1\./.test(src) ||
      /prototype\.js|mootools/.test(src)
    ) {
      heavy.push(src);
    }
  });
  const hasOldJqueryOrPrototype = heavy.length > 0;

  return {
    htmlBytes,
    inlineScriptBytes,
    externalScriptCount,
    totalLinkCount,
    hasOldJqueryOrPrototype,
    estimatedHeavyAssets: heavy,
  };
}

function extractCompanyHints(
  $: cheerio.CheerioAPI,
  html: string,
  url: string,
): CompanyHints {
  const ogSiteName = $('meta[property="og:site_name"]').attr("content");
  const titleName = $("title").first().text().trim().split(/[|\-–]/)[0]?.trim();
  const name = ogSiteName?.trim() || titleName || null;

  // Restrict email harvest to mailto: hrefs + visible body text (no script blobs).
  const mailtoEmails = $('a[href^="mailto:"]')
    .map((_, el) => ($(el).attr("href") ?? "").replace(/^mailto:/i, "").split("?")[0])
    .get()
    .filter(Boolean);
  const visibleText = $("body").clone().find("script, style, noscript").remove().end().text();
  const inlineEmails = (visibleText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []);
  const contactEmails = Array.from(
    new Set(
      [...mailtoEmails, ...inlineEmails].filter(
        (e) =>
          !/sentry|wixpress|noreply|no-reply|example\.com|@2x|sample|webhook|mailer-daemon/i.test(e),
      ),
    ),
  ).slice(0, 5);

  const socialLinks = Array.from(
    new Set(
      $("a[href]")
        .map((_, el) => $(el).attr("href") ?? "")
        .get()
        .filter((h: string) =>
          /linkedin\.com\/(in|company)|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com/i.test(
            h,
          ),
        ),
    ),
  ).slice(0, 8);

  const tld = (() => {
    try {
      const u = new URL(url);
      const parts = u.hostname.split(".");
      return parts[parts.length - 1].toLowerCase();
    } catch {
      return "";
    }
  })();
  const countryHints: string[] = [];
  if (tld.length === 2 && tld !== "co" && tld !== "io") countryHints.push(tld);
  const lang = $("html").attr("lang");
  if (lang) countryHints.push(lang);

  return { name, contactEmails, socialLinks, countryHints };
}

function analyzeFindings(
  platform: PlatformDetection,
  site: SiteMetadata,
  perf: PerformanceProxy,
): AuditFindings {
  const notes: string[] = [];

  const platformEol = platform.platform === "magento-1";
  if (platformEol) {
    notes.push(
      "Magento 1 has been End-of-Life since June 2020 (Adobe announcement). No security patches; PCI-DSS 4.0 self-assessment requires documented compensating controls.",
    );
  }

  const platformOutdated = (() => {
    if (platformEol) return true;
    if (platform.platform === "woocommerce" && platform.version) {
      const major = parseInt(platform.version.split(".")[0] ?? "0", 10);
      if (major < 7) {
        notes.push(`WooCommerce ${platform.version} is several major versions behind current.`);
        return true;
      }
    }
    if (platform.platform === "prestashop" && platform.version) {
      const major = parseInt(platform.version.split(".")[0] ?? "0", 10);
      if (major < 8) {
        notes.push(`PrestaShop ${platform.version} predates the v8 modernization.`);
        return true;
      }
    }
    if (perf.hasOldJqueryOrPrototype) {
      notes.push(
        `Site loads ${perf.estimatedHeavyAssets[0]} (jQuery 1.x or Prototype.js) — last meaningful update was over a decade ago.`,
      );
      return true;
    }
    return false;
  })();

  const missingMobileViewport = !site.hasViewport;
  if (missingMobileViewport)
    notes.push("No <meta name=\"viewport\"> tag — mobile rendering is broken on phones.");

  const missingStructuredData = !site.hasOrganizationSchema;
  if (missingStructuredData)
    notes.push(
      "No Organization / Store JSON-LD schema — invisible to ChatGPT, Perplexity, and Google AI Overviews.",
    );

  const missingHttps = !site.ssl;
  if (missingHttps) notes.push("Site does not enforce HTTPS — browsers warn shoppers at checkout.");

  const legacyJsLibraries = perf.hasOldJqueryOrPrototype;

  const bloatedHtml = perf.htmlBytes > 600_000;
  if (bloatedHtml)
    notes.push(`HTML payload is ${(perf.htmlBytes / 1024).toFixed(0)}KB before assets — slow first paint.`);

  return {
    platformOutdated,
    platformEol,
    missingMobileViewport,
    missingStructuredData,
    missingHttps,
    legacyJsLibraries,
    bloatedHtml,
    notes,
  };
}

export function scoreOutdated(findings: AuditFindings): {
  score: number;
  band: "modern" | "ageing" | "outdated" | "critical";
  topReasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  if (findings.platformEol) {
    score += 4;
    reasons.push("Platform reached End-of-Life — no security updates.");
  } else if (findings.platformOutdated) {
    score += 2;
    reasons.push("Platform version is several majors behind current.");
  }
  if (findings.legacyJsLibraries) {
    score += 1;
    reasons.push("Loads legacy JavaScript libraries.");
  }
  if (findings.missingMobileViewport) {
    score += 2;
    reasons.push("Mobile rendering is broken (no viewport meta).");
  }
  if (findings.missingStructuredData) {
    score += 1;
    reasons.push("Invisible to AI search (no structured data).");
  }
  if (findings.missingHttps) {
    score += 3;
    reasons.push("Checkout is not secured with HTTPS.");
  }
  if (findings.bloatedHtml) {
    score += 1;
    reasons.push("HTML payload is unusually large.");
  }

  const band: "modern" | "ageing" | "outdated" | "critical" =
    score >= 6 ? "critical" : score >= 4 ? "outdated" : score >= 2 ? "ageing" : "modern";

  return { score: Math.min(10, score), band, topReasons: reasons.slice(0, 3) };
}

function emptyResult(
  url: string,
  finalUrl: string,
  status: AuditResult["status"],
  scannedAt: string,
  errorMessage?: string,
): AuditResult {
  return {
    scannedAt,
    url,
    finalUrl,
    status,
    errorMessage,
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

export async function scanSite(rawUrl: string): Promise<AuditResult> {
  const scannedAt = new Date().toISOString();
  const url = normalizeInput(rawUrl);

  let response: FetchResult;
  try {
    response = await fetchSite(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return emptyResult(url, url, "fetch-failed", scannedAt, msg);
  }

  if (response.status >= 400) {
    return emptyResult(url, response.finalUrl, "blocked", scannedAt, `HTTP ${response.status}`);
  }
  if (!response.html || response.html.length < 50) {
    return emptyResult(url, response.finalUrl, "blocked", scannedAt, "empty body");
  }

  const $ = cheerio.load(response.html);

  // Cloudflare/WAF challenge detection BEFORE we make claims about the site.
  if (isChallengePage(response.html, $)) {
    return emptyResult(
      url,
      response.finalUrl,
      "blocked",
      scannedAt,
      "WAF challenge page (Cloudflare / Akamai / DataDome)",
    );
  }

  const platform = detectPlatform(response.html, $, response.headers);
  const site = extractMetadata($, response);
  const performance = analyzePerformance(response.html, $);
  const company = extractCompanyHints($, response.html, response.finalUrl);
  const findings = analyzeFindings(platform, site, performance);
  const { score, band, topReasons } = scoreOutdated(findings);

  return {
    scannedAt,
    url,
    finalUrl: response.finalUrl,
    status: "ok",
    platform,
    site,
    performance,
    company,
    findings,
    outdatedScore: score,
    scoreBand: band,
    topReasons,
  };
}
