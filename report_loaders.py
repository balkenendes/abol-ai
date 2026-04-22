"""
report_loaders.py
=================
Data loading layer for the ABOL.ai PDF generator.

Three sources, one dispatcher:

    load_assessment_data(source, assessment_id)
        ├── "demo"     → _load_demo()                   (hardcoded sample)
        ├── "postgres" → _load_from_postgres_async()    (legacy FastAPI reference path)
        └── "supabase" → _load_from_supabase_async()    (live production path)

The caller (generate_report.py) stays source-agnostic. All loaders
return an AssessmentData dataclass that report_sections.py consumes.

Exception model
---------------
All loader failures raise LoaderError subclasses. The HTTP wrapper
(server.py in the Fly.io container) maps these to HTTP status codes
and logs to pdf_generations. The CLI catches at the top level and
prints a friendly message + exits non-zero.

    LoaderError (base)
    ├── AssessmentNotFound         → 404 (no row for UUID)
    ├── AssessmentIncomplete       → 400 (row exists but status != 'completed')
    ├── ScoresMissing              → 500 (status=completed but dimension_scores null) — triggers recompute path
    ├── ScoreMismatch              → 500 + CRITICAL log (frontend scoring drifted from main.py reference)
    ├── SupabaseUnavailable        → 503 (network / service down — retried internally first)
    └── LoaderConfigError          → 500 (env var missing — should be caught at container boot)
"""

from __future__ import annotations

import asyncio
import datetime as dt
import logging
import os
from dataclasses import asdict, dataclass, field
from decimal import Decimal
from typing import Any, Dict, List, Optional

log = logging.getLogger("report_loaders")


# ============================================================================
# Data contract (mirrors generate_report.py:AssessmentData)
# ============================================================================
@dataclass
class AssessmentData:
    """What every loader returns, regardless of source.

    Shape pinned by report_sections.py; do not change without migrating
    that module in the same PR.
    """
    assessment_id: str
    organization_name: Optional[str]
    sector: str
    employee_bucket: str
    country: Optional[str]
    is_paid: bool
    completed_at: Optional[str]

    overall_percentage: float
    overall_percentile: Optional[float]
    rating: str

    dimension_scores: List[Dict[str, Any]]
    answers: List[Dict[str, Any]]
    weakest_questions: List[Dict[str, Any]] = field(default_factory=list)

    peer_sample_size: int = 0
    peer_median_by_dimension: Dict[str, float] = field(default_factory=dict)
    peer_p25_by_dimension: Dict[str, float] = field(default_factory=dict)
    peer_p75_by_dimension: Dict[str, float] = field(default_factory=dict)
    peer_p90_by_dimension: Dict[str, float] = field(default_factory=dict)

    prior_assessments: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ============================================================================
# Exception hierarchy
# ============================================================================
class LoaderError(Exception):
    """Base class for all loader failures. HTTP wrapper maps to status codes."""
    http_status = 500


class AssessmentNotFound(LoaderError):
    http_status = 404


class AssessmentIncomplete(LoaderError):
    http_status = 400


class ScoresMissing(LoaderError):
    """status='completed' but dimension_scores is NULL. Recompute path needed."""
    http_status = 500


class ScoreMismatch(LoaderError):
    """Recomputed score differs from frontend-stored score by > tolerance.

    CRITICAL log: means app.html scoring has drifted from main.py reference.
    Ship is still allowed (we use the recomputed value), but this must be
    investigated.
    """
    http_status = 500


class SupabaseUnavailable(LoaderError):
    """Network / service-level failure. Retries exhausted."""
    http_status = 503


class LoaderConfigError(LoaderError):
    """Environment variable missing or malformed. Should be caught at boot."""
    http_status = 500


