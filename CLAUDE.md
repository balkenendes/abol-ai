# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ABOL.ai is the **AI & Quantum Security Index** — a freemium cyber readiness benchmark for European organizations. The product positions itself as a tool that gives IT/security directors a quantified case for cyber budget. Three tiers: free Scan (€0), Full Report (€425, 40+ page PDF), annual Advisory (€6,845 — recurring monthly meeting with IT/security directors).

## Stack

- **Frontend:** `app.html` — single-file React 18 + Babel standalone via CDN, no build step. This is the real product UI (landing + form + 42-question quiz + results + sample report). `index.html` is a build artifact (`deploy.sh` copies `app.html` → `index.html`) — never edit `index.html` directly.
- **Live backend (production):** Supabase (Postgres + RLS) — project ref `cnoudltgcxeyzfelvbuv`. `app.html` talks directly to Supabase via `@supabase/supabase-js` CDN. Single table `abol_assessments` with JSONB answers + computed scores. This is what runs on abol.ai today.
- **Reference backend (local / PDF pipeline):** FastAPI (Python 3.11+) in `main.py` with raw SQL via asyncpg against local PostgreSQL 15+. Used by the PDF generator and as the scoring reference. Not currently deployed.
- **PDF generator:** `generate_report.py` CLI + 5 supporting Python modules using ReportLab (no matplotlib). Anthropic SDK used for one LLM call (executive summary) with rule-based fallback. Currently reads from local Postgres, not Supabase.
- **No tests, no linter, no CI/CD** configured.

## Commands

```bash
# Install deps (includes reportlab, anthropic)
pip install -r requirements.txt

# Local Postgres setup (needed for the FastAPI backend + real-data PDF generation)
createdb abol
psql abol -f schema.sql
psql abol -f seed_questions.sql
psql abol -f migrations/001_seven_pillars.sql      # rename + add resilience
psql abol -f migrations/002_resilience_questions.sql

# Run dev backend (local Postgres, not Supabase)
export DATABASE_URL="postgresql://localhost/abol"
uvicorn main:app --reload                          # http://localhost:8000/docs

# View frontend (no build, just open). app.html writes to Supabase live — be aware.
start chrome app.html

# Generate a PDF report (reads from local Postgres)
python generate_report.py <assessment_uuid>
python generate_report.py --demo                   # works without DB or API key

# Supabase admin (requires SUPABASE_ACCESS_TOKEN env var)
export SUPABASE_ACCESS_TOKEN="sbp_..."
npx supabase db query --linked "SELECT count(*) FROM abol_assessments;"
# NOTE: multi-line SQL via `supabase db query` fails with "status 400" — run statements one at a time.

# Deploy to production (abol.ai)
bash deploy.sh
```

## Architecture

### File Layout

```
.
├── app.html                            real product frontend (~3300 lines) — writes to Supabase
├── index.html                          build artifact — `deploy.sh` overwrites from app.html
├── supabase_setup.sql                  Supabase: abol_assessments table + RLS (run once via SQL editor)
├── deploy.sh                           `cp app.html index.html && npx vercel deploy --prod`
├── vercel.json                         static-site config, framework:null (stop Next.js auto-detect)
├── main.py                             FastAPI backend (local Postgres, not deployed)
├── schema.sql                          local PostgreSQL DDL (enums, tables, views)
├── seed_questions.sql                  30 core + 3 branch questions (local Postgres only)
├── migrations/
│   ├── 001_seven_pillars.sql           cost_efficiency → investment, + resilience
│   └── 002_resilience_questions.sql    6 Q_RES_* questions + sector weights
├── generate_report.py                  PDF CLI (DB loader, demo mode, page templates)
├── report_design.py                    color/font/typography tokens
├── report_charts.py                    IBCS chart primitives (bar, radar, ring, gantt, gap, priority card)
├── report_sections.py                  11 section builders (cover → back cover)
├── report_llm.py                       Anthropic SDK call + rule-based fallback
├── external_benchmarks.py              Thales 2026 + IBM 2024 constants
├── fonts/                              auto-downloaded Manrope + JetBrains Mono TTFs
├── reports/                            default PDF output directory
├── requirements.txt
├── README.md
├── MIGRATIONS.md
└── CLAUDE.md
```

