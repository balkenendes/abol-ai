# ABOL.ai Benchmark Platform

**The #1 benchmark for AI + Quantum cyber readiness across Europe.**

Re-engineered from legacy consultancy benchmarks (Berenschot, Metri) into an AI-driven, continuously-updated platform. Runs on pure Python.

---

## What This Is

A freemium assessment platform where IT and security teams complete a ~9-minute adaptive questionnaire and receive:

- **Free tier:** Overall readiness score + rating (Critical / At Risk / Fair / Strong / Leader)
- **Paid tier (€49+):** Full dimension breakdown, peer comparison, top 10 prioritized actions, €-impact estimates

### 6 Dimensions Measured

1. **Readiness** — AI + Quantum threat awareness and preparedness
2. **Security Measures** — Technical controls in place
3. **Dependencies** — Supply chain, vendors, open source, shadow AI
4. **Cost Efficiency** — Cyber spend effectiveness and benchmarking
5. **Compliance** — NIS2, DORA, EU AI Act, GDPR
6. **Governance** — Board oversight, CISO authority, policies

### 3 Sectors Served

- **SMB** — €50M to €500M revenue
- **Corporate** — €500M+ revenue
- **Financial Services** — Banks, insurance, pension funds

Sector-specific weights: Financial Services weighs quantum readiness and compliance 2.5-3x higher than SMB.

---

## Why It Scores Near-100% Is Nearly Impossible

Several questions (`is_future_proofing=true`) anticipate threats that don't fully exist yet:

- **Q_RDY_002** — Preparedness for Mythos-class AI attacks (6-18 months away)
- **Q_RDY_005** — Continuous 24/7 automated AI red teaming
- **Q_SEC_003** — 24/7 AI-augmented SOC triage
- **Q_DEP_002** — Formal security review of every AI vendor
- **Q_DEP_004** — Continuous AI-powered open source dependency scanning

Only organizations running bleeding-edge posture can score 100%. This is by design.

---

## Architecture

### Stack

- **Backend:** FastAPI (Python 3.11+)
- **Database:** PostgreSQL 15+
- **Deploy:** Railway, Fly.io, or any container platform
- **Frontend (separate):** Any framework, consumes REST API

### Why This Stack

- Pure Python as requested (SQL schema + FastAPI + asyncpg)
- PostgreSQL gives ACID guarantees for scoring integrity
- `asyncpg` is the fastest Python Postgres driver
- FastAPI auto-generates OpenAPI docs at `/docs`

### Version Control Strategy (Hybrid)

The core requirement: **when questions change, historical answers must still be comparable.**

This is achieved via:

1. **Stable `question_id`** (e.g., `Q_RDY_002`) — never changes
2. **Versioned content** in `question_versions` — wording, options, weights can evolve
3. **Answers reference both** `question_id` AND `question_version_id`
4. **Scores are frozen at answer time** (`weighted_score` is stored, not recomputed)

This means:
- You can rewrite a question's wording → old answers still valid
- You can retune sector weights → old assessments keep their original scores
- You can deprecate a question → it stops appearing but historical data remains queryable
- Year-over-year comparisons work because each assessment is self-contained

---

## Database Schema Highlights

```
questions                 -- Stable IDs, metadata
  └── question_versions   -- Versioned content per question
        └── sector_weights -- Per-sector, per-version weight overrides

organizations             -- Who is being benchmarked
  └── assessments         -- Each questionnaire attempt
        ├── answers       -- Responses (linked to specific version)
        ├── assessment_scores -- Computed dimension scores
        └── overall_scores -- Headline score + rating
```

See `schema.sql` for full DDL.

---

## Setup

### 1. Database

```bash
# Create database
createdb abol

# Apply schema
psql abol -f schema.sql

# Load seed questions (30+ across all dimensions)
psql abol -f seed_questions.sql

# Verify
psql abol -c "SELECT dimension, COUNT(*) FROM active_questions GROUP BY dimension;"
```

### 2. API

```bash
# Install dependencies
pip install -r requirements.txt

# Set database URL
export DATABASE_URL="postgresql://localhost/abol"

# Run
uvicorn main:app --reload

# Open docs
open http://localhost:8000/docs
```

### 3. Test Flow

```bash
# Start assessment
curl -X POST http://localhost:8000/api/assessments/start \
  -H "Content-Type: application/json" \
  -d '{
    "sector": "financial_services",
    "employee_count_bucket": "500-1000",
    "country": "NL",
    "email": "test@example.com"
  }'
# → Returns assessment_id and first questions

# Submit an answer
curl -X POST http://localhost:8000/api/assessments/answer \
  -H "Content-Type: application/json" \
  -d '{
    "assessment_id": "...",
    "question_id": "Q_RDY_001",
    "answer_value": {"selected": "weekly"}
  }'

# Complete assessment
curl -X POST http://localhost:8000/api/assessments/complete \
  -H "Content-Type: application/json" \
  -d '{"assessment_id": "..."}'
# → Returns summary (free tier)

# Mark as paid (normally via Stripe webhook)
curl -X POST "http://localhost:8000/api/assessments/{id}/mark-paid?payment_reference=stripe_xxx"

# Fetch full report
curl http://localhost:8000/api/assessments/{id}/full
```

---

## Business Model

### Pricing