# ============================================================================
# QUESTION_CATALOG — shared Q_ID → metadata map
# ============================================================================
# Single source of truth for question text used by Supabase loader (which
# only stores Q_ID + score in the answers JSONB).
#
# Future: extract to questions_catalog.py sourced from seed_questions.sql.
# For Sprint 1, inline here to minimize new files.
#
# Format: { Q_ID: { "dimension", "subcategory", "question_text" } }
QUESTION_CATALOG: Dict[str, Dict[str, str]] = {
    # --- Readiness ---
    "Q_RDY_001": {"dimension": "readiness", "subcategory": "ai_threat_awareness", "question_text": "How often do you review AI-enabled threat intel?"},
    "Q_RDY_002": {"dimension": "readiness", "subcategory": "mythos_preparedness", "question_text": "Preparedness for autonomous AI (Mythos-class) attacks in the next 6-18 months"},
    "Q_RDY_003": {"dimension": "readiness", "subcategory": "quantum_timeline",    "question_text": "Target date for post-quantum cryptography (PQC) migration"},
    "Q_RDY_004": {"dimension": "readiness", "subcategory": "hndl_risk",           "question_text": "Awareness of classified/sensitive data at catastrophic harvest-now-decrypt-later risk"},
    "Q_RDY_005": {"dimension": "readiness", "subcategory": "ai_red_team",         "question_text": "AI-driven red team exercise cadence"},
    "Q_RDY_006": {"dimension": "readiness", "subcategory": "ai_skills",           "question_text": "Security team expertise in AI attack vectors"},
    # --- Security measures ---
    "Q_SEC_001": {"dimension": "security_measures", "subcategory": "identity",             "question_text": "Phishing-resistant MFA coverage across workforce"},
    "Q_SEC_002": {"dimension": "security_measures", "subcategory": "patching",             "question_text": "Median time from CVE publication to production patch"},
    "Q_SEC_003": {"dimension": "security_measures", "subcategory": "soc_coverage",         "question_text": "Around-the-clock SOC coverage"},
    "Q_SEC_004": {"dimension": "security_measures", "subcategory": "encryption_inventory", "question_text": "Real-time cryptographic inventory across the estate"},
    "Q_SEC_005": {"dimension": "security_measures", "subcategory": "dlp_ai",               "question_text": "Protection against data exfiltration via AI services"},
    "Q_SEC_006": {"dimension": "security_measures", "subcategory": "zero_trust",           "question_text": "Zero-trust / microsegmentation scope"},
    # --- Dependencies ---
    "Q_DEP_001": {"dimension": "dependencies", "subcategory": "sbom",                  "question_text": "Automated SBOM generation on every deploy"},
    "Q_DEP_002": {"dimension": "dependencies", "subcategory": "ai_vendor_risk",        "question_text": "Formal security review of every AI vendor"},
    "Q_DEP_003": {"dimension": "dependencies", "subcategory": "concentration_risk",    "question_text": "Single-vendor concentration of critical operations"},
    "Q_DEP_004": {"dimension": "dependencies", "subcategory": "open_source_integrity", "question_text": "Continuous AI-powered open-source compromise detection"},
    "Q_DEP_005": {"dimension": "dependencies", "subcategory": "vendor_contracts",      "question_text": "Cybersecurity clauses in vendor contracts"},
    "Q_DEP_006": {"dimension": "dependencies", "subcategory": "cve_triage",            "question_text": "Time to identify systems affected by a newly disclosed CVE"},
    # --- Investment ---
    "Q_INV_001": {"dimension": "investment", "subcategory": "spend_ratio",           "question_text": "Percentage of IT budget allocated to cybersecurity"},
    "Q_INV_002": {"dimension": "investment", "subcategory": "pqc_budget",            "question_text": "Budget allocated for post-quantum migration"},
    "Q_INV_003": {"dimension": "investment", "subcategory": "roi_measurement",       "question_text": "Quantified ROI per major security investment"},
    "Q_INV_004": {"dimension": "investment", "subcategory": "tool_sprawl",           "question_text": "Distinct security tools and vendors in use"},
    "Q_INV_005": {"dimension": "investment", "subcategory": "contract_benchmarking", "question_text": "Cadence of contract benchmarking versus market"},
    "Q_INV_006": {"dimension": "investment", "subcategory": "breach_cost_model",     "question_text": "Quantified breach-cost exposure model"},
    # --- Compliance ---
    "Q_CMP_001": {"dimension": "compliance", "subcategory": "nis2",                "question_text": "NIS2 scope determination and compliance status"},
    "Q_CMP_002": {"dimension": "compliance", "subcategory": "eu_ai_act",           "question_text": "EU AI Act inventory and risk classification"},
    "Q_CMP_003": {"dimension": "compliance", "subcategory": "dora",                "question_text": "DORA compliance status (financial entities)"},
    "Q_CMP_004": {"dimension": "compliance", "subcategory": "incident_reporting",  "question_text": "24-hour incident reporting capability"},
    "Q_CMP_005": {"dimension": "compliance", "subcategory": "dpia",                "question_text": "DPIA coverage for high-risk data activities"},
    "Q_CMP_006": {"dimension": "compliance", "subcategory": "regulatory_tracking", "question_text": "Regulatory change tracking across jurisdictions"},
    # --- Governance ---
    "Q_GOV_001": {"dimension": "governance", "subcategory": "board_oversight",         "question_text": "Board briefings on AI and quantum cyber threats"},
    "Q_GOV_002": {"dimension": "governance", "subcategory": "ciso_authority",          "question_text": "CISO reporting line and halt authority"},
    "Q_GOV_003": {"dimension": "governance", "subcategory": "policy_currency",         "question_text": "Currency of security policies"},
    "Q_GOV_004": {"dimension": "governance", "subcategory": "ai_governance_committee", "question_text": "Formal AI governance committee"},
    "Q_GOV_005": {"dimension": "governance", "subcategory": "pqc_ownership",           "question_text": "Named owner for post-quantum migration"},
    "Q_GOV_006": {"dimension": "governance", "subcategory": "risk_appetite_statement", "question_text": "Board-approved risk appetite statement"},
    # --- Resilience (added in migration 002) ---
    "Q_RES_001": {"dimension": "resilience", "subcategory": "ransomware_recovery_drill",      "question_text": "Full-recovery ransomware drill cadence"},
    "Q_RES_002": {"dimension": "resilience", "subcategory": "tested_recovery_time_objective", "question_text": "Tested recovery time objective (RTO) for critical systems"},
    "Q_RES_003": {"dimension": "resilience", "subcategory": "ai_incident_response_playbook",  "question_text": "AI-specific incident response playbook"},
    "Q_RES_004": {"dimension": "resilience", "subcategory": "offline_immutable_backups",      "question_text": "Offline immutable backups"},
    "Q_RES_005": {"dimension": "resilience", "subcategory": "incident_response_retainer",     "question_text": "Pre-arranged incident response retainer"},
    "Q_RES_006": {"dimension": "resilience", "subcategory": "business_impact_analysis",       "question_text": "Business impact analysis with per-hour downtime cost"},
}


