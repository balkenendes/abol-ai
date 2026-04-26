export type EcomPlatform =
  | "magento-1"
  | "magento-2"
  | "woocommerce"
  | "shopify"
  | "shopify-plus"
  | "prestashop"
  | "bigcommerce"
  | "wix"
  | "squarespace"
  | "shopware"
  | "opencart"
  | "unknown";

export interface PlatformDetection {
  platform: EcomPlatform;
  version: string | null;
  confidence: number;
  signals: string[];
}

export interface SiteMetadata {
  url: string;
  finalUrl: string;
  status: number;
  title: string | null;
  description: string | null;
  language: string | null;
  hasViewport: boolean;
  hasJsonLd: boolean;
  hasOrganizationSchema: boolean;
  ssl: boolean;
  cookieBannerDetected: boolean;
  mobileFriendlyHints: { passes: boolean; missing: string[] };
}

export interface PerformanceProxy {
  htmlBytes: number;
  inlineScriptBytes: number;
  externalScriptCount: number;
  totalLinkCount: number;
  hasOldJqueryOrPrototype: boolean;
  estimatedHeavyAssets: string[];
}

export interface CompanyHints {
  name: string | null;
  contactEmails: string[];
  socialLinks: string[];
  countryHints: string[];
}

export interface AuditFindings {
  platformOutdated: boolean;
  platformEol: boolean;
  missingMobileViewport: boolean;
  missingStructuredData: boolean;
  missingHttps: boolean;
  legacyJsLibraries: boolean;
  bloatedHtml: boolean;
  notes: string[];
}

export interface AuditResult {
  scannedAt: string;
  url: string;
  finalUrl: string;
  status: "ok" | "fetch-failed" | "blocked";
  errorMessage?: string;
  platform: PlatformDetection;
  site: SiteMetadata | null;
  performance: PerformanceProxy | null;
  company: CompanyHints | null;
  findings: AuditFindings | null;
  outdatedScore: number;
  scoreBand: "modern" | "ageing" | "outdated" | "critical";
  topReasons: string[];
}
