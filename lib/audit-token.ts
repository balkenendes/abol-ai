// Token = base64url(URL). Reversible. No secret needed because the URL is public
// (it's the prospect's site) and the audit is fact-based; we re-scan on each
// /r/[token] view until we add a cache layer.

export function encodeAuditToken(url: string): string {
  return Buffer.from(url, "utf8").toString("base64url");
}

export function decodeAuditToken(token: string): string | null {
  try {
    const url = Buffer.from(token, "base64url").toString("utf8");
    if (!/^https?:\/\//i.test(url)) return null;
    new URL(url); // validate
    return url;
  } catch {
    return null;
  }
}