def _lookup_question(q_id: str) -> Dict[str, str]:
    """Return catalog entry for Q_ID, or a graceful stub if unknown."""
    return QUESTION_CATALOG.get(q_id) or {
        "dimension": "unknown",
        "subcategory": "",
        "question_text": f"({q_id} — not in catalog)",
    }


# ============================================================================
# Dispatcher
# ============================================================================
async def load_assessment_data_async(source: str, assessment_id: str) -> AssessmentData:
    """Source-agnostic async loader. Routes to the right backend by `source`.

    Raises LoaderError (or subclass) on any failure. Callers should catch
    LoaderError at the top level and map to HTTP/CLI exit codes.
    """
    if source == "demo":
        return _load_demo()
    if source == "supabase":
        return await _load_from_supabase_async(assessment_id)
    if source == "postgres":
        return await _load_from_postgres_async(assessment_id)
    raise LoaderConfigError(
        f"Unknown loader source: {source!r} (expected 'demo', 'supabase', or 'postgres')"
    )


def load_assessment_data(source: str, assessment_id: str) -> AssessmentData:
    """Synchronous wrapper for CLI usage."""
    return asyncio.run(load_assessment_data_async(source, assessment_id))


# ============================================================================
# Demo loader
# ============================================================================
def _load_demo() -> AssessmentData:
    """Hardcoded sample used by --demo mode. No DB, no network.

    Mirrors the frontend mockup: financial services, ~5000 employees, NL,
    Critical rating (score ~35). The question catalog here is the source
    of truth that QUESTION_CATALOG above mirrors — keep them in sync.
    """
    from report_design import rating_for_score  # local import to avoid cycles

    answers: List[Dict[str, Any]] = []
    pillar_configs = [
        ("readiness", [
            ("Q_RDY_001", "Quarterly", 40),
            ("Q_RDY_002", "Some defenses", 40),
            ("Q_RDY_003", "Planned 2028 or later", 40),
            ("Q_RDY_004", "Partially aware", 50),
            ("Q_RDY_005", "Annual engagement", 40),
            ("Q_RDY_006", "Basic awareness", 35),
        ]),
        ("security_measures", [
            ("Q_SEC_001", "50-74%", 50),
            ("Q_SEC_002", "1-3 days", 75),
            ("Q_SEC_003", "Business hours only", 25),
            ("Q_SEC_004", "Partial visibility only", 15),
            ("Q_SEC_005", "Policy with periodic monitoring", 65),
            ("Q_SEC_006", "Traditional segmentation", 40),
        ]),
        ("dependencies", [
            ("Q_DEP_001", "Manual current", 60),
            ("Q_DEP_002", "Major vendors only", 50),
            ("Q_DEP_003", "20-40%", 70),
            ("Q_DEP_004", "Periodic scans only", 40),
            ("Q_DEP_005", "Top 10-20 vendors only", 60),
            ("Q_DEP_006", "Within 24 hours", 70),
        ]),
        ("investment", [
            ("Q_INV_001", "Slightly below benchmark", 70),
            ("Q_INV_002", "Partial budget, plan forming", 60),
            ("Q_INV_003", "Major investments only", 60),
            ("Q_INV_004", "20-40 tools", 40),
            ("Q_INV_005", "1-2 years ago", 60),
            ("Q_INV_006", "Rough estimate, partial cover", 60),
        ]),
        ("compliance", [
            ("Q_CMP_001", "In scope, partially compliant", 50),
            ("Q_CMP_002", "Partial inventory", 50),
            ("Q_CMP_003", "Not a financial entity", 100),
            ("Q_CMP_004", "Best effort, not tested", 25),
            ("Q_CMP_005", "For some activities only", 35),
            ("Q_CMP_006", "Ad hoc", 10),
        ]),
        ("governance", [
            ("Q_GOV_001", "Annually", 25),
            ("Q_GOV_002", "Reports to CIO", 40),
            ("Q_GOV_003", "12-24 months old", 30),
            ("Q_GOV_004", "Informal group", 35),
            ("Q_GOV_005", "Shared, no clear owner", 20),
            ("Q_GOV_006", "Draft stage", 20),
        ]),
        ("resilience", [
            ("Q_RES_001", "Annual drill", 40),
            ("Q_RES_002", "1-7 days", 40),
            ("Q_RES_003", "Generic plan only", 30),
            ("Q_RES_004", "Cloud-immutable only", 45),
            ("Q_RES_005", "Providers identified only", 30),
            ("Q_RES_006", "Partial analysis", 55),
        ]),
    ]

    sector = "financial_services"
    sector_weights = {
        "readiness": 2.5, "security_measures": 1.5, "dependencies": 2.2,
        "investment": 1.2, "compliance": 3.0, "governance": 2.5, "resilience": 2.0,
    }

    dim_totals: Dict[str, Dict[str, float]] = {}
    for pillar, items in pillar_configs:
        for qid, ans_label, raw in items:
            w = sector_weights.get(pillar, 1.0)
            meta = _lookup_question(qid)
            answers.append({
                "question_id": qid,
                "dimension": pillar,
                "subcategory": meta["subcategory"],
                "question_text": meta["question_text"],
                "answer_label": ans_label,
                "raw_score": float(raw),
                "sector_weight_applied": w,
            })
            dim_totals.setdefault(pillar, {"weighted": 0.0, "max": 0.0})
            dim_totals[pillar]["weighted"] += raw * w
            dim_totals[pillar]["max"] += 100 * w

    dimension_scores = []
    overall_w = overall_m = 0.0
    for pillar, vals in dim_totals.items():
        pct = (vals["weighted"] / vals["max"]) * 100 if vals["max"] else 0
        dimension_scores.append({
            "dimension": pillar,
            "percentage": round(pct, 1),
            "peer_percentile": 28.0 + hash(pillar) % 30,
            "raw_score": vals["weighted"],
            "max_possible": vals["max"],
        })
        overall_w += vals["weighted"]
        overall_m += vals["max"]

    overall_pct = round((overall_w / overall_m) * 100 if overall_m else 0, 1)

    # Demo peer medians (hardcoded — sector-plausible numbers, no external lookup)
    peer_median = {
        "readiness": 54, "security_measures": 61, "dependencies": 52,
        "investment": 58, "compliance": 67, "governance": 55, "resilience": 50,
    }
    peer_p25 = {k: v - 10 for k, v in peer_median.items()}
    peer_p75 = {k: v + 10 for k, v in peer_median.items()}
    peer_p90 = {k: v + 20 for k, v in peer_median.items()}

    weakest = sorted(answers, key=lambda a: a["raw_score"])[:5]

    return AssessmentData(
        assessment_id="demo-0000-0000-0000-0000",
        organization_name="Acme Financial Services (DEMO)",
        sector=sector,
        employee_bucket="5000+",
        country="NL",
        is_paid=True,
        completed_at=dt.date.today().isoformat(),
        overall_percentage=overall_pct,
        overall_percentile=22.0,
        rating=rating_for_score(overall_pct),
        dimension_scores=dimension_scores,
        answers=answers,
        weakest_questions=weakest,
        peer_sample_size=287,
        peer_median_by_dimension=peer_median,
        peer_p25_by_dimension=peer_p25,
        peer_p75_by_dimension=peer_p75,
        peer_p90_by_dimension=peer_p90,
        prior_assessments=[],
    )


