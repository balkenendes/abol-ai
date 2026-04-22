"""
email_sender.py
===============
Resend wrapper for the paid-report delivery email.

One entry point:

    send_report_email(to_email, score, rating, signed_url, assessment_uuid)

Returns the Resend message id on success, raises EmailError on failure.
The webhook handler catches EmailError and logs to stripe_events but
does NOT refund the payment — PDF is in Storage, signed URL is valid,
buyer can be re-sent manually if needed. Silent-failure class is a
warning, not a show-stopper.

HTML template is dry-observational ABOL voice (no hype, no marketing
fluff). Tone: the board member who walked out of the meeting and wants
the facts in writing.

Requires env: RESEND_API_KEY, EMAIL_FROM (e.g. `ABOL.ai <info@abol.ai>`).
"""

from __future__ import annotations

import logging
import os
from html import escape
from typing import Optional

import httpx

log = logging.getLogger("email")


class EmailError(Exception):
    """Resend send failed. Non-fatal for the webhook handler."""


RESEND_ENDPOINT = "https://api.resend.com/emails"


def _config() -> tuple[str, str]:
    api_key = os.environ.get("RESEND_API_KEY")
    from_addr = os.environ.get("EMAIL_FROM", "ABOL.ai <info@abol.ai>")
    if not api_key:
        raise EmailError("RESEND_API_KEY not set")
    return api_key, from_addr


def _render_report_email(score: float, rating: str, signed_url: str, assessment_uuid: str) -> tuple[str, str]:
    """Return (plaintext, html) bodies. Keep tight — buyers skim."""
    short = assessment_uuid[:8]

    text = f"""Your ABOL.ai benchmark report is ready.

Overall score:  {score:.1f}/100
Rating:         {rating}

Download (link valid for 24 hours):
{signed_url}

The report runs 43 pages. It contains your score against the sector
peer median and top-quartile threshold for all seven pillars
(readiness, security measures, dependencies, investment, compliance,
governance, resilience), the ten prioritized actions that close the
largest exposure gaps, and a three-year roadmap with investment bands.

If the link expires before you download it, reply to this email and
we will regenerate it. Assessment reference: {short}.

Thanks for running the scan.

ABOL.ai — AI and Quantum Security Index
https://abol.ai
"""

    # HTML: IBCS aesthetic — mono for numbers, amber accent, generous whitespace.
    html = f"""<!doctype html>
<html>
<head><meta charset="utf-8"><title>Your ABOL.ai benchmark report</title></head>
<body style="margin:0;padding:0;background:#FAF6EF;font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;color:#14110F;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6EF;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E5DCC8;">
        <tr><td style="padding:32px 32px 0;">
          <div style="font-family:'JetBrains Mono',Menlo,monospace;font-size:11px;letter-spacing:0.5px;color:#8A7D6A;text-transform:uppercase;">
            ABOL.ai &middot; AI and Quantum Security Index
          </div>
          <h1 style="font-size:22px;font-weight:700;color:#14110F;margin:12px 0 6px;letter-spacing:-0.3px;">
            Your benchmark report is ready
          </h1>
          <div style="font-size:13px;color:#4A3E30;line-height:1.5;">
            Reference: <span style="font-family:'JetBrains Mono',Menlo,monospace;">{escape(short)}</span>
          </div>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <div style="display:block;padding:20px;background:#FDF5E6;border-left:3px solid #E8650A;">
            <div style="font-size:11px;letter-spacing:0.5px;color:#8A7D6A;text-transform:uppercase;margin-bottom:6px;font-family:'JetBrains Mono',Menlo,monospace;">
              Your score
            </div>
            <div style="font-size:36px;font-weight:700;color:#14110F;font-family:'JetBrains Mono',Menlo,monospace;letter-spacing:-1px;line-height:1;">
              {score:.1f}<span style="font-size:20px;color:#8A7D6A;font-weight:500;">/100</span>
            </div>
            <div style="font-size:13px;color:#4A3E30;margin-top:8px;">
              {escape(rating)}
            </div>
          </div>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <a href="{escape(signed_url)}" style="display:inline-block;padding:14px 28px;background:#E8650A;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;border-radius:2px;">
            Download the full report (PDF)
          </a>
          <div style="font-size:11px;color:#8A7D6A;margin-top:10px;font-family:'JetBrains Mono',Menlo,monospace;">
            Link valid for 24 hours. Reply to regenerate if it expires.
          </div>
        </td></tr>
        <tr><td style="padding:0 32px 32px;font-size:13px;color:#4A3E30;line-height:1.6;">
          <p style="margin:0 0 12px;">
            The report runs 43 pages. Your score against sector peer median and
            top-quartile threshold for all seven pillars. Ten prioritized actions
            ranked by exposure closed. Three-year roadmap with investment bands.
          </p>
          <p style="margin:0;">
            Board-ready. Print-ready. Cite-ready.
          </p>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #E5DCC8;font-size:11px;color:#8A7D6A;font-family:'JetBrains Mono',Menlo,monospace;">
          ABOL.ai &middot; <a href="https://abol.ai" style="color:#8A7D6A;text-decoration:underline;">abol.ai</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    return text, html


async def send_report_email(
    to_email: str,
    score: float,
    rating: str,
    signed_url: str,
    assessment_uuid: str,
) -> str:
    """Send the paid-report delivery email via Resend. Returns Resend id."""
    api_key, from_addr = _config()
    text_body, html_body = _render_report_email(score, rating, signed_url, assessment_uuid)
    payload = {
        "from": from_addr,
        "to": [to_email],
        "subject": f"Your ABOL.ai benchmark report — {rating}",
        "text": text_body,
        "html": html_body,
        "tags": [
            {"name": "assessment_uuid", "value": assessment_uuid[:36]},
            {"name": "product", "value": "full_report"},
        ],
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            RESEND_ENDPOINT,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if resp.status_code >= 300:
        raise EmailError(f"Resend send failed {resp.status_code}: {resp.text[:300]}")
    body = resp.json()
    message_id = body.get("id") or "unknown"
    log.info("email_sent to=%s uuid=%s resend_id=%s", to_email, assessment_uuid, message_id)
    return message_id
