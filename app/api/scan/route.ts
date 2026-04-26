import { NextRequest, NextResponse } from "next/server";
import { scanSite } from "@/lib/scan";
import { encodeAuditToken } from "@/lib/audit-token";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

interface ScanRequest {
  url?: unknown;
}

export async function POST(req: NextRequest) {
  let body: ScanRequest;
  try {
    body = (await req.json()) as ScanRequest;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "missing-url" }, { status: 400 });
  }
  if (url.length > 500) {
    return NextResponse.json({ error: "url-too-long" }, { status: 400 });
  }

  let result;
  try {
    result = await scanSite(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "scan-error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (result.status === "fetch-failed" || result.status === "blocked") {
    return NextResponse.json(
      { error: result.status, message: result.errorMessage, result },
      { status: 422 },
    );
  }

  const token = encodeAuditToken(result.finalUrl);
  return NextResponse.json({ token, result });
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "missing-url" }, { status: 400 });
  return POST(
    new NextRequest(req.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    }),
  );
}
