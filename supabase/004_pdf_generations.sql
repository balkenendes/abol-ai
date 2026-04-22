-- =============================================================================
-- Migration 004 — pdf_generations observability table
-- =============================================================================
-- Context:
--   Once the Fly.io PDF container goes live (Sprint 1 todo #12), every
--   PDF generation attempt must be logged — both successful and failed —
--   so Sam can debug fulfillment errors post-hoc without reading Fly.io
--   stdout. This is the operational floor per the Sprint 1 eng review
--   (Observability & Debuggability, Section 8 of the plan).
--
--   One row per generation attempt. Service-role only (no anon access).
--   Small table, append-only, bounded cardinality (one row per paid
--   report, so low tens per day at most during Sprint 2 launch window).
--
-- Apply:
--   npx supabase db query --linked -f supabase/004_pdf_generations.sql
--
-- Verification after apply:
--   1. \d pdf_generations (schema matches)
--   2. GRANT list shows service_role INSERT/SELECT, anon nothing
--   3. Insert a sentinel row, confirm it comes back on SELECT
--
-- Rollback: DROP TABLE pdf_generations;
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS pdf_generations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id     UUID NOT NULL REFERENCES abol_assessments(id) ON DELETE CASCADE,

    -- Lifecycle
    started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at      TIMESTAMPTZ,
    duration_ms       INTEGER,
    status            TEXT NOT NULL CHECK (status IN ('started', 'success', 'failed')),

    -- Failure context (populated only on status='failed')
    error_class       TEXT,
    error_message     TEXT,

    -- Output metrics (populated only on status='success')
    pages_generated   INTEGER,
    bytes             INTEGER,

    -- Path metadata
    anthropic_used    BOOLEAN,                -- true = LLM exec summary, false = rule-based fallback
    source            TEXT CHECK (source IN ('supabase', 'postgres', 'demo')),

    -- Storage
    storage_path      TEXT,                   -- e.g. 'reports/<uuid>.pdf' in Supabase Storage
    signed_url        TEXT,                   -- signed URL returned to caller (24h TTL, not persisted past generation)

    -- Debug / trace
    container_hostname TEXT,                  -- Fly.io region+machine id for cross-machine debugging
    trace_id          TEXT                    -- optional, for future distributed tracing
);

COMMENT ON TABLE pdf_generations IS
    'Operational log: one row per PDF generation attempt. Populated by the '
    'Fly.io abol-pdf container. Service-role only (anon cannot read, insert, '
    'update, or delete). Referenced by runbooks in CLAUDE.md for fulfillment '
    'error triage.';

CREATE INDEX IF NOT EXISTS idx_pdf_gen_assessment
    ON pdf_generations(assessment_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_pdf_gen_status_time
    ON pdf_generations(status, started_at DESC);

-- Lock down: service role is the only writer / reader.
ALTER TABLE pdf_generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pdf_generations FROM anon;
REVOKE ALL ON pdf_generations FROM authenticated;
-- No policies defined for anon/authenticated -> all access denied by RLS.
-- Service role bypasses RLS, so the container still writes freely.

COMMIT;