# ============================================================================
# Postgres loader (legacy — kept for local dev + reference scoring)
# ============================================================================
async def _load_from_postgres_async(assessment_id: str) -> AssessmentData:
    """Load from the local Postgres schema (normalized tables).

    Kept for local dev + scoring reference. Production runs through
    _load_from_supabase_async.
    """
    try:
        import asyncpg
    except ImportError as exc:
        raise LoaderConfigError(
            f"asyncpg not installed — `pip install asyncpg` or use a different source ({exc})"
        ) from exc

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise LoaderConfigError("DATABASE_URL not set (required for source='postgres')")

    try:
        conn = await asyncpg.connect(database_url)
    except Exception as exc:
        raise SupabaseUnavailable(f"Postgres connection failed: {exc}") from exc

    try:
        row = await conn.fetchrow(
            """
            SELECT a.id, a.status, a.completed_at, a.is_paid, a.sector_snapshot,
                   o.name AS org_name,
                   o.employee_count_bucket, o.country
            FROM assessments a
            JOIN organizations o ON o.id = a.organization_id
            WHERE a.id = $1
            """,
            assessment_id,
        )
        if row is None:
            raise AssessmentNotFound(f"assessment {assessment_id} not found")
        if row["status"] != "completed":
            raise AssessmentIncomplete(
                f"assessment {assessment_id} is status '{row['status']}', must be 'completed'"
            )

        sector = row["sector_snapshot"]
        emp_bucket = row["employee_count_bucket"] or ""

        overall = await conn.fetchrow(
            "SELECT overall_percentage, overall_percentile, rating FROM overall_scores WHERE assessment_id = $1",
            assessment_id,
        )
        if overall is None:
            raise ScoresMissing(f"assessment {assessment_id} has no overall_scores row")

        dim_rows = await conn.fetch(
            """
            SELECT dimension, raw_score, max_possible_score, percentage, peer_percentile
            FROM assessment_scores WHERE assessment_id = $1 ORDER BY dimension
            """,
            assessment_id,
        )

        answer_rows = await conn.fetch(
            """
            SELECT a.question_id, q.dimension, q.subcategory,
                   qv.question_text, qv.options,
                   a.answer_value, a.raw_score, a.weighted_score,
                   a.sector_weight_applied
            FROM answers a
            JOIN questions q ON q.question_id = a.question_id
            JOIN question_versions qv ON qv.id = a.question_version_id
            WHERE a.assessment_id = $1
            ORDER BY q.dimension, a.question_id
            """,
            assessment_id,
        )

        answers = [
            {
                "question_id": ar["question_id"],
                "dimension": ar["dimension"],
                "subcategory": ar["subcategory"],
                "question_text": ar["question_text"],
                "answer_label": _label_for_answer(ar["answer_value"], ar["options"]),
                "raw_score": float(ar["raw_score"]),
                "sector_weight_applied": float(ar["sector_weight_applied"]),
            }
            for ar in answer_rows
        ]

        peer_stats = await conn.fetch(
            """
            SELECT s.dimension, COUNT(*) AS n,
                   percentile_cont(0.25) WITHIN GROUP (ORDER BY s.percentage) AS p25,
                   percentile_cont(0.50) WITHIN GROUP (ORDER BY s.percentage) AS p50,
                   percentile_cont(0.75) WITHIN GROUP (ORDER BY s.percentage) AS p75,
                   percentile_cont(0.90) WITHIN GROUP (ORDER BY s.percentage) AS p90
            FROM assessment_scores s
            JOIN assessments a ON a.id = s.assessment_id
            JOIN organizations o ON o.id = a.organization_id
            WHERE a.status = 'completed' AND a.sector_snapshot = $1 AND o.employee_count_bucket = $2
            GROUP BY s.dimension
            """,
            sector, emp_bucket,
        )
        peer_median = {r["dimension"]: float(r["p50"] or 0) for r in peer_stats}
        peer_p25 = {r["dimension"]: float(r["p25"] or 0) for r in peer_stats}
        peer_p75 = {r["dimension"]: float(r["p75"] or 0) for r in peer_stats}
        peer_p90 = {r["dimension"]: float(r["p90"] or 0) for r in peer_stats}
        sample_size = max((int(r["n"]) for r in peer_stats), default=0)

        prior = await conn.fetch(
            """
            SELECT a.completed_at::date AS date, os.overall_percentage, os.rating
            FROM assessments a
            JOIN overall_scores os ON os.assessment_id = a.id
            WHERE a.organization_id = (SELECT organization_id FROM assessments WHERE id = $1)
              AND a.id <> $1 AND a.status = 'completed'
            ORDER BY a.completed_at
            """,
            assessment_id,
        )

        dimension_scores = [
            {
                "dimension": r["dimension"],
                "percentage": float(r["percentage"]),
                "peer_percentile": float(r["peer_percentile"]) if r["peer_percentile"] is not None else None,
                "raw_score": float(r["raw_score"]),
                "max_possible": float(r["max_possible_score"]),
            }
            for r in dim_rows
        ]
        weakest = sorted(answers, key=lambda a: a["raw_score"])[:5]

        return AssessmentData(
            assessment_id=str(assessment_id),
            organization_name=row["org_name"],
            sector=sector,
            employee_bucket=emp_bucket,
            country=row["country"],
            is_paid=bool(row["is_paid"]),
            completed_at=str(row["completed_at"]) if row["completed_at"] else None,
            overall_percentage=float(overall["overall_percentage"]),
            overall_percentile=float(overall["overall_percentile"]) if overall["overall_percentile"] is not None else None,
            rating=overall["rating"] or "",
            dimension_scores=dimension_scores,
            answers=answers,
            weakest_questions=weakest,
            peer_sample_size=sample_size,
            peer_median_by_dimension=peer_median,
            peer_p25_by_dimension=peer_p25,
            peer_p75_by_dimension=peer_p75,
            peer_p90_by_dimension=peer_p90,
            prior_assessments=[
                {"date": str(r["date"]), "overall_percentage": float(r["overall_percentage"]), "rating": r["rating"]}
                for r in prior
            ],
        )
    finally:
        await conn.close()


