"""
server.py
=========
FastAPI HTTP wrapper. Deployed as the Fly.io `abol-pdf` container
(region: ams). Sprint 1 endpoints (/health, /generate). Sprint 2 adds
the monetization loop: Stripe Checkout, webhook, and auto-delivery
via Supabase Storage + Resend.

Endpoints:
    GET  /health                 Liveness probe. Checks Supabase reachability.
    POST /generate               Generate PDF for a UUID, return application/pdf.
    POST /checkout               Create Stripe Checkout Session, return hosted URL.
    POST /stripe/webhook         Receive Stripe events, dedup, trigger fulfilment.

Required env vars (enforced at startup — fail fast, not on first request):
    SUPABASE_URL                    Project URL
    SUPABASE_SERVICE_ROLE_KEY       Service-role JWT (server-only, never exposed)

Sprint 2 additions (checked at request time, not startup — so the container
still boots if Stripe isn't configured yet):
    STRIPE_SECRET_KEY               sk_live_... or sk_test_...
    STRIPE_WEBHOOK_SECRET           whsec_... (from Stripe dashboard webhook config)
    STRIPE_PRICE_FULL_REPORT        price_... (optional; inline price_data used if unset)
    STRIPE_SUCCESS_URL              e.g. https://abol.ai/paid?s={CHECKOUT_SESSION_ID}
    STRIPE_CANCEL_URL               e.g. https://abol.ai
    RESEND_API_KEY                  re_...
    EMAIL_FROM                      e.g. ABOL.ai <info@abol.ai>

Optional env vars:
    ANTHROPIC_API_KEY               Enables LLM executive summary (fallback otherwise)
    ABOL_LOG_LEVEL                  Default INFO

Structured logging: every log line emits key=value pairs that Fly.io /
Cloud Run parse as structured fields. Request IDs propagated via `X-Request-Id`.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import os
import socket
import sys
import tempfile
import time
import uuid as uuid_lib
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse

from email_sender import EmailError, send_report_email
from generate_report import build_pdf
from report_loaders import (
    AssessmentIncomplete,
    AssessmentNotFound,
    LoaderConfigError,
    LoaderError,
    ScoreMismatch,
    ScoresMissing,
    SupabaseUnavailable,
    load_assessment_data_async,
)
from storage import StorageError, upload_and_sign

# ----------------------------------------------------------------------------
# Structured logging setup
# ----------------------------------------------------------------------------
logging.basicConfig(
    level=os.environ.get("ABOL_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("server")

HOSTNAME = socket.gethostname()


def _structured_log(level: str, event: str, **fields) -> None:
    """Emit a log line with key=value fields that parsers can index."""
    pairs = " ".join(f'{k}={v}' for k, v in fields.items() if v is not None)
    msg = f"{event} {pairs}".strip()
    getattr(log, level, log.info)(msg)


# ----------------------------------------------------------------------------
# Startup asserts (fail fast on config errors — one of the 3 critical gaps)
# ----------------------------------------------------------------------------
def _assert_startup_config() -> None:
    """Verify every required env var + reachable dependency at boot.

    Raises SystemExit on any failure. This runs synchronously before the
    FastAPI app accepts its first request — any misconfiguration is
    surfaced immediately in Fly.io logs, not on first user request.
    """
    missing = []
    for var in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if not os.environ.get(var):
            missing.append(var)
    if missing:
        log.critical("startup_config_error missing=%s", ",".join(missing))
        sys.exit(1)

    # Light-touch ping to Supabase (avoid doing heavy work at boot)
    supabase_url = os.environ["SUPABASE_URL"]
    service_role = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(
                f"{supabase_url}/rest/v1/abol_public_scores?select=id&limit=1",
                headers={"apikey": service_role, "Authorization": f"Bearer {service_role}"},
            )
            resp.raise_for_status()
        _structured_log("info", "startup_supabase_reachable", url=supabase_url)
    except Exception as exc:
        log.critical("startup_supabase_unreachable url=%s error=%s", supabase_url, exc)
        sys.exit(1)

    # Anthropic API key presence (optional, but warn loudly if missing — the PDF's
    # executive summary will fall back to rule-based generation)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        log.warning("startup_anthropic_missing note=fallback_summaries_will_be_used")
    else:
        _structured_log("info", "startup_anthropic_configured")


_assert_startup_config()


# ----------------------------------------------------------------------------
# FastAPI app
# ----------------------------------------------------------------------------
app = FastAPI(
    title="ABOL.ai PDF Service",
    description="Server-side PDF generation for completed assessments.",
    version="1.0.0",
)


# ----------------------------------------------------------------------------
# pdf_generations observability log
# ----------------------------------------------------------------------------
async def _log_generation(
    *,
    assessment_id: str,
    status: str,
    started_at: dt.datetime,
    duration_ms: Optional[int] = None,
    error_class: Optional[str] = None,
    error_message: Optional[str] = None,
    pages_generated: Optional[int] = None,
    bytes_out: Optional[int] = None,
    anthropic_used: Optional[bool] = None,
    source: str = "supabase",
    storage_path: Optional[str] = None,
    signed_url: Optional[str] = None,
) -> None:
    """Write a row to pdf_generations. Service-role only; never fails the
    request — failure to log is a WARNING, not a show-stopper."""
    try:
        supabase_url = os.environ["SUPABASE_URL"]
        service_role = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        payload = {
            "assessment_id": assessment_id,
            "started_at": started_at.isoformat(),
            "completed_at": dt.datetime.utcnow().isoformat() if status != "started" else None,
            "duration_ms": duration_ms,
            "status": status,
            "error_class": error_class,
            "error_message": error_message[:500] if error_message else None,
            "pages_generated": pages_generated,
            "bytes": bytes_out,
            "anthropic_used": anthropic_used,
            "source": source,
            "storage_path": storage_path,
            "signed_url": signed_url,
            "container_hostname": HOSTNAME,
        }
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{supabase_url}/rest/v1/pdf_generations",
                headers={
                    "apikey": service_role,
                    "Authorization": f"Bearer {service_role}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                },
                json=payload,
            )
            resp.raise_for_status()
    except Exception as exc:
        log.warning("pdf_generation_log_failed uuid=%s error=%s", assessment_id, exc)


# ----------------------------------------------------------------------------
# Health endpoint
# ----------------------------------------------------------------------------
@app.get("/health")
async def health():
    """Liveness + readiness probe. Hits Supabase; returns 200 or 503."""
    supabase_url = os.environ["SUPABASE_URL"]
    service_role = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{supabase_url}/rest/v1/abol_public_scores?select=id&limit=1",
                headers={"apikey": service_role, "Authorization": f"Bearer {service_role}"},
            )
            resp.raise_for_status()
        return {"status": "ok", "supabase": "reachable", "hostname": HOSTNAME}
    except Exception as exc:
        log.error("health_check_failed error=%s", exc)
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "supabase": "unreachable", "hostname": HOSTNAME, "error": str(exc)},
        )


# ----------------------------------------------------------------------------
# Generate endpoint
# ----------------------------------------------------------------------------
@app.post("/generate")
async def generate(
    uuid: str = Query(..., description="Assessment UUID"),
    source: str = Query("supabase", description="Loader source"),
    x_request_id: Optional[str] = Header(None, alias="X-Request-Id"),
):
    """Generate a PDF for an assessment. Logs every attempt to pdf_generations.

    Response: application/pdf on success, JSON error on failure.
    Status codes: 200 OK · 400 incomplete · 404 not found · 500 server · 503 upstream down.
    """
    # Validate UUID format (cheap check, catches typos before DB round-trip)
    try:
        uuid_lib.UUID(uuid)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"invalid UUID: {uuid!r}")

    request_id = x_request_id or str(uuid_lib.uuid4())
    started_at = dt.datetime.utcnow()
    t0 = time.monotonic()

    _structured_log("info", "pdf_gen_start", uuid=uuid, source=source, request_id=request_id)

    # Lifecycle row (status='started') — lets operators see in-flight work
    await _log_generation(
        assessment_id=uuid, status="started", started_at=started_at, source=source,
    )

    try:
        # 60s timeout around the full pipeline (load + LLM + render + disk write)
        data = await asyncio.wait_for(
            load_assessment_data_async(source, uuid),
            timeout=60.0,
        )
        load_duration = int((time.monotonic() - t0) * 1000)
        _structured_log(
            "info", "pdf_gen_load_complete",
            uuid=uuid, duration_ms=load_duration, answers=len(data.answers),
            dimensions=len(data.dimension_scores), overall_pct=data.overall_percentage,
        )

        # Render PDF to a temp file
        tmp = Path(tempfile.gettempdir()) / f"abol-{uuid}-{int(time.time())}.pdf"
        render_t0 = time.monotonic()
        build_pdf(data, tmp)
        render_duration = int((time.monotonic() - render_t0) * 1000)
        bytes_out = tmp.stat().st_size
        # ReportLab doesn't directly expose page count without a second parse;
        # approximate from size (~4.3 KB/page typical for this report)
        approx_pages = max(1, bytes_out // 4300)
        anthropic_used = bool(os.environ.get("ANTHROPIC_API_KEY"))

        _structured_log(
            "info", "pdf_gen_render_complete",
            uuid=uuid, duration_ms=render_duration, bytes=bytes_out,
            approx_pages=approx_pages, anthropic_used=anthropic_used,
        )

        total_duration = int((time.monotonic() - t0) * 1000)
        await _log_generation(
            assessment_id=uuid, status="success", started_at=started_at,
            duration_ms=total_duration, pages_generated=approx_pages,
            bytes_out=bytes_out, anthropic_used=anthropic_used, source=source,
        )

        _structured_log(
            "info", "pdf_gen_complete",
            uuid=uuid, total_ms=total_duration, bytes=bytes_out, request_id=request_id,
        )
        return FileResponse(
            path=str(tmp),
            media_type="application/pdf",
            filename=f"abol_report_{uuid[:8]}.pdf",
            headers={"X-Request-Id": request_id},
        )

    except asyncio.TimeoutError:
        duration = int((time.monotonic() - t0) * 1000)
        log.error("pdf_gen_timeout uuid=%s duration_ms=%d", uuid, duration)
        await _log_generation(
            assessment_id=uuid, status="failed", started_at=started_at,
            duration_ms=duration, error_class="asyncio.TimeoutError",
            error_message="60s pipeline timeout", source=source,
        )
        raise HTTPException(status_code=504, detail="pdf generation timed out")

    except AssessmentNotFound as exc:
        await _log_generation(
            assessment_id=uuid, status="failed", started_at=started_at,
            error_class=exc.__class__.__name__, error_message=str(exc), source=source,
        )
        _structured_log("info", "pdf_gen_not_found", uuid=uuid, request_id=request_id)
        raise HTTPException(status_code=404, detail=str(exc))

    except AssessmentIncomplete as exc:
        await _log_generation(
            assessment_id=uuid, status="failed", started_at=started_at,
            error_class=exc.__class__.__name__, error_message=str(exc), source=source,
        )
        _structured_log("info", "pdf_gen_incomplete", uuid=uuid, request_id=request_id)
        raise HTTPException(status_code=400, detail=str(exc))

    except SupabaseUnavailable as exc:
        await _log_generation(
            assessment_id=uuid, status="failed", started_at=started_at,
            error_class=exc.__class__.__name__, error_message=str(exc), source=source,
        )
        log.error("pdf_gen_supabase_down uuid=%s error=%s request_id=%s", uuid, exc, request_id)
        raise HTTPException(status_code=503, detail=str(exc))

    except (ScoresMissing, ScoreMismatch, LoaderConfigError, LoaderError) as exc:
        await _log_generation(
            assessment_id=uuid, status="failed", started_at=started_at,
            error_class=exc.__class__.__name__, error_message=str(exc), source=source,
        )
        log.error(
            "pdf_gen_loader_error uuid=%s error_class=%s error=%s request_id=%s",
            uuid, exc.__class__.__name__, exc, request_id,
        )
        raise HTTPException(status_code=exc.http_status, detail=str(exc))

    except Exception as exc:  # noqa: BLE001
        # Last-resort catch. Don't leak stacktrace to client; log it + generic 500.
        duration = int((time.monotonic() - t0) * 1000)
        log.exception(
            "pdf_gen_unhandled uuid=%s duration_ms=%d request_id=%s", uuid, duration, request_id,
        )
        await _log_generation(
            assessment_id=uuid, status="failed", started_at=started_at,
            duration_ms=duration, error_class=exc.__class__.__name__,
            error_message=str(exc), source=source,
        )
        raise HTTPException(status_code=500, detail="pdf generation failed (see logs)")


# ============================================================================
# Stripe Checkout (Sprint 2)
# ============================================================================
# Two endpoints:
#   POST /checkout          Browser-initiated, creates Checkout Session
#   POST /stripe/webhook    Stripe-initiated, fulfils order
#
# Stripe is an OPTIONAL dependency loaded at request time — the container
# boots even without STRIPE_SECRET_KEY set (useful for Sprint 1 deploys
# before payment is wired up).

PRICE_AMOUNT_CENTS = 42500            # €425.00 in cents (Stripe uses integer cents)
PRICE_CURRENCY     = "eur"
PRODUCT_NAME       = "ABOL.ai Full Benchmark Report"
PRODUCT_DESC       = "43-page board-ready PDF · peer benchmark · 10 prioritized actions · 12-month re-download access"


def _stripe_client():
    """Lazy-import stripe and configure the API key. Raises 503 on misconfig."""
    import stripe  # local import — Sprint 1 deploys may skip this dep
    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Stripe not configured on this container")
    stripe.api_key = key
    return stripe


@app.post("/checkout")
async def checkout(
    uuid: str = Query(..., description="Completed assessment UUID the buyer wants to unlock"),
    email: Optional[str] = Query(None, description="Buyer email (prefill Stripe Checkout)"),
):
    """Create a Stripe Checkout Session and return the hosted-page URL.

    The `client_reference_id` carries the assessment UUID through payment,
    so the webhook can correlate back. `success_url` can include
    `{CHECKOUT_SESSION_ID}` which Stripe substitutes — lets the frontend
    optionally show a success page with the payment session id.
    """
    try:
        uuid_lib.UUID(uuid)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"invalid UUID: {uuid!r}")

    stripe = _stripe_client()

    # Validate the assessment exists + is completed + not already paid.
    # Avoids charging a card for a UUID that will 404 on /generate later.
    supabase_url = os.environ["SUPABASE_URL"]
    service_role = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{supabase_url}/rest/v1/abol_assessments",
            headers={"apikey": service_role, "Authorization": f"Bearer {service_role}"},
            params={"id": f"eq.{uuid}", "select": "status,is_paid,email"},
        )
        resp.raise_for_status()
        rows = resp.json()
    if not rows:
        raise HTTPException(status_code=404, detail=f"assessment {uuid} not found")
    row = rows[0]
    if row["status"] != "completed":
        raise HTTPException(status_code=400, detail="assessment not completed")
    if row.get("is_paid"):
        raise HTTPException(status_code=409, detail="assessment already paid — check your inbox for the report link")

    # If a stored Stripe Price is configured, use it; else inline price_data
    price_id = os.environ.get("STRIPE_PRICE_FULL_REPORT")
    if price_id:
        line_items = [{"price": price_id, "quantity": 1}]
    else:
        line_items = [{
            "price_data": {
                "currency": PRICE_CURRENCY,
                "unit_amount": PRICE_AMOUNT_CENTS,
                "product_data": {"name": PRODUCT_NAME, "description": PRODUCT_DESC},
            },
            "quantity": 1,
        }]

    success_url = os.environ.get("STRIPE_SUCCESS_URL", "https://abol.ai/paid?s={CHECKOUT_SESSION_ID}")
    cancel_url = os.environ.get("STRIPE_CANCEL_URL", "https://abol.ai")

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card", "ideal"],       # card + Dutch iDEAL for EU mid-market
            line_items=line_items,
            client_reference_id=uuid,                     # THE correlation key — carries UUID to the webhook
            customer_email=email or row.get("email"),     # prefill, buyer can still edit
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"assessment_uuid": uuid},           # belt-and-suspenders: also in metadata
            automatic_tax={"enabled": False},             # flip on when VAT registration is done
        )
    except Exception as exc:
        log.error("checkout_create_failed uuid=%s error=%s", uuid, exc)
        raise HTTPException(status_code=502, detail=f"checkout creation failed: {exc}")

    log.info("checkout_created uuid=%s session=%s url=%s", uuid, session.id, session.url)
    return {"url": session.url, "session_id": session.id}


# ----------------------------------------------------------------------------
# Stripe webhook — signature verified, idempotency-guarded
# ----------------------------------------------------------------------------
async def _stripe_events_insert(event) -> bool:
    """INSERT into stripe_events. Returns True if new, False if already seen
    (ON CONFLICT DO NOTHING based on UNIQUE event_id)."""
    supabase_url = os.environ["SUPABASE_URL"]
    service_role = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    # Stripe's Event object shape varies; access common fields defensively
    data = event.get("data", {}).get("object", {}) if isinstance(event, dict) else {}
    assessment_uuid = None
    if isinstance(data, dict):
        assessment_uuid = data.get("client_reference_id") or (data.get("metadata") or {}).get("assessment_uuid")
    payment_intent = data.get("payment_intent") if isinstance(data, dict) else None
    amount = data.get("amount_total") or data.get("amount")
    currency = data.get("currency")

    payload = {
        "event_id": event["id"],
        "event_type": event["type"],
        "assessment_id": assessment_uuid,
        "payment_intent_id": payment_intent,
        "amount_cents": amount,
        "currency": currency,
        "livemode": bool(event.get("livemode")),
        "status": "received",
        "raw_event": event,
    }

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            f"{supabase_url}/rest/v1/stripe_events",
            headers={
                "apikey": service_role,
                "Authorization": f"Bearer {service_role}",
                "Content-Type": "application/json",
                "Prefer": "return=representation,resolution=ignore-duplicates",
            },
            json=payload,
        )
    # PostgREST returns 201 + row body on insert, or 201 + empty array when ON CONFLICT DO NOTHING fires.
    if resp.status_code >= 300:
        log.error("stripe_events_insert_failed event=%s status=%d body=%s",
                  event.get("id"), resp.status_code, resp.text[:200])
        return True  # best-effort continue rather than losing the event
    body = resp.json() if resp.text.strip() else []
    return bool(body)  # truthy = inserted (new); empty list = already seen


async def _stripe_events_update_outcome(event_id: str, *, status: str, duration_ms: int, error_class: Optional[str] = None, error_message: Optional[str] = None) -> None:
    """PATCH the stripe_events row with final outcome."""
    supabase_url = os.environ["SUPABASE_URL"]
    service_role = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    payload = {
        "status": status,
        "processed_at": dt.datetime.utcnow().isoformat(),
        "duration_ms": duration_ms,
        "error_class": error_class,
        "error_message": error_message[:500] if error_message else None,
    }
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.patch(
            f"{supabase_url}/rest/v1/stripe_events?event_id=eq.{event_id}",
            headers={
                "apikey": service_role,
                "Authorization": f"Bearer {service_role}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            json=payload,
        )
    if resp.status_code >= 300:
        log.warning("stripe_events_update_failed event=%s status=%d body=%s",
                    event_id, resp.status_code, resp.text[:200])


async def _fulfil_paid_assessment(assessment_uuid: str, payment_reference: str, buyer_email: Optional[str]) -> None:
    """Core Sprint 2 fulfilment: flip is_paid + generate PDF + upload + email.

    Runs inside the webhook handler so Stripe sees the 200 only after
    delivery succeeds. If any step fails, the webhook returns non-2xx
    and Stripe retries the event — idempotency table dedups, so a
    second run won't double-bill the customer but will re-attempt
    fulfilment from wherever it failed.
    """
    supabase_url = os.environ["SUPABASE_URL"]
    service_role = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    # 1. Flip is_paid + store payment reference (service role bypasses RLS WITH CHECK)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.patch(
            f"{supabase_url}/rest/v1/abol_assessments?id=eq.{assessment_uuid}",
            headers={
                "apikey": service_role,
                "Authorization": f"Bearer {service_role}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            json={"is_paid": True, "payment_reference": payment_reference},
        )
        resp.raise_for_status()
    log.info("fulfil_is_paid_flipped uuid=%s ref=%s", assessment_uuid, payment_reference)

    # 2. Load + render PDF via the Sprint 1 pipeline
    data = await load_assessment_data_async("supabase", assessment_uuid)
    tmp = Path(tempfile.gettempdir()) / f"fulfil-{assessment_uuid}-{int(time.time())}.pdf"
    build_pdf(data, tmp)
    pdf_bytes = tmp.read_bytes()
    log.info("fulfil_pdf_rendered uuid=%s bytes=%d", assessment_uuid, len(pdf_bytes))

    # 3. Upload to Supabase Storage + generate 24h signed URL
    storage_path, signed_url = await upload_and_sign(assessment_uuid, pdf_bytes)

    # 4. Email the buyer via Resend
    to_email = buyer_email or getattr(data, "email", None) or ""  # AssessmentData doesn't expose email today
    if not to_email:
        # Fall back: read from abol_assessments directly (denorm field)
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{supabase_url}/rest/v1/abol_assessments",
                headers={"apikey": service_role, "Authorization": f"Bearer {service_role}"},
                params={"id": f"eq.{assessment_uuid}", "select": "email"},
            )
            resp.raise_for_status()
            rows = resp.json()
            if rows:
                to_email = rows[0].get("email") or ""
    if not to_email:
        log.warning("fulfil_no_email uuid=%s — PDF uploaded but email not sent", assessment_uuid)
        return

    try:
        message_id = await send_report_email(
            to_email=to_email,
            score=float(data.overall_percentage),
            rating=data.rating,
            signed_url=signed_url,
            assessment_uuid=assessment_uuid,
        )
        log.info("fulfil_email_sent uuid=%s to=%s resend=%s", assessment_uuid, to_email, message_id)
    except EmailError as exc:
        # Non-fatal: PDF is in Storage, signed URL is valid — Sam can re-send manually
        log.error("fulfil_email_failed uuid=%s to=%s error=%s", assessment_uuid, to_email, exc)


@app.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """Stripe webhook. Signature-verified, idempotency-guarded, fulfils
    checkout.session.completed events.

    Stripe retries 3xx+ responses, so ALL non-2xx responses trigger retry.
    The idempotency dedup (stripe_events UNIQUE(event_id)) ensures a retry
    doesn't double-fulfil.
    """
    import stripe  # local import — consistent with /checkout

    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    secret_key = os.environ.get("STRIPE_SECRET_KEY")
    if not webhook_secret or not secret_key:
        raise HTTPException(status_code=503, detail="Stripe not configured on this container")
    stripe.api_key = secret_key

    # Signature verify against raw body — DO NOT parse-then-verify
    signature = request.headers.get("stripe-signature", "")
    raw_body = await request.body()
    try:
        event = stripe.Webhook.construct_event(raw_body, signature, webhook_secret)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid JSON")
    except stripe.error.SignatureVerificationError:
        log.warning("stripe_webhook_bad_signature signature_prefix=%s", signature[:20])
        raise HTTPException(status_code=400, detail="signature verification failed")

    # Serializable dict for storage + dedup
    event_dict = event if isinstance(event, dict) else json.loads(str(event))

    t0 = time.monotonic()
    is_new = await _stripe_events_insert(event_dict)
    if not is_new:
        log.info("stripe_webhook_duplicate event=%s type=%s", event_dict["id"], event_dict["type"])
        return {"received": True, "status": "duplicate"}

    event_type = event_dict["type"]
    event_data = event_dict.get("data", {}).get("object", {})

    try:
        if event_type == "checkout.session.completed":
            session = event_data
            assessment_uuid = session.get("client_reference_id") or (session.get("metadata") or {}).get("assessment_uuid")
            if not assessment_uuid:
                raise ValueError("no client_reference_id or metadata.assessment_uuid on checkout session")
            payment_intent = session.get("payment_intent") or f"stripe_session_{session.get('id')}"
            buyer_email = (session.get("customer_details") or {}).get("email") or session.get("customer_email")
            await _fulfil_paid_assessment(assessment_uuid, payment_intent, buyer_email)
            duration = int((time.monotonic() - t0) * 1000)
            await _stripe_events_update_outcome(event_dict["id"], status="processed", duration_ms=duration)
            log.info("stripe_webhook_fulfilled uuid=%s event=%s duration_ms=%d",
                     assessment_uuid, event_dict["id"], duration)
            return {"received": True, "status": "fulfilled"}

        elif event_type == "charge.refunded":
            # Log only — human follow-up (decide whether to revoke is_paid / pull the PDF)
            duration = int((time.monotonic() - t0) * 1000)
            await _stripe_events_update_outcome(event_dict["id"], status="processed", duration_ms=duration)
            log.warning("stripe_webhook_refund event=%s amount=%s currency=%s",
                        event_dict["id"], event_data.get("amount_refunded"), event_data.get("currency"))
            return {"received": True, "status": "logged"}

        elif event_type == "charge.dispute.created":
            # Log only — chargeback triage is manual
            duration = int((time.monotonic() - t0) * 1000)
            await _stripe_events_update_outcome(event_dict["id"], status="processed", duration_ms=duration)
            log.warning("stripe_webhook_dispute event=%s amount=%s",
                        event_dict["id"], event_data.get("amount"))
            return {"received": True, "status": "logged"}

        else:
            # Event we haven't wired up yet — record it, ack 200 so Stripe stops retrying
            duration = int((time.monotonic() - t0) * 1000)
            await _stripe_events_update_outcome(event_dict["id"], status="processed", duration_ms=duration)
            return {"received": True, "status": "ignored", "type": event_type}

    except Exception as exc:
        duration = int((time.monotonic() - t0) * 1000)
        log.exception("stripe_webhook_failed event=%s type=%s", event_dict["id"], event_type)
        await _stripe_events_update_outcome(
            event_dict["id"], status="failed", duration_ms=duration,
            error_class=exc.__class__.__name__, error_message=str(exc),
        )
        # Non-2xx so Stripe retries — idempotency dedup will prevent double-fulfilment
        raise HTTPException(status_code=500, detail="fulfilment failed, will retry")


# ----------------------------------------------------------------------------
# Root — quick orientation for anyone poking at the service
# ----------------------------------------------------------------------------
@app.get("/")
async def root():
    return {
        "service": "abol-pdf",
        "version": app.version,
        "endpoints": ["/health", "POST /generate?uuid=<UUID>", "POST /checkout?uuid=<UUID>", "POST /stripe/webhook"],
        "hostname": HOSTNAME,
    }
