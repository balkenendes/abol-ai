-- ============================================================================
-- Migration 001: Seven Pillars
-- ============================================================================
-- Purpose:
--   The original schema had 6 dimensions. The current product positions the
--   AI & Quantum Security Index around 7 pillars. Two changes are needed:
--
--     1. Rename the "cost_efficiency" enum value to "investment" — the
--        frontend and report language use "Investment & Business Case" as
--        the label. The stable question_id ("Q_CST_001" etc.) is preserved
--        so all historical answers keep their referential integrity.
--
--     2. Add a new enum value "resilience" for the 7th pillar covering
--        recovery, continuity and incident response.
--
-- Notes:
--   - PostgreSQL requires ALTER TYPE ... ADD VALUE to run OUTSIDE a
--     transaction block. psql by default does NOT wrap files in a txn,
--     so this works when executed via `psql -f`. Do not wrap in BEGIN/COMMIT.
--   - ALTER TYPE ... RENAME VALUE is Postgres 10+.
--   - The rename is SAFE: existing rows that hold 'cost_efficiency' are
--     automatically updated (it is a label change, not a data migration).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rename cost_efficiency -> investment
-- ----------------------------------------------------------------------------
ALTER TYPE dimension_type RENAME VALUE 'cost_efficiency' TO 'investment';

-- ----------------------------------------------------------------------------
-- 2. Add the new "resilience" pillar
-- ----------------------------------------------------------------------------
ALTER TYPE dimension_type ADD VALUE IF NOT EXISTS 'resilience';

-- ----------------------------------------------------------------------------
-- 3. Verification queries (run manually after migration to confirm state)
-- ----------------------------------------------------------------------------
-- SELECT unnest(enum_range(NULL::dimension_type));
--   -- expected: readiness, security_measures, dependencies, investment,
--   --           compliance, governance, resilience

-- SELECT dimension, COUNT(*) FROM questions GROUP BY dimension ORDER BY 1;
--   -- expected: the 4 questions formerly tagged cost_efficiency now appear
--   -- as "investment" automatically (Q_CST_001..004).