def _label_for_answer(answer_value: Any, options: Any) -> str:
    """Turn the stored {'selected': '...'} (or {'value': N}) into a human label."""
    if not options:
        return str(answer_value)
    try:
        if isinstance(answer_value, dict):
            selected = answer_value.get("selected")
            if selected is None:
                selected = answer_value.get("value")
        else:
            selected = answer_value
        for opt in options:
            if str(opt.get("value")) == str(selected):
                return str(opt.get("label", selected))
        return str(selected)
    except Exception:
        return str(answer_value)


# ============================================================================
# Supabase loader (production path)
# ============================================================================
# SCHEMA NOTE
# -----------
# Supabase `abol_assessments` is denormalized:
#   - answers JSONB: {Q_ID: {"selected": <value>, "score": <0-100>, "weight": <1.0-3.0>}}
#   - dimension_scores JSONB: {"readiness": 42.5, "security_measures": 65.0, ...}
#   - overall_percentage NUMERIC(5,2), overall_rating TEXT
#
# The frontend computes scores client-side and writes them. We VERIFY the
# scores by recomputing via main.py and logging CRITICAL if they drift.
# We return the recomputed value either way (trust the reference).

# Score-mismatch tolerance: 0.1 percentage points absolute
SCORE_MISMATCH_TOLERANCE = 0.1