### Seven Pillars (was six)

The product was originally six dimensions; migration `001_seven_pillars.sql` renamed `cost_efficiency` → `investment` and added `resilience`. Always assume seven pillars now: readiness, security_measures, dependencies, investment, compliance, governance, resilience. The Python `Dimension` enum in `main.py` and the `DIM_*` constants in `report_design.py` are aligned.

### Question versioning (critical design constraint)

Historical comparability is the core invariant:
- `question_id` (e.g. `Q_RDY_002`) is **stable forever** — never renamed or reused.
- Wording / options / scores live in `question_versions`. Editing a question = inserting a new version row, retiring the old one.
- Answers reference both `question_id` AND `question_version_id`, and scores are frozen at answer time (`weighted_score` and `sector_weight_applied` are stored, never recomputed).
- The `active_questions` view joins non-deprecated questions with non-retired versions.

When changing the schema, write a numbered file in `migrations/`, paired with any necessary update to the Python `Dimension` enum, and a note in `MIGRATIONS.md`. Do not edit `schema.sql` or `seed_questions.sql` after they've been seeded.

### Scoring system

- Each option has a 0-100 raw score. At answer time, raw × sector weight is stored as `weighted_score`.
- Pillar percentage = sum(weighted scores) / sum(max × applied weights) × 100.
- Overall percentage = same aggregation across all pillars.
- Rating thresholds: ≥85 Leader, ≥70 Strong, ≥50 Fair, ≥30 At Risk, <30 Critical.
- Top-10 actions = answers with `raw_score < 50`, ranked by `(100 − raw_score) × sector_weight_applied DESC LIMIT 10`.
- `is_future_proofing=true` questions deliberately make near-perfect scores rare.

### Sector weights (current)

| Pillar | SMB | Corporate | FinServ |
|---|---|---|---|
| Readiness | 1.0 | 1.5 | 2.5 |
| Security Measures | 1.5 | 1.5 | 1.5 |
| Dependencies | 1.0 | 1.8 | 2.2 |
| Investment | 1.3 | 1.0 | 1.2 |
| Compliance | 1.2 | 2.0 | 3.0 |
| Governance | 1.0 | 1.8 | 2.5 |
| Resilience | 1.4 | 1.5 | 2.0 |

### Adaptive branching

Branch questions have `is_core=false`, a `parent_question_id`, and a `branch_condition` JSONB (e.g. `{"answer_in": ["no_plan", "planned_2028_2030"]}`). When a core answer matches, the branch is returned in `next_questions`.

### API endpoints (in `main.py`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/assessments/start` | Create assessment, return core questions |
| POST | `/api/assessments/answer` | Submit answer, get branch questions + progress |
| POST | `/api/assessments/complete` | Finalize, compute scores (free-tier summary) |
| GET | `/api/assessments/{id}/full` | Full paid report data (402 if unpaid) |
| POST | `/api/assessments/{id}/mark-paid` | Stripe webhook target |
| GET | `/api/benchmarks/{sector}` | Anonymized sector benchmarks |
| GET | `/api/health` | DB connectivity check |

### PDF generator architecture

- `generate_report.py` is a CLI: `python generate_report.py <uuid>` or `--demo`.
- DB loading is `_load_assessment_data_async()` — single function that fetches assessment, organization, dimension scores, answers, peer percentiles, and prior assessments.
- PDF assembly is split: `report_design.py` (tokens), `report_charts.py` (chart Drawings/Flowables), `report_sections.py` (one function per section, returns list of Flowables), `generate_report.py` (BaseDocTemplate with two PageTemplates: cover + content).
- LLM call lives in `report_llm.py`. Always wrapped in try/except — failures fall back to `build_fallback_summary()`. The CLI never crashes because of LLM issues.
- Fonts (Manrope + JetBrains Mono TTFs) auto-download from GitHub mirrors on first run into `./fonts/`. If download fails, the generator falls back to Helvetica/Courier and logs a warning.
- `--demo` produces a 43-page PDF using a hardcoded financial-services tier-1 bank profile — the only way to test the pipeline without a database.

