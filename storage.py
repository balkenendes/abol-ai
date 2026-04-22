"""
storage.py
==========
Thin wrapper around Supabase Storage for the PDF-delivery flow.

Two entry points:

    upload_pdf(uuid, pdf_bytes)            -> storage_path
    create_signed_url(storage_path, ttl_s) -> signed_url (string)

The bucket `abol-reports` is created once via migration in Supabase
Storage (private, 10 MB limit, PDF-only MIME). See migration notes in
MIGRATIONS.md section 006.

Service-role key required for both operations; anon can't write or read
the bucket. The signed URL is the only way a buyer reaches the PDF.

Errors surface as StorageError so callers can distinguish from loader
failures in the webhook handler.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

log = logging.getLogger("storage")

BUCKET = "abol-reports"
DEFAULT_TTL_SECONDS = 24 * 60 * 60  # 24h — matches operational runbook


class StorageError(Exception):
    """Supabase Storage operation failed."""


def _client_config() -> tuple[str, str]:
    """Return (url, service_role) from env or raise StorageError."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise StorageError("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required")
    return url, key


async def upload_pdf(assessment_uuid: str, pdf_bytes: bytes) -> str:
    """Upload the PDF to the private `abol-reports` bucket. Returns the
    storage path (e.g. `reports/<uuid>.pdf`) for later signing.

    Uses upsert=true so repeat deliveries (e.g. Stripe replaying the
    webhook after a failure) overwrite cleanly.

    Raises StorageError on any upload failure.
    """
    url, key = _client_config()
    storage_path = f"reports/{assessment_uuid}.pdf"
    endpoint = f"{url}/storage/v1/object/{BUCKET}/{storage_path}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            endpoint,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/pdf",
                "x-upsert": "true",
            },
            content=pdf_bytes,
        )
    if resp.status_code >= 300:
        raise StorageError(
            f"Storage upload failed {resp.status_code}: {resp.text[:200]}"
        )
    log.info("storage_upload_ok uuid=%s bytes=%d path=%s", assessment_uuid, len(pdf_bytes), storage_path)
    return storage_path


async def create_signed_url(storage_path: str, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> str:
    """Return a time-limited signed URL for a stored object.

    The URL is single-purpose: it grants GET access to this one object
    for `ttl_seconds`. After TTL expires the URL 400s; regenerate if
    the buyer needs a fresh link.
    """
    url, key = _client_config()
    endpoint = f"{url}/storage/v1/object/sign/{BUCKET}/{storage_path}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            endpoint,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={"expiresIn": ttl_seconds},
        )
    if resp.status_code >= 300:
        raise StorageError(
            f"Storage sign failed {resp.status_code}: {resp.text[:200]}"
        )
    payload = resp.json()
    # Supabase returns `{ "signedURL": "/object/sign/..." }` — prepend host.
    signed_path = payload.get("signedURL") or payload.get("signedUrl")
    if not signed_path:
        raise StorageError(f"Storage sign returned no signedURL: {payload}")
    return f"{url}/storage/v1{signed_path}"


async def upload_and_sign(assessment_uuid: str, pdf_bytes: bytes, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> tuple[str, str]:
    """Convenience: upload + sign in one call. Returns (storage_path, signed_url)."""
    storage_path = await upload_pdf(assessment_uuid, pdf_bytes)
    signed_url = await create_signed_url(storage_path, ttl_seconds)
    return storage_path, signed_url
