# Schema Migrations

All schema changes applied on top of the original `schema.sql` + `seed_questions.sql` baseline.

Run migrations in numerical order via `psql`:

```bash
psql "$DATABASE_URL" -f migrations/001_seven_pillars.sql
psql "$DATABASE_URL" -f migrations/002_resilience_questions.sql
```

---

## 001 — Seven Pillars

**File:** [`migrations/001_seven_pillars.sql`](migrations/001_seven_pillars.sql)

**Purpose:** Align the database enum with the current product positioning,
which uses seven pillars (instead of the original six dimensions).

**Changes:**

1. **Renamed** the enum value `cost_efficiency` → `investment`.
   - The frontend and report now consistently use "Investment & Business Case"
     as the pillar label. The stable `question_id` values (`Q_CST_001` etc.)
     are preserved so all historical answers keep their referential integrity.
2. **Added** the new enum value `resilience` to `dimension_type`, covering
   recovery, continuity and incident-response capabilities.

**Why the rename is safe:**
`ALTER TYPE ... RENAME VALUE` is a label-only change in PostgreSQL. Existing
rows that hold the old label are transparently remapped — no data migration
is required, no row locking beyond the brief enum rewrite.

**Why this must run outside a transaction:**
`ALTER TYPE ... ADD VALUE` cannot run in a transaction block on any PostgreSQL
version. `psql -f` does not wrap files in a transaction by default, so the
file works as-is. Do not wrap in `BEGIN`/`COMMIT`.

**Requires:** PostgreSQL 10+ (for `ALTER TYPE ... RENAME VALUE`).

**Verification:**
```sql
-- 1. Enum includes all 7 values
SELECT unnest(enum_range(NULL::dimension_type));

-- 2. Pre-existing cost_efficiency questions now show as investment
SELECT dimension, COUNT(*) FROM questions GROUP BY dimension ORDER BY 1;
```

---

## 002 — Resilience Questions

**File:** [`migrations/002_resilience_questions.sql`](migrations/002_resilience_questions.sql)

**Purpose:** Seed the six questions for the new `resilience` pillar.
Mirrors the structure of `seed_questions.sql` (stable question_id →
versioned content → per-sector weights).

**Question set:**

| ID | Subcategory | Future-proofing |
|---|---|---|
| Q_RES_001 | `ransomware_recovery_drill` | No |
| Q_RES_002 | `tested_recovery_time_objective` | No |
| Q_RES_003 | `ai_incident_response_playbook` | Yes |
| Q_RES_004 | `offline_immutable_backups` | No |
| Q_RES_005 | `incident_response_retainer` | No |
| Q_RES_006 | `business_impact_analysis` | No |

Question text, help text, and all answer options with scores are taken
verbatim from the authoritative definitions in `app.html` (the React
prototype that defines the scoring model).

**Sector weights (matching `app.html` line 765):**

| Sector | Weight | Rationale |
|---|---|---|
| SMB | 1.4× | Resilience gap more catastrophic for smaller teams |
| Corporate | 1.5× | Larger org: more interdependencies amplify recovery complexity |
| Financial Services | 2.0× | DORA mandates tested resilience with short recovery windows |

**Requires:** Migration 001 must be applied first (so the `resilience` enum
value exists).

**Idempotency:** The question inserts use `ON CONFLICT ... DO NOTHING` on
the `questions` table. Re-running the migration is safe; however, the
`question_versions` inserts are not idempotent — if you need to re-seed,
truncate and reload or write a more careful upsert.

**Verification:**
```sql
-- 1. All 6 questions registered as resilience
SELECT question_id, subcategory FROM questions
  WHERE dimension = 'resilience' ORDER BY question_id;

-- 2. Sector weights applied for each question version
SELECT qv.question_id, sw.sector, sw.weight
  FROM sector_weights sw
  JOIN question_versions qv ON qv.id = sw.question_version_id
  WHERE qv.question_id LIKE 'Q_RES_%'
  ORDER BY qv.question_id, sw.sector;
```