### IBCS chart conventions (followed throughout the PDF and the dashboard mockups in `app.html`)

- Solid dark fill = Actual / your score
- Outlined / no fill (medium gray) = Benchmark / peer median
- Hatched diagonal pattern = Plan / target / top quartile
- Red = unfavorable variance, green = favorable variance — used **only** for variances, never for level coloring
- Sharp rectangles (no rounded corners on bars), tabular numerals for all numbers
- Variance always shown signed (`+18` / `−18`) using Unicode minus

### Supabase integration (live on abol.ai)

- **Project ref:** `cnoudltgcxeyzfelvbuv` — URL `https://cnoudltgcxeyzfelvbuv.supabase.co`.
- **Single table:** `abol_assessments` — UUID PK, JSONB `answers`, JSONB `dimension_scores`, `overall_percentage`, `overall_rating`, `status` (`in_progress` | `completed`), organization profile fields, `email_hash`. See `supabase_setup.sql` for DDL.
- **Frontend wiring:** `app.html` loads `@supabase/supabase-js` from CDN. Anon key is embedded client-side (it is public by design; RLS gates writes). Three helpers: `saveAssessment()` on form submit → row with `status='in_progress'`, `updateAnswers()` per quiz answer → merged into `answers` JSONB, `completeAssessment()` on finish → sets scores + `status='completed'`.
- **RLS + GRANTs:** RLS policies allow anon INSERT/UPDATE/SELECT, **but RLS policies alone are not enough** — the `anon` role also needs table-level GRANTs:
  ```sql
  GRANT ALL ON abol_assessments TO anon;
  GRANT ALL ON abol_assessments TO authenticated;
  ```
  This is the single most common "data silently not saving" bug on this project. If you add a new Supabase table, remember to GRANT as well as create policies.
- **Scoring lives in the frontend** for the Supabase path — `app.html` computes dimension scores + overall before writing. The Python scoring in `main.py` is the reference but is NOT what produces the numbers stored in Supabase. Keep the two aligned if you touch one.

### Privacy model

- Emails SHA-256 hashed before storage, never plaintext.
- IP and user-agent hashed for fraud detection.
- Organization name is optional.
- Peer comparison uses percentiles only — no individual scores exposed.
- Answers use `ON CONFLICT ... DO UPDATE` so re-answering overwrites (no duplicate answers).

## Pricing reference (currently shown on the landing page)

| Tier | Price | What it is |
|---|---|---|
| Scan | €0 | Headline score + rating + peer benchmark percentile |
| Full report | €425 one-time | 40+ page board-ready PDF, top-10 actions with euro impact, 3-year roadmap |
| Advisory | €6,845 / year | Recurring monthly meeting with IT/security directors + everything in Full |

If the pricing in `app.html` (search for the `Scan` / `Full report` / `Advisory` array) drifts from this table, update both.

## Validation (no test framework — use these)

After any schema, scoring, or report change, run these in order. They are the project's de-facto regression suite:

```bash
# 1. Python syntax + import check
python -m py_compile main.py generate_report.py report_design.py \
    report_charts.py report_sections.py report_llm.py external_benchmarks.py
python -c "import generate_report, report_design, report_charts, report_sections, external_benchmarks, report_llm"

# 2. PDF pipeline smoke test (no DB or API key needed)
python generate_report.py --demo
# Expect: ~43 pages, ~190 KB, opens cleanly in a PDF viewer.

# 3. SQL parse check (when adding migrations)
python -c "import sqlglot; sqlglot.parse(open('migrations/<file>.sql').read(), dialect='postgres')"
```

## Things that are NOT yet wired up (known gaps)

