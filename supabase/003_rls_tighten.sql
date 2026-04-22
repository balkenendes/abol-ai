-- =============================================================================
-- Migration 003 — Tighten RLS on abol_assessments
-- =============================================================================
-- Context:
--   The original supabase_setup.sql used USING(true) on the SELECT and UPDATE
--   RLS policies. That meant the anon role (public key embedded in app.html)
--   could SELECT every row of abol_assessments (reading every buyer's email,
--   organization, job title, and full answer set) and could UPDATE any row to
--   set is_paid=true without paying. Both were P0 issues that had to land
--   before any payment integration.
--
--   This migration:
--     1. Drops the two permissive policies.
--     2. Revokes direct SELECT on abol_assessments from anon.
--     3. Creates abol_public_scores — a SECURITY DEFINER view that exposes
--        only non-PII score data for completed assessments. Grants SELECT to
--        anon + authenticated. This is the only way the frontend reads back
--        results after the new migration.
--     4. Replaces the anon UPDATE policy with a tightened version that:
--          - only matches rows where status='in_progress' (USING)
--          - rejects any write that would set is_paid=true or change
--            payment_reference (WITH CHECK)
--          - allows status to advance from 'in_progress' to 'completed'
--     5. Leaves the anon INSERT policy intact (needed to start a scan).
--     6. Leaves the service_role unaffected (it bypasses RLS entirely — Sam
--        uses it for manual is_paid flips until Sprint 2 webhook lands, and
--        the Fly.io PDF container will use it for data loads).
--
-- Frontend dependency:
--   app.html must switch its results-page SELECT from abol_assessments to
--   abol_public_scores. That change ships in the same deploy as this
--   migration — order doesn't matter, they are independent on the wire, but
--   they must both land the same day. Ships with CLAUDE.md update.
--
-- Rollback:
--   To revert this migration, run the "DOWN" section at the bottom of this
--   file. It restores the original permissive policies from supabase_setup.sql
--   (it does NOT drop the view — that's harmless to keep around).
--
-- Apply (run one of these):
--   psql "$DATABASE_URL" -f supabase/003_rls_tighten.sql
--   npx supabase db query --linked < supabase/003_rls_tighten.sql
--
-- Verification after apply:
--   1. As anon (using SUPABASE_ANON_KEY), SELECT from abol_assessments must
--      return 0 rows or a permission error. PII must not leak.
--   2. As anon, SELECT id, overall_rating FROM abol_public_scores LIMIT 1
--      must return score data (no PII).
--   3. As anon, UPDATE abol_assessments SET is_paid=true WHERE id=<uuid>
--      must fail with an RLS violation or silently affect 0 rows.
--   4. As anon, the frontend's normal flow (insert on scan start, update
--      answers during scan, update scores + status='completed' on finish)
--      must still work.
-- =============================================================================

BEGIN;

-- 1. Drop old permissive policies -------------------------------------------

DROP POLICY IF EXISTS "Read own assessment by ID" ON abol_assessments;
DROP POLICY IF EXISTS "Update own assessment by ID" ON abol_assessments;

-- 2. Revoke direct SELECT on the base table from anon -----------------------
-- Authenticated role is left alone for now; service_role bypasses RLS.

REVOKE SELECT ON abol_assessments FROM anon;

-- 3. Public scores view — non-PII projection, completed rows only -----------
-- SECURITY DEFINER semantics via security_invoker=false (PG 15+). The view
-- runs with the privileges of its owner (postgres/supabase_admin), so anon
-- can SELECT from it even though they have no SELECT on the base table.

CREATE OR REPLACE VIEW abol_public_scores
WITH (security_invoker = false) AS
SELECT
    id,
    created_at,
    completed_at,
    sector,
    employee_bucket,
    countries,
    dimension_scores,
    overall_percentage,
    overall_rating,
    status
FROM abol_assessments
WHERE status = 'completed';

COMMENT ON VIEW abol_public_scores IS
  'Non-PII projection of completed assessments. Exposes score fields, sector, '
  'employee bucket, and country set. Excludes: email, email_hash, organization, '
  'job_title, revenue, answers (which may contain sensitive operational detail), '
  'is_paid, payment_reference. Used by the frontend results page and by any '
  'anonymous benchmark aggregation. Anon and authenticated may SELECT.';

GRANT SELECT ON abol_public_scores TO anon;
GRANT SELECT ON abol_public_scores TO authenticated;

-- 4. Tightened UPDATE policy for anon ---------------------------------------
-- USING gates WHICH rows anon can target (only in-progress rows).
-- WITH CHECK gates what the row is allowed to LOOK LIKE after the update:
--   - status may advance in_progress -> completed, but nothing else
--   - is_paid must stay false
--   - payment_reference must stay null
-- This is the guardrail that makes Stripe integration meaningful. Without
-- it, anyone could flip is_paid=true client-side and trigger PDF delivery
-- without paying.

CREATE POLICY "Anon updates own in-progress assessment only"
    ON abol_assessments
    FOR UPDATE
    TO anon
    USING (status = 'in_progress')
    WITH CHECK (
        status IN ('in_progress', 'completed')
        AND is_paid = false
        AND payment_reference IS NULL
    );

-- 5. Anon INSERT stays as-is (from supabase_setup.sql) ----------------------
-- Kept here as a comment so the full anon permission surface is visible in
-- one place:
--   CREATE POLICY "Anyone can create assessments"
--     ON abol_assessments FOR INSERT WITH CHECK (true);

COMMIT;

-- =============================================================================
-- DOWN (rollback) — uncomment and run if you need to revert
-- =============================================================================
-- BEGIN;
--   DROP POLICY IF EXISTS "Anon updates own in-progress assessment only" ON abol_assessments;
--   DROP VIEW IF EXISTS abol_public_scores;
--   GRANT SELECT ON abol_assessments TO anon;
--   CREATE POLICY "Read own assessment by ID"
--     ON abol_assessments FOR SELECT USING (true);
--   CREATE POLICY "Update own assessment by ID"
--     ON abol_assessments FOR UPDATE USING (true);
-- COMMIT;