async def _load_from_supabase_async(assessment_id: str) -> AssessmentData:
    """Load from the live Supabase `abol_assessments` table.

    Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars.
    Uses httpx directly against the PostgREST endpoint — lighter than
    supabase-py and sufficient for our read-only needs.

    Retry policy: 2 retries with exponential backoff on network timeouts
    before raising SupabaseUnavailable. Other HTTP errors propagate
    immediately.
    """
    import httpx  # local import — only needed on this path

    supabase_url = os.environ.get("SUPABASE_URL")
    service_role = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url:
        raise LoaderConfigError("SUPABASE_URL not set")
    if not service_role:
        raise LoaderConfigError("SUPABASE_SERVICE_ROLE_KEY not set")

    endpoint = f"{supabase_url}/rest/v1/abol_assessments"
    headers = {
        "apikey": service_role,
        "Authorization": f"Bearer {service_role}",
        "Accept": "application/json",
    }
    params = {"id": f"eq.{assessment_id}", "select": "*"}

    # Network retry loop (2 retries, 1s + 2s backoff)
    last_exc: Optional[Exception] = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(endpoint, headers=headers, params=params)
                resp.raise_for_status()
                rows = resp.json()
            break
        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            last_exc = exc
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)
                log.warning(
                    "supabase_network_retry attempt=%d error=%s", attempt + 1, exc.__class__.__name__
                )
                continue
            raise SupabaseUnavailable(f"Supabase unreachable after 3 attempts: {exc}") from exc

    if not rows:
        raise AssessmentNotFound(f"assessment {assessment_id} not found")

    row = rows[0]
    status = row.get("status")
    if status != "completed":
        raise AssessmentIncomplete(
            f"assessment {assessment_id} has status '{status}', must be 'completed'"
        )

    sector = row.get("sector") or ""
    emp_bucket = row.get("employee_bucket") or ""
    answers_jsonb = row.get("answers") or {}
    dim_scores_jsonb = row.get("dimension_scores") or {}

    if not dim_scores_jsonb:
        # Scores field empty but status=completed — unexpected; recompute from answers
        log.warning("scores_missing uuid=%s recomputing_from_answers", assessment_id)
        # Keep going; the verification step recomputes regardless

    # Verify frontend-computed scores against main.py reference scoring
    recomputed = _recompute_scores_from_answers(answers_jsonb, sector)
    frontend_overall = float(row.get("overall_percentage") or 0)
    recomputed_overall = recomputed["overall_percentage"]

    if abs(frontend_overall - recomputed_overall) > SCORE_MISMATCH_TOLERANCE:
        # Log CRITICAL — means app.html scoring drifted from main.py reference
        log.critical(
            "score_mismatch uuid=%s frontend=%.2f recomputed=%.2f delta=%.2f",
            assessment_id, frontend_overall, recomputed_overall,
            recomputed_overall - frontend_overall,
        )
        # Continue with recomputed — trust the Python reference over frontend JS

    # Build answer list with question catalog enrichment
    answers: List[Dict[str, Any]] = []
    for q_id, ans in answers_jsonb.items():
        meta = _lookup_question(q_id)
        raw_score = float(ans.get("score", 0))
        weight = float(ans.get("weight", 1.0))
        selected = ans.get("selected")
        answers.append({
            "question_id": q_id,
            "dimension": meta["dimension"],
            "subcategory": meta["subcategory"],
            "question_text": meta["question_text"],
            "answer_label": str(selected) if selected is not None else "",
            "raw_score": raw_score,
            "sector_weight_applied": weight,
        })

    # Dimension scores: prefer recomputed (trustworthy), fall back to stored JSONB
    dimension_scores: List[Dict[str, Any]] = []
    for pillar, recomputed_pct in recomputed["by_dimension"].items():
        dimension_scores.append({
            "dimension": pillar,
            "percentage": round(recomputed_pct["percentage"], 1),
            "peer_percentile": None,  # filled below from external_benchmarks
            "raw_score": recomputed_pct["raw_score"],
            "max_possible": recomputed_pct["max_possible"],
        })

    # Peer benchmark: cold-start from external_benchmarks until cohort N > 30
    from external_benchmarks import get_peer_median
    peer_median = {}
    peer_p25 = {}
    peer_p75 = {}
    peer_p90: Dict[str, float] = {}  # left empty; schema has slot but public sources don't publish p90
    for ds in dimension_scores:
        pillar = ds["dimension"]
        peer = get_peer_median(sector, pillar)
        if peer["median"] is not None:
            peer_median[pillar] = float(peer["median"])
            peer_p25[pillar] = float(peer["p25"])
            peer_p75[pillar] = float(peer["p75"])

    weakest = sorted(answers, key=lambda a: a["raw_score"])[:5]

    # Compute rating from recomputed overall. Use report_design.rating_for_score —
    # same thresholds as main.compute_rating but no asyncpg dep (keeps container light).
    from report_design import rating_for_score
    rating = rating_for_score(recomputed_overall)

    return AssessmentData(
        assessment_id=str(assessment_id),
        organization_name=row.get("organization"),
        sector=sector,
        employee_bucket=emp_bucket,
        country=(row.get("countries") or [None])[0] if isinstance(row.get("countries"), list) else None,
        is_paid=bool(row.get("is_paid", False)),
        completed_at=row.get("completed_at"),
        overall_percentage=round(recomputed_overall, 1),
        overall_percentile=None,  # no cohort data yet — peer_sample_size is 0
        rating=rating,
        dimension_scores=dimension_scores,
        answers=answers,
        weakest_questions=weakest,
        peer_sample_size=0,  # 0 proprietary; public-source peer values in peer_median_by_dimension
        peer_median_by_dimension=peer_median,
        peer_p25_by_dimension=peer_p25,
        peer_p75_by_dimension=peer_p75,
        peer_p90_by_dimension=peer_p90,
        prior_assessments=[],  # Supabase schema does not track cross-assessment org history yet
    )


