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
