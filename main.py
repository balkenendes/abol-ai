"""
ABOL.ai Benchmark Platform - FastAPI Backend
=============================================
Adaptive questionnaire, sector-weighted scoring, peer benchmarking.

Run locally:
    pip install -r requirements.txt
    export DATABASE_URL="postgresql://user:pass@localhost/abol"
    psql $DATABASE_URL -f schema.sql
    psql $DATABASE_URL -f seed_questions.sql
    uvicorn main:app --reload
"""

import hashlib
import os
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional
from uuid import UUID, uuid4

import asyncpg
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

# ============================================================================
# CONFIG
# ============================================================================

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/abol")

app = FastAPI(
    title="ABOL.ai Benchmark API",
    description="AI + Quantum cyber readiness benchmark platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Lock down in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connection pool
_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool


@app.on_event("startup")
async def startup():
    await get_pool()


@app.on_event("shutdown")
async def shutdown():
    if _pool:
        await _pool.close()


# ============================================================================
# MODELS
# ============================================================================


class Sector(str, Enum):
    smb = "smb"
    corporate = "corporate"
    financial_services = "financial_services"


class Dimension(str, Enum):
    readiness = "readiness"
    security_measures = "security_measures"
    dependencies = "dependencies"
    investment = "investment"          # renamed from cost_efficiency (migration 001)
    compliance = "compliance"
    governance = "governance"
    resilience = "resilience"          # added in migration 001


class StartAssessmentRequest(BaseModel):
    sector: Sector
    employee_count_bucket: str = Field(
        ..., pattern="^(50-100|100-500|500-1000|1000-5000|5000\\+)$"
    )
    country: str = Field(..., min_length=2, max_length=2)
    email: Optional[EmailStr] = None
    organization_name: Optional[str] = None


class StartAssessmentResponse(BaseModel):
    assessment_id: UUID
    organization_id: UUID
    first_questions: list[dict]  # The initial core questions to show


class SubmitAnswerRequest(BaseModel):
    assessment_id: UUID
    question_id: str
    answer_value: dict  # {"selected": "yes"} or {"selected": ["a","b"]} or {"value": 7}


class SubmitAnswerResponse(BaseModel):
    ok: bool
    next_questions: list[dict]  # Any branch questions triggered
    progress: dict  # {"answered": 12, "total_estimated": 35}


class CompleteAssessmentRequest(BaseModel):
    assessment_id: UUID


class DimensionScore(BaseModel):
    dimension: Dimension
    percentage: float
    peer_percentile: Optional[float]
    max_possible: float
    raw_score: float


class AssessmentSummary(BaseModel):
    """Free tier result — headline only."""

    assessment_id: UUID
    overall_percentage: float
    overall_percentile: Optional[float]
    rating: str
    sector: Sector
    upgrade_url: str


class AssessmentFullReport(BaseModel):
    """Paid tier — full breakdown."""

    assessment_id: UUID
    overall_percentage: float
    overall_percentile: Optional[float]
    rating: str
    dimension_scores: list[DimensionScore]
    top_actions: list[dict]
    peer_comparison: dict


# ============================================================================
# HELPERS
# ============================================================================


def hash_email(email: str) -> str:
    return hashlib.sha256(email.lower().encode()).hexdigest()


def hash_string(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def compute_rating(percentage: float) -> str:
    if percentage >= 85:
        return "Leader"
    if percentage >= 70:
        return "Strong"
    if percentage >= 50:
        return "Fair"
    if percentage >= 30:
        return "At Risk"
    return "Critical"


async def get_active_question_version(
    conn: asyncpg.Connection, question_id: str
) -> Optional[dict]:
    """Get the currently active version of a question."""
    row = await conn.fetchrow(
        """
        SELECT qv.id AS version_id, qv.question_text, qv.help_text,
               qv.question_type, qv.options, qv.max_score, qv.is_future_proofing,
               q.dimension, q.subcategory, q.is_core, q.parent_question_id,
               q.branch_condition
        FROM questions q
        JOIN question_versions qv ON qv.question_id = q.question_id
        WHERE q.question_id = $1
          AND q.deprecated_at IS NULL
          AND qv.retired_at IS NULL
        ORDER BY qv.version_number DESC
        LIMIT 1
        """,
        question_id,
    )
    return dict(row) if row else None


async def get_sector_weight(
    conn: asyncpg.Connection, question_version_id: UUID, sector: Sector
) -> Decimal:
    row = await conn.fetchrow(
        "SELECT weight FROM sector_weights WHERE question_version_id = $1 AND sector = $2",
        question_version_id,
        sector.value,
    )
    return row["weight"] if row else Decimal("1.0")


def score_answer(answer_value: dict, options: list[dict], question_type: str) -> float:
    """Compute raw score for an answer against its options definition."""
    if question_type in ("single_choice", "scale", "boolean"):
        selected = answer_value.get("selected")
        if selected is None:
            selected = answer_value.get("value")
        for opt in options:
            if str(opt["value"]) == str(selected):
                return float(opt["score"])
        return 0.0

    if question_type == "multi_choice":
        selected = answer_value.get("selected", [])
        if not isinstance(selected, list):
            return 0.0
        # Average the scores of selected options
        scores = [float(opt["score"]) for opt in options if opt["value"] in selected]
        return sum(scores) / len(scores) if scores else 0.0

    if question_type == "numeric":
        value = answer_value.get("value", 0)
        # Options define thresholds; pick the matching bucket
        # Expected format: [{"min": 0, "max": 10, "score": 100}, ...]
        for opt in options:
            lo = opt.get("min", float("-inf"))
            hi = opt.get("max", float("inf"))
            if lo <= value <= hi:
                return float(opt["score"])
        return 0.0

    return 0.0


async def check_branch_condition(
    branch_condition: Optional[dict], answer_value: dict
) -> bool:
    """Check if a branch question should be triggered by the parent answer."""
    if not branch_condition:
        return True

    if "answer_in" in branch_condition:
        selected = answer_value.get("selected") or answer_value.get("value")
        return str(selected) in [str(v) for v in branch_condition["answer_in"]]

    return False


async def get_core_questions(conn: asyncpg.Connection) -> list[dict]:
    """Get all core (always-asked) questions with their active versions."""
    rows = await conn.fetch(
        """
        SELECT qv.id AS version_id, q.question_id, qv.question_text, qv.help_text,
               qv.question_type, qv.options, q.dimension, q.subcategory,
               qv.is_future_proofing
        FROM questions q
        JOIN question_versions qv ON qv.question_id = q.question_id
        WHERE q.deprecated_at IS NULL
          AND qv.retired_at IS NULL
          AND q.is_core = true
        ORDER BY q.dimension, q.question_id
        """
    )
    return [dict(r) for r in rows]


async def get_branch_questions_for_parent(
    conn: asyncpg.Connection, parent_question_id: str, parent_answer: dict
) -> list[dict]:
    """Find any branch questions that should now be asked."""
    rows = await conn.fetch(
        """
        SELECT qv.id AS version_id, q.question_id, qv.question_text, qv.help_text,
               qv.question_type, qv.options, q.dimension, q.subcategory,
               qv.is_future_proofing, q.branch_condition
        FROM questions q
        JOIN question_versions qv ON qv.question_id = q.question_id
        WHERE q.deprecated_at IS NULL
          AND qv.retired_at IS NULL
          AND q.parent_question_id = $1
        """,
        parent_question_id,
    )

    triggered = []
    for row in rows:
        row_dict = dict(row)
        if await check_branch_condition(row_dict["branch_condition"], parent_answer):
            triggered.append(row_dict)
    return triggered


# ============================================================================
# ENDPOINTS
# ============================================================================


@app.get("/")
async def root():
    return {
        "name": "ABOL.ai Benchmark API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/api/health")
async def health():
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchval("SELECT 1")
    return {"status": "ok", "db": result == 1}


@app.post("/api/assessments/start", response_model=StartAssessmentResponse)
async def start_assessment(req: StartAssessmentRequest, request: Request):
    """Create a new assessment and return the first core questions."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Create or reuse organization
            email_hash = hash_email(req.email) if req.email else None
            org_id = await conn.fetchval(
                """
                INSERT INTO organizations
                    (name, sector, employee_count_bucket, country, email_hash)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
                """,
                req.organization_name,
                req.sector.value,
                req.employee_count_bucket,
                req.country.upper(),
                email_hash,
            )

            # Create assessment
            client_ip = request.client.host if request.client else "unknown"
            user_agent = request.headers.get("user-agent", "unknown")

            assessment_id = await conn.fetchval(
                """
                INSERT INTO assessments
                    (organization_id, sector_snapshot, ip_hash, user_agent_hash)
                VALUES ($1, $2, $3, $4)
                RETURNING id
                """,
                org_id,
                req.sector.value,
                hash_string(client_ip),
                hash_string(user_agent),
            )

            # Fetch core questions
            core_questions = await get_core_questions(conn)

    return StartAssessmentResponse(
        assessment_id=assessment_id,
        organization_id=org_id,
        first_questions=[
            {
                "question_id": q["question_id"],
                "version_id": str(q["version_id"]),
                "dimension": q["dimension"],
                "subcategory": q["subcategory"],
                "text": q["question_text"],
                "help": q["help_text"],
                "type": q["question_type"],
                "options": q["options"],
                "is_future_proofing": q["is_future_proofing"],
            }
            for q in core_questions
        ],
    )


@app.post("/api/assessments/answer", response_model=SubmitAnswerResponse)
async def submit_answer(req: SubmitAnswerRequest):
    """Submit a single answer, score it, and return any branch questions triggered."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Verify assessment exists and is in progress
            assessment = await conn.fetchrow(
                "SELECT sector_snapshot, status FROM assessments WHERE id = $1",
                req.assessment_id,
            )
            if not assessment:
                raise HTTPException(404, "Assessment not found")
            if assessment["status"] != "in_progress":
                raise HTTPException(400, "Assessment already completed")

            sector = Sector(assessment["sector_snapshot"])

            # Get question version
            qv = await get_active_question_version(conn, req.question_id)
            if not qv:
                raise HTTPException(404, "Question not found")

            # Score the answer
            raw_score = score_answer(
                req.answer_value, qv["options"], qv["question_type"]
            )
            weight = await get_sector_weight(conn, qv["version_id"], sector)
            weighted_score = Decimal(str(raw_score)) * weight

            # Store the answer (with version_id for historical comparability)
            await conn.execute(
                """
                INSERT INTO answers
                    (assessment_id, question_id, question_version_id,
                     answer_value, raw_score, weighted_score, sector_weight_applied)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (assessment_id, question_id) DO UPDATE
                SET answer_value = EXCLUDED.answer_value,
                    raw_score = EXCLUDED.raw_score,
                    weighted_score = EXCLUDED.weighted_score,
                    sector_weight_applied = EXCLUDED.sector_weight_applied,
                    answered_at = NOW()
                """,
                req.assessment_id,
                req.question_id,
                qv["version_id"],
                req.answer_value,
                raw_score,
                weighted_score,
                weight,
            )

            # Check for branch questions triggered by this answer
            branch_questions = await get_branch_questions_for_parent(
                conn, req.question_id, req.answer_value
            )

            # Count progress
            answered_count = await conn.fetchval(
                "SELECT COUNT(*) FROM answers WHERE assessment_id = $1",
                req.assessment_id,
            )
            total_core = await conn.fetchval(
                "SELECT COUNT(*) FROM questions WHERE deprecated_at IS NULL AND is_core = true"
            )

    return SubmitAnswerResponse(
        ok=True,
        next_questions=[
            {
                "question_id": q["question_id"],
                "version_id": str(q["version_id"]),
                "dimension": q["dimension"],
                "subcategory": q["subcategory"],
                "text": q["question_text"],
                "help": q["help_text"],
                "type": q["question_type"],
                "options": q["options"],
                "is_future_proofing": q["is_future_proofing"],
            }
            for q in branch_questions
        ],
        progress={
            "answered": answered_count,
            "total_estimated": total_core,
        },
    )


@app.post("/api/assessments/complete", response_model=AssessmentSummary)
async def complete_assessment(req: CompleteAssessmentRequest):
    """Finalize the assessment, compute dimension and overall scores."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            assessment = await conn.fetchrow(
                """
                SELECT a.sector_snapshot, a.status, a.started_at, o.employee_count_bucket
                FROM assessments a
                JOIN organizations o ON o.id = a.organization_id
                WHERE a.id = $1
                """,
                req.assessment_id,
            )
            if not assessment:
                raise HTTPException(404, "Assessment not found")
            if assessment["status"] == "completed":
                raise HTTPException(400, "Assessment already completed")

            sector = assessment["sector_snapshot"]
            emp_bucket = assessment["employee_count_bucket"]

            # Compute dimension scores
            dimension_rows = await conn.fetch(
                """
                SELECT q.dimension,
                       SUM(a.weighted_score) AS total_weighted,
                       SUM(qv.max_score * a.sector_weight_applied) AS max_possible
                FROM answers a
                JOIN questions q ON q.question_id = a.question_id
                JOIN question_versions qv ON qv.id = a.question_version_id
                WHERE a.assessment_id = $1
                GROUP BY q.dimension
                """,
                req.assessment_id,
            )

            dimension_scores = []
            overall_weighted = Decimal(0)
            overall_max = Decimal(0)

            for row in dimension_rows:
                raw = row["total_weighted"] or Decimal(0)
                mx = row["max_possible"] or Decimal(1)
                pct = (raw / mx * 100) if mx > 0 else Decimal(0)

                overall_weighted += raw
                overall_max += mx

                # Compute peer percentile
                peer_percentile = await conn.fetchval(
                    """
                    SELECT percent_rank_score FROM (
                        SELECT percent_rank() OVER (ORDER BY percentage) * 100 AS percent_rank_score,
                               assessment_id
                        FROM assessment_scores s
                        JOIN assessments a ON a.id = s.assessment_id
                        JOIN organizations o ON o.id = a.organization_id
                        WHERE s.dimension = $1
                          AND a.sector_snapshot = $2
                          AND o.employee_count_bucket = $3
                          AND a.status = 'completed'
                    ) ranked
                    WHERE percent_rank_score <= (
                        SELECT percent_rank() OVER (ORDER BY percentage) * 100
                        FROM assessment_scores WHERE dimension = $1
                        AND percentage <= $4
                        LIMIT 1
                    )
                    ORDER BY percent_rank_score DESC LIMIT 1
                    """,
                    row["dimension"],
                    sector,
                    emp_bucket,
                    float(pct),
                )

                await conn.execute(
                    """
                    INSERT INTO assessment_scores
                        (assessment_id, dimension, raw_score, max_possible_score,
                         percentage, peer_percentile)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    req.assessment_id,
                    row["dimension"],
                    raw,
                    mx,
                    pct,
                    peer_percentile,
                )

                dimension_scores.append(
                    {
                        "dimension": row["dimension"],
                        "percentage": float(pct),
                        "peer_percentile": peer_percentile,
                    }
                )

            # Overall score
            overall_pct = (
                float(overall_weighted / overall_max * 100) if overall_max > 0 else 0
            )
            rating = compute_rating(overall_pct)

            await conn.execute(
                """
                INSERT INTO overall_scores
                    (assessment_id, overall_percentage, rating)
                VALUES ($1, $2, $3)
                """,
                req.assessment_id,
                overall_pct,
                rating,
            )

            # Mark completed
            await conn.execute(
                """
                UPDATE assessments
                SET status = 'completed',
                    completed_at = NOW(),
                    duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::int
                WHERE id = $1
                """,
                req.assessment_id,
            )

    return AssessmentSummary(
        assessment_id=req.assessment_id,
        overall_percentage=round(overall_pct, 1),
        overall_percentile=None,
        rating=rating,
        sector=Sector(sector),
        upgrade_url=f"/upgrade?assessment={req.assessment_id}",
    )


@app.get("/api/assessments/{assessment_id}/full", response_model=AssessmentFullReport)
async def get_full_report(assessment_id: UUID):
    """Paid tier: full report with all dimensions, peer comparison, and actions."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Check payment status
        a = await conn.fetchrow(
            "SELECT is_paid, sector_snapshot FROM assessments WHERE id = $1",
            assessment_id,
        )
        if not a:
            raise HTTPException(404, "Assessment not found")
        if not a["is_paid"]:
            raise HTTPException(402, "Payment required. Upgrade to unlock full report.")

        overall = await conn.fetchrow(
            "SELECT overall_percentage, rating FROM overall_scores WHERE assessment_id = $1",
            assessment_id,
        )
        if not overall:
            raise HTTPException(400, "Assessment not yet scored")

        dim_rows = await conn.fetch(
            """
            SELECT dimension, percentage, peer_percentile, raw_score, max_possible_score
            FROM assessment_scores WHERE assessment_id = $1
            """,
            assessment_id,
        )

        # Top actions: lowest-scoring questions with highest weights
        action_rows = await conn.fetch(
            """
            SELECT a.question_id, q.dimension, qv.question_text, a.raw_score,
                   a.sector_weight_applied
            FROM answers a
            JOIN questions q ON q.question_id = a.question_id
            JOIN question_versions qv ON qv.id = a.question_version_id
            WHERE a.assessment_id = $1
              AND a.raw_score < 50
            ORDER BY (100 - a.raw_score) * a.sector_weight_applied DESC
            LIMIT 10
            """,
            assessment_id,
        )

    return AssessmentFullReport(
        assessment_id=assessment_id,
        overall_percentage=float(overall["overall_percentage"]),
        overall_percentile=None,
        rating=overall["rating"],
        dimension_scores=[
            DimensionScore(
                dimension=Dimension(r["dimension"]),
                percentage=float(r["percentage"]),
                peer_percentile=float(r["peer_percentile"]) if r["peer_percentile"] else None,
                max_possible=float(r["max_possible_score"]),
                raw_score=float(r["raw_score"]),
            )
            for r in dim_rows
        ],
        top_actions=[
            {
                "question_id": r["question_id"],
                "dimension": r["dimension"],
                "text": r["question_text"],
                "current_score": float(r["raw_score"]),
                "weight": float(r["sector_weight_applied"]),
            }
            for r in action_rows
        ],
        peer_comparison={
            "sector": a["sector_snapshot"],
            "note": "Peer percentile computed once sample size reaches 30+ per cohort",
        },
    )


@app.post("/api/assessments/{assessment_id}/mark-paid")
async def mark_paid(assessment_id: UUID, payment_reference: str):
    """Webhook endpoint called by payment processor (Stripe) after successful payment."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE assessments
            SET is_paid = true, payment_reference = $2
            WHERE id = $1
            """,
            assessment_id,
            payment_reference,
        )
    return {"ok": True, "updated": result}


@app.get("/api/benchmarks/{sector}")
async def get_benchmark(sector: Sector):
    """Public benchmark stats for a sector (anonymized)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.dimension,
                   COUNT(*) AS sample_size,
                   AVG(s.percentage) AS mean,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY s.percentage) AS median,
                   percentile_cont(0.25) WITHIN GROUP (ORDER BY s.percentage) AS p25,
                   percentile_cont(0.75) WITHIN GROUP (ORDER BY s.percentage) AS p75
            FROM assessment_scores s
            JOIN assessments a ON a.id = s.assessment_id
            WHERE a.sector_snapshot = $1
              AND a.status = 'completed'
            GROUP BY s.dimension
            """,
            sector.value,
        )
    return {
        "sector": sector.value,
        "dimensions": [
            {
                "dimension": r["dimension"],
                "sample_size": r["sample_size"],
                "mean": float(r["mean"] or 0),
                "median": float(r["median"] or 0),
                "p25": float(r["p25"] or 0),
                "p75": float(r["p75"] or 0),
            }
            for r in rows
        ],
    }