**Sprint 1 closed these (2026-04-22):**
- ~~Peer benchmark bars on the Results page~~ — live. IBCS-style (solid/your score, vertical line/median, dashed/P75) with per-row source citation. Data from `PEER_DISTRIBUTIONS` (JS, `app.html`) mirroring Python `external_benchmarks.PEER_DISTRIBUTIONS`.
- ~~PDF generator reads Supabase~~ — live via `report_loaders._load_from_supabase_async`. Score-mismatch verification against `main.py` scoring built in; logs CRITICAL on drift.
- ~~Observability~~ — `pdf_generations` table logs every PDF gen attempt (start + outcome). Service-role only.

**Sprint 2 remaining:**
- **Stripe Checkout** — wire the €425 button to a Checkout Session with `client_reference_id=<assessment_uuid>`.
- **Stripe webhook** — server-side function flips `is_paid=true` + `payment_reference` + triggers the Fly.io container.
- **Resend email delivery** — signed URL (24h TTL) to the buyer's email.
- **Webhook idempotency guard** — dedup table keyed on `stripe_event_id` to prevent duplicate PDF gens on Stripe retries.

**Sprint 3+:**
- `main.py` FastAPI backend retirement (kept as scoring reference only, never deployed).
- Continuous tier (€1,995/yr) — Stripe Subscriptions + quarterly benchmark refresh.
- Institutional data licensing pipeline.

## Sprint 1 architecture (reference)

```
  Browser (abol.ai)                Fly.io abol-pdf container
  ─────────────────                ─────────────────────────
  app.html scan                    server.py FastAPI
  ├─ Supabase INSERT row            ├─ /health  (Supabase ping)
  ├─ Supabase UPDATE answers       └─ /generate?uuid=<x>
  ├─ Supabase UPDATE scores              │
  └─ SELECT abol_public_scores           ▼
     for peer benchmark                report_loaders
                                         │
              ┌──────────────────────────┘
              ▼
          Supabase
          ├─ abol_assessments (RLS: anon blocked on SELECT; UPDATE gated; is_paid server-role only)
          ├─ abol_public_scores (SECURITY DEFINER view: anon-readable, no PII)
          └─ pdf_generations (service-role only; observability log)

  CLI (local dev):
  python generate_report.py --source supabase <uuid>   # prod data
  python generate_report.py --source postgres <uuid>   # local dev
  python generate_report.py --demo                     # no deps
```

## Deployment — Fly.io PDF container

```bash
# One-time launch
flyctl launch --no-deploy                          # claims app name "abol-pdf"
flyctl secrets set \
    SUPABASE_URL=https://cnoudltgcxeyzfelvbuv.supabase.co \
    SUPABASE_SERVICE_ROLE_KEY=<from dashboard> \
    ANTHROPIC_API_KEY=<optional>

# Every subsequent deploy
flyctl deploy

# Operations
flyctl logs -a abol-pdf
flyctl status -a abol-pdf
flyctl ssh console -a abol-pdf
```

Container spec: region `ams`, shared-cpu-1x 1GB, concurrency 1, auto_stop after 5min idle. `/health` polled every 30s.

## Deployment — abol.ai (IMPORTANT: NOT pipeloop, separate Vercel project)

### Deployment — abol.ai (IMPORTANT: NOT pipeloop, separate Vercel project)

abol.ai is its OWN Vercel project (`sams-projects-0a3e879a/abol-ai`). It is NOT connected to git. It is NOT part of the pipeloop-app repo. Deploy directly via Vercel CLI:

```bash
bash deploy.sh
```

That's it. The script copies `app.html` → `index.html` and runs `npx vercel deploy --prod`.

**Do NOT touch pipeloop-app for abol.ai changes. Ever.**

If Vercel CLI says "no credentials", run `npx vercel login` first (opens browser). If the project link is missing, re-link with `npx vercel link --project abol-ai --yes --scope sams-projects-0a3e879a`.