---

## Application-side changes paired with these migrations

- `main.py` — `Dimension` enum renamed from `cost_efficiency` → `investment`
  and added the `resilience` value. This keeps the FastAPI model in sync
  with the DB enum.
- `report_design.py` — `DIM_ORDER`, `DIM_COLORS`, `DIM_LABELS`,
  `DIM_DESCRIPTIONS` are already seven-pillar aware.

Any further enum edits should follow the same pattern: a numbered migration
file in `migrations/`, a paired update to the Python `Dimension` enum,
and a note added to this document.

---

## 003 — RLS tightening on `abol_assessments`

**File:** [`supabase/003_rls_tighten.sql`](supabase/003_rls_tighten.sql)

**Purpose:** Close a P0 PII leak. Original `supabase_setup.sql` used
`USING(true)` on both SELECT and UPDATE policies, meaning any holder of
the public anon key could read every buyer's email, org name, job
title, and answers, AND could flip `is_paid=true` without paying.

**Changes:**

1. **Dropped** permissive SELECT + UPDATE policies.
2. **Revoked** direct SELECT on `abol_assessments` from anon.
3. **Created** `abol_public_scores` view (SECURITY DEFINER, PG 15+
   `security_invoker=false`) projecting only non-PII score fields
   (`id`, `sector`, `employee_bucket`, `countries`, `dimension_scores`,
   `overall_percentage`, `overall_rating`, `status`, timestamps) from
   completed assessments. Granted SELECT on the view to anon +
   authenticated.
4. **Added** tightened anon UPDATE policy: only rows with
   `status='in_progress'`, and WITH CHECK blocks any write that would
   set `is_paid=true` or touch `payment_reference`.
5. **Left** anon INSERT policy untouched (needed to start a scan).

**Application-side changes:**

- `app.html:getPeerBenchmark` — switched from SELECT on `abol_assessments`
  to SELECT on `abol_public_scores`. Same columns available, PII stripped.

**Verification (all assert pass):**

- `curl anon /rest/v1/abol_assessments?select=email` → 42501 permission denied
- `curl anon /rest/v1/abol_public_scores?select=overall_rating` → returns data, no PII
- `curl anon PATCH is_paid=true` → 42501 permission denied
- `bash tests/smoke.sh` includes these three assertions as permanent regression tests.

**Rollback:** `DOWN` block is documented inline in the migration file.
Restores the original permissive policies.

---

## 004 — `pdf_generations` observability table

**File:** [`supabase/004_pdf_generations.sql`](supabase/004_pdf_generations.sql)

**Purpose:** Log every PDF generation attempt (successful or failed) for
post-hoc debugging of the Fly.io PDF container. Without this, operators
have no cross-machine record of fulfillment outcomes.

**Schema:**

```
pdf_generations (id UUID PK, assessment_id UUID FK,
  started_at, completed_at, duration_ms, status, error_class,
  error_message, pages_generated, bytes, anthropic_used, source,
  storage_path, signed_url, container_hostname, trace_id)
```

Two indexes: `(assessment_id, started_at DESC)` for per-assessment
triage, `(status, started_at DESC)` for "show me today's failures."

**Access model:**

- RLS enabled, no policies defined for anon/authenticated.
- ALL privileges REVOKED from anon + authenticated (belt and suspenders
  — no policy + no grant = nothing gets through).
- Service role (used by the Fly.io container) bypasses RLS, so it
  writes freely.

**Application-side changes:**

- `server.py:_log_generation()` writes one "started" row per request,
  then one outcome row (success/failed). Log failures are WARNINGS, not
  fatal — observability is best-effort, never blocks the user response.

**Verification:**

- `curl anon /rest/v1/pdf_generations` → 42501 permission denied ✓
- Trigger a `/generate` call → row with status='success', pages_generated=43,
  duration_ms ≈ 1400 ✓

**Rollback:** `DROP TABLE pdf_generations;` (no production dependency
yet; table is append-only log).
