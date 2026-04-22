-- =============================================================================
-- Migration 005 — stripe_events idempotency table
-- =============================================================================
-- Context:
--   Stripe retries webhooks up to 3 days until they receive a 2xx. Without a
--   dedup guard, a single payment can trigger the PDF gen + email flow multiple
--   times. The common pattern (Stripe-recommended) is a unique table keyed on
--   `event.id` that we INSERT before processing; ON CONFLICT DO NOTHING means
--   the second delivery is a no-op.
--
-- Access model:
--   Service-role only. Same pattern as pdf_generations. Anon and authenticated
--   have no business touching this.
--
-- Usage (server.py Stripe webhook handler):
--   INSERT INTO stripe_events (event_id, event_type, ...) VALUES (...)
--     ON CONFLICT (event_id) DO NOTHING RETURNING id;
--   If nothing returned: the event was already processed; respond 200 + exit.
--
-- Apply:
--   npx supabase db query --linked -f supabase/005_stripe_events.sql
--
-- Rollback: DROP TABLE stripe_events;
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS stripe_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id          TEXT NOT NULL UNIQUE,                       -- Stripe event.id, e.g. "evt_1OXyzABC"
    event_type        TEXT NOT NULL,                              -- e.g. "checkout.session.completed", "charge.refunded"
    assessment_id     UUID REFERENCES abol_assessments(id) ON DELETE SET NULL,
    payment_intent_id TEXT,                                       -- Stripe pi_xxx, for joining to payouts/refunds
    amount_cents      INTEGER,                                    -- Stripe reports integer cents
    currency          TEXT,                                       -- "eur" etc.
    livemode          BOOLEAN NOT NULL DEFAULT false,             -- true = production, false = test
    status            TEXT NOT NULL CHECK (status IN ('received', 'processed', 'failed')),

    -- Lifecycle
    received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at      TIMESTAMPTZ,
    duration_ms       INTEGER,

    -- Failure context
    error_class       TEXT,
    error_message     TEXT,

    -- Raw event body (JSONB) — useful for forensic replay. Bounded size (Stripe
    -- events are typically 1-5KB); if they grow unexpectedly, split to a side
    -- table.
    raw_event         JSONB
);

COMMENT ON TABLE stripe_events IS
    'Stripe webhook idempotency log. UNIQUE(event_id) makes the INSERT the '
    'dedup check. Service-role only. Referenced by runbooks for refund + '
    'chargeback triage.';

CREATE INDEX IF NOT EXISTS idx_stripe_events_assessment
    ON stripe_events(assessment_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type_status
    ON stripe_events(event_type, status, received_at DESC);

-- Lock down: anon + authenticated have nothing here.
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stripe_events FROM anon;
REVOKE ALL ON stripe_events FROM authenticated;
-- No policies defined for anon/authenticated -> RLS denies everything.
-- Service role bypasses RLS (it's what the Fly.io container uses).

COMMIT;