**What's already live:** frontend on Vercel + Supabase persistence (assessment rows write end-to-end). **Remaining for full monetization:** Stripe Checkout → webhook → `generate_report.py` in a container (Cloud Run / Fly.io) reading from Supabase → Resend to email the PDF.

## Runbooks

### Buyer paid via bank transfer, needs PDF (manual Sprint 1 fulfillment)

```bash
# 1. Verify payment received
# 2. Flip is_paid via service-role (bypasses RLS)
export SUPABASE_ACCESS_TOKEN="sbp_..."
npx supabase db query --linked \
    "UPDATE abol_assessments SET is_paid=true, payment_reference='wire_<ref>' WHERE id='<uuid>'"
# 3. Generate PDF
curl -X POST "https://abol-pdf.fly.dev/generate?uuid=<uuid>" -o /tmp/report.pdf
# 4. Email manually (Sprint 2 automates via Resend)
```

### PDF generation failed

```bash
# 1. Check pdf_generations for the failure row
npx supabase db query --linked \
    "SELECT status, error_class, error_message, duration_ms FROM pdf_generations
     WHERE assessment_id='<uuid>' ORDER BY started_at DESC LIMIT 5"
# 2. Cross-reference Fly.io logs for stacktrace
flyctl logs -a abol-pdf | grep "<uuid>"
# 3. Fallback: regenerate locally
python generate_report.py --source supabase <uuid>
```

### Container OOM

Symptoms: `/generate` returns 500 or connection drops mid-render. Fly.io auto-restarts on OOM by default.

1. Check `flyctl status -a abol-pdf` for recent restarts
2. Check memory in `flyctl metrics -a abol-pdf` — sustained >800MB on 1GB machine signals a real leak, not a transient spike
3. Mitigation: bump `fly.toml` memory to `2gb` (shared-cpu-1x supports it)
4. Root cause: ReportLab assembles the full PDF in memory before writing. Very large assessments (future: more questions, embedded images) will grow peak usage. Revisit if memory issues recur on a non-happy-path input.

### RLS regression

If `tests/smoke.sh` RLS assertions fail after a Supabase migration:
1. Run `supabase/003_rls_tighten.sql` — it's idempotent on the drops, safe to re-apply
2. Verify policies: `SELECT policyname FROM pg_policies WHERE tablename='abol_assessments'`
   Expected: "Anon updates own in-progress assessment only" + "Anyone can create assessments"
3. Verify grants: `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='abol_assessments' AND grantee='anon'` — must NOT include SELECT.

## Conventions

- Never use Microsoft Edge to open files. Use Chrome (`start chrome <path>` on Windows).
- Bash on Windows: use forward slashes and `/c/Users/...` paths in shell commands.
- Don't edit `schema.sql` or `seed_questions.sql` once seeded. Add a numbered migration instead.
- **`app.html` is the source of truth for question wording.** When adding questions to the database via a migration, copy the exact text/options/scores from the corresponding entry in the `DEMO_QUESTIONS` array in `app.html`. Also update `report_loaders.QUESTION_CATALOG` in the same PR — that dict is what the Supabase loader uses to reconstruct question_text. Three places total: `app.html` + `seed_questions.sql` + `report_loaders.QUESTION_CATALOG`.
- **Peer benchmark data (`external_benchmarks.PEER_DISTRIBUTIONS`) mirrors `app.html:PEER_DISTRIBUTIONS`.** Keep them in sync: when Python changes, bump the JS constant in the same PR.
- When adding new charts to the PDF, follow the IBCS conventions documented above and reuse primitives from `report_charts.py` rather than drawing custom shapes inline in `report_sections.py`.
- Every PDF generation must write a `pdf_generations` row. `server.py` does this automatically via `_log_generation`; if you add another generation path, include the observability log.

## Testing

Run the regression suite before any PR:
```bash
bash tests/smoke.sh
```

Checks: py_compile (9 modules), demo PDF regression, external_benchmarks 21 combo coverage, 4 RLS assertions against live Supabase, FastAPI wiring. Optional Fly.io live check if `FLY_URL` + `TEST_UUID` are set.
