-- =============================================================================
-- Migration 007 — waitlist table for whitepaper / future report signups
-- =============================================================================
-- Context:
--   The "Send me the PDF" form on the landing throws emails in the void.
--   This table captures them. Anon can INSERT (submit email from landing).
--   Service role can SELECT (Sam exports to send updates when a whitepaper
--   actually ships).
--
-- Same access pattern as abol_assessments (anon INSERT, no anon SELECT).
--
-- Apply:
--   npx supabase db query --linked -f supabase/007_waitlist.sql
--
-- Rollback: DROP TABLE waitlist;
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS waitlist (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL,
    email_hash      TEXT,                              -- SHA-256 for deduplication lookups without storing plaintext twice
    signup_source   TEXT NOT NULL DEFAULT 'whitepaper_landing',  -- where on the site they signed up
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notified_at     TIMESTAMPTZ,                       -- set when we actually send the report
    user_agent_hash TEXT,                              -- SHA-256 hashed UA for fraud detection without tracking
    referrer        TEXT                               -- document.referrer, truncated to 200 chars
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email
    ON waitlist(email);

CREATE INDEX IF NOT EXISTS idx_waitlist_created
    ON waitlist(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_waitlist_unnotified
    ON waitlist(created_at) WHERE notified_at IS NULL;

COMMENT ON TABLE waitlist IS
    'Email signups from the landing "Send me the PDF" form. Anon may INSERT. '
    'Service role reads to export for sends. Anon has no SELECT. No policy '
    'for authenticated role.';

-- Enable RLS
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Anon: INSERT only. No SELECT, no UPDATE, no DELETE.
CREATE POLICY "Anon can add themselves to waitlist"
    ON waitlist FOR INSERT
    TO anon
    WITH CHECK (true);

-- No SELECT / UPDATE / DELETE policies for anon or authenticated.
-- Service role bypasses RLS and is what Sam uses to export.

-- Make sure anon has the table-level INSERT grant (Supabase quirk per CLAUDE.md)
GRANT INSERT ON waitlist TO anon;
REVOKE SELECT, UPDATE, DELETE ON waitlist FROM anon;
REVOKE ALL ON waitlist FROM authenticated;

COMMIT;