| Tier | Price | What you get |
|------|-------|--------------|
| **Free scan** | €0 | Overall score + rating + sector |
| **Full report** | €49 one-time | Dimension breakdown, top 10 actions, peer comparison |
| **Continuous** | €99/mo (SMB) · €499/mo (Corporate) · €1,999/mo (FinServ) | Monthly re-scoring, threat alerts, progress tracking |
| **Enterprise** | €2,999/mo | White-label, API access, custom dimensions, analyst calls |

### Unit Economics

- **CAC target:** €15-40 via LinkedIn + SEO (Pipeloop.ai for outbound)
- **Free → Paid conversion:** 3-5% target (industry benchmark for cyber freemium)
- **LTV (Continuous SMB):** €99 × 14 months = €1,386
- **Gross margin:** 90%+ (AI-driven, near-zero marginal cost)

### Path to €1M ARR

- 60,000 free assessments → 3% conversion = 1,800 paid
- Blended ARPU: €700/year (mix of one-time + continuous)
- 1,800 × €700 = **€1.26M ARR at month 24**

---

## Next Steps

### Week 1
1. Deploy PostgreSQL (Supabase, Railway, or Fly.io)
2. Deploy FastAPI on Fly.io or Railway
3. Build Next.js/Nuxt frontend that consumes this API
4. Register abol.ai domain
5. Launch free tier publicly

### Month 1
- Add 20 more questions (especially cost benchmarking depth)
- Integrate Stripe for €49 payments
- LinkedIn outbound via Pipeloop.ai to CISOs
- First 10 paying customers

### Month 3
- Continuous tier launched
- First financial services client
- Benchmark cache warming (need 30+ per sector/size for percentiles)

### Month 6
- Dutch government pilot (undercut Berenschot)
- Public "ABOL Index" leaderboard (anonymized)
- 100+ paying customers

---

## Generating reports

The CLI `generate_report.py` produces a 40+ page IBCS-styled PDF for any
completed assessment in the database. This is the core paid deliverable of
the freemium product.

### Prerequisites

1. Apply the schema migrations (see [`MIGRATIONS.md`](MIGRATIONS.md)):

   ```bash
   psql "$DATABASE_URL" -f migrations/001_seven_pillars.sql
   psql "$DATABASE_URL" -f migrations/002_resilience_questions.sql
   ```

2. Install the additional Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

   This pulls in `reportlab` (PDF engine) and `anthropic` (for the
   executive-summary LLM call).

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes (unless `--demo`) | Postgres connection string (asyncpg-compatible) |
| `ANTHROPIC_API_KEY` | no | Enables LLM-generated executive summary. Without it, a rule-based fallback is used. |
| `ABOL_LOG_LEVEL` | no | Logging level (default `INFO`) |

### Usage

```bash
# Real assessment
python generate_report.py <assessment_uuid>

# Custom output path
python generate_report.py <assessment_uuid> --output /tmp/report.pdf

# Demo mode — no database or API key required, hardcoded sample data
python generate_report.py --demo
```

Default output path: `./reports/abol_report_<short_id>_<YYYYMMDD>.pdf`.

### What you get

The generated PDF contains:

- **Cover** — overall score, rating badge, rating scale strip
- **Executive Summary** — LLM-generated (with deterministic fallback),
  plus a pillar-level IBCS scorecard and three urgent actions
- **Methodology overview** — how scores are built, sector weight table
- **Seven pillars** — 2 pages each with score ring, IBCS AC/BM/BU bar
  chart, question-level table, gap narratives, external benchmark callout
- **Peer benchmark** — radar chart + full percentile comparison + external
  benchmarks (Thales 2026, IBM 2024)
- **Business case** — breach-cost exposure, savings model, top-10
  priority actions with investment ranges and timelines, 3-year roadmap
  Gantt
- **Regulatory context** — NIS2, DORA, EU AI Act, post-quantum deadlines
- **Vendor categories** — vendor-neutral shortlist by gap area
- **Historical trends** — prior assessments over time (or first-assessment note)
- **Methodology & appendix** — full scoring detail, version-control
  explanation, every answer logged, glossary
- **Back cover** — next steps and assessment URL

### First-run fonts

On first run, the generator downloads Manrope and JetBrains Mono from
Google Fonts to `./fonts/`. If the network is unavailable, it falls back
to Helvetica/Courier and logs a warning — the PDF still renders.

### Files

- `schema.sql` — Complete PostgreSQL schema with version control
- `seed_questions.sql` — 30+ questions across all dimensions with sector weights
- `migrations/001_seven_pillars.sql` — rename `cost_efficiency` → `investment`, add `resilience`
- `migrations/002_resilience_questions.sql` — seed the six resilience questions
- `main.py` — FastAPI backend with full scoring logic
- `generate_report.py` — PDF report CLI
- `report_design.py`, `report_charts.py`, `report_sections.py` — PDF building blocks
- `report_llm.py` — Anthropic client + rule-based fallback for the executive summary
- `external_benchmarks.py` — Thales 2026 + IBM 2024 data constants
- `requirements.txt` — Python dependencies
- `MIGRATIONS.md` — history of schema changes
- `README.md` — this file

---

## Security Notes

- Email addresses are **hashed** (SHA-256), never stored plaintext
- IP and user agent **hashed** for fraud detection without tracking
- Assessment data is **anonymous by default** — organization name optional
- Peer comparison uses **percentiles only**, never exposes individual scores
- Database should use **row-level security** in production for multi-tenant isolation
