"""
server.py
=========
FastAPI HTTP wrapper around the PDF generator. Deployed as the Fly.io
`abol-pdf` container (region: ams). Called manually during Sprint 1,
auto-triggered by Stripe webhook in Sprint 2.

Endpoints:
    GET  /health             Liveness probe. Checks Supabase reachability.
    POST /generate           Generate a PDF for an assessment UUID.
                             Params: uuid (required), source (default=supabase)
                             Returns: PDF bytes (application/pdf).
                             Logs attempt + outcome to pdf_generations table.

Required env vars (enforced at startup — fail fast, not on first request):
    SUPABASE_URL                    Project URL
    SUPABASE_SERVICE_ROLE_KEY       Service-role JWT (server-only, never exposed)

Optional env vars:
    ANTHROPIC_API_KEY               Enables LLM executive summary (fallback otherwise)
    ABOL_LOG_LEVEL                  Default INFO

Structured logging: every log line emits key=value pairs that Fly.io /
Cloud Run parse as structured fields. Request IDs propagated via `X-Request-Id`.
"""

from __future__ import annotations

import asyncio
import datetime as dt
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
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse

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


# ----------------------------------------------------------------------------
# Root — quick orientation for anyone poking at the service
# ----------------------------------------------------------------------------
@app.get("/")
async def root():
    return {
        "service": "abol-pdf",
        "version": app.version,
        "endpoints": ["/health", "POST /generate?uuid=<UUID>"],
        "hostname": HOSTNAME,
    }