def _recompute_scores_from_answers(
    answers_jsonb: Dict[str, Dict[str, Any]],
    sector: str,
) -> Dict[str, Any]:
    """Recompute dimension scores + overall from raw answers using main.py logic.

    Returns {
        "overall_percentage": float,
        "by_dimension": { dimension: {percentage, raw_score, max_possible} }
    }
    """
    dim_totals: Dict[str, Dict[str, float]] = {}
    for q_id, ans in answers_jsonb.items():
        meta = _lookup_question(q_id)
        dimension = meta["dimension"]
        if dimension == "unknown":
            continue  # skip questions not in our catalog — graceful degradation
        raw = float(ans.get("score", 0))
        weight = float(ans.get("weight", 1.0))
        dim_totals.setdefault(dimension, {"weighted": 0.0, "max": 0.0, "raw_count": 0})
        dim_totals[dimension]["weighted"] += raw * weight
        dim_totals[dimension]["max"] += 100.0 * weight
        dim_totals[dimension]["raw_count"] += 1

    by_dimension: Dict[str, Dict[str, float]] = {}
    overall_w = overall_m = 0.0
    for dimension, vals in dim_totals.items():
        pct = (vals["weighted"] / vals["max"] * 100) if vals["max"] else 0.0
        by_dimension[dimension] = {
            "percentage": pct,
            "raw_score": vals["weighted"],
            "max_possible": vals["max"],
        }
        overall_w += vals["weighted"]
        overall_m += vals["max"]

    overall_pct = (overall_w / overall_m * 100) if overall_m else 0.0

    return {
        "overall_percentage": overall_pct,
        "by_dimension": by_dimension,
    }
