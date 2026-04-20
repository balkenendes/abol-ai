#!/usr/bin/env python3
"""
generate_report.py
==================
CLI that generates a 40+ page ABOL.ai benchmark PDF for a completed
assessment.

Usage:
    python generate_report.py <assessment_id> [--output FILE] [--language en]
    python generate_report.py --demo

Environment:
    DATABASE_URL       Postgres connection string (asyncpg)
    ANTHROPIC_API_KEY  optional — enables LLM-generated exec summary

Design:
    - All DB access happens in load_assessment_data().
    - Report composition is delegated to report_sections.py.
    - Demo mode uses a hardcoded sample assessment so the PDF pipeline can
      be exercised without any database or API key.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import logging
import os
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate

from report_design import (
    BG,
    BORDER_SUBTLE,
    BRAND_NAME,
    CONTENT_HEIGHT,
    CONTENT_WIDTH,
    FS_MONO_XS,
    MARGIN_BOTTOM,
    MARGIN_LEFT,
    MARGIN_RIGHT,
    MARGIN_TOP,
    PAGE_SIZE,
    PRODUCT_NAME,
    TEXT_MUTED,
    font_name,
    hex_to_color,
    register_fonts,
)

logging.basicConfig(
    level=os.environ.get("ABOL_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("generate_report")


# ============================================================================
# Data contract
# ============================================================================
@dataclass
class AssessmentData:
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

    dimension_scores: List[Dict[str, Any]]          # [{dimension, percentage, peer_percentile, raw_score, max_possible}]
    answers: List[Dict[str, Any]]                   # [{question_id, dimension, subcategory, question_text, answer_label, raw_score, sector_weight_applied}]
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
# DB loader
# ============================================================================
async def _load_assessment_data_async(conn, assessment_id: str) -> AssessmentData:
    """Fetch everything needed for one assessment report."""
    # Assessment + org
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
        raise SystemExit(f"Error: assessment {assessment_id} not found.")
    if row["status"] != "completed":
        raise SystemExit(
            f"Error: assessment {assessment_id} is status '{row['status']}', "
            "must be 'completed' to generate a report."
        )

    sector = row["sector_snapshot"]
    emp_bucket = row["employee_count_bucket"] or ""

    # Overall score
    overall = await conn.fetchrow(
        """
        SELECT overall_percentage, overall_percentile, rating
        FROM overall_scores WHERE assessment_id = $1
        """,
        assessment_id,
    )
    if overall is None:
        raise SystemExit(
            f"Error: assessment {assessment_id} has no overall_scores row. "
            "Was scoring completed?"
        )

    # Dimension scores
    dim_rows = await conn.fetch(
        """
        SELECT dimension, raw_score, max_possible_score, percentage, peer_percentile
        FROM assessment_scores
        WHERE assessment_id = $1
        ORDER BY dimension
        """,
        assessment_id,
    )

    # Answers joined with question metadata
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

    answers: List[Dict[str, Any]] = []
    for ar in answer_rows:
        answers.append({
            "question_id": ar["question_id"],
            "dimension": ar["dimension"],
            "subcategory": ar["subcategory"],
            "question_text": ar["question_text"],
            "answer_label": _label_for_answer(ar["answer_value"], ar["options"]),
            "raw_score": float(ar["raw_score"]),
            "sector_weight_applied": float(ar["sector_weight_applied"]),
        })

    # Peer statistics (p25/p50/p75/p90 per dimension, within same sector+size)
    peer_stats = await conn.fetch(
        """
        SELECT s.dimension,
               COUNT(*) AS n,
               percentile_cont(0.25) WITHIN GROUP (ORDER BY s.percentage) AS p25,
               percentile_cont(0.50) WITHIN GROUP (ORDER BY s.percentage) AS p50,
               percentile_cont(0.75) WITHIN GROUP (ORDER BY s.percentage) AS p75,
               percentile_cont(0.90) WITHIN GROUP (ORDER BY s.percentage) AS p90
        FROM assessment_scores s
        JOIN assessments a ON a.id = s.assessment_id
        JOIN organizations o ON o.id = a.organization_id
        WHERE a.status = 'completed'
          AND a.sector_snapshot = $1
          AND o.employee_count_bucket = $2
        GROUP BY s.dimension
        """,
        sector, emp_bucket,
    )
    peer_median = {r["dimension"]: float(r["p50"] or 0) for r in peer_stats}
    peer_p25    = {r["dimension"]: float(r["p25"] or 0) for r in peer_stats}
    peer_p75    = {r["dimension"]: float(r["p75"] or 0) for r in peer_stats}
    peer_p90    = {r["dimension"]: float(r["p90"] or 0) for r in peer_stats}
    sample_size = max((int(r["n"]) for r in peer_stats), default=0)

    # Prior assessments for this org
    prior = await conn.fetch(
        """
        SELECT a.completed_at::date AS date, os.overall_percentage, os.rating
        FROM assessments a
        JOIN overall_scores os ON os.assessment_id = a.id
        WHERE a.organization_id = (
                SELECT organization_id FROM assessments WHERE id = $1
              )
          AND a.id <> $1
          AND a.status = 'completed'
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

    # Weakest 5 questions for LLM context
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
            {
                "date": str(r["date"]),
                "overall_percentage": float(r["overall_percentage"]),
                "rating": r["rating"],
            }
            for r in prior
        ],
    )


def _label_for_answer(answer_value: Any, options: Any) -> str:
    """Turn the stored {"selected": "..."} (or {"value": N}) into a human label."""
    if not options:
        return str(answer_value)
    try:
        # answer_value is jsonb dict
        if isinstance(answer_value, dict):
            selected = answer_value.get("selected")
            if selected is None:
                selected = answer_value.get("value")
        else:
            selected = answer_value
        # options is a list of {value, label, score}
        for opt in options:
            if str(opt.get("value")) == str(selected):
                return str(opt.get("label", selected))
        return str(selected)
    except Exception:
        return str(answer_value)


def load_assessment_data(assessment_id: str) -> AssessmentData:
    """Synchronous wrapper around the async loader."""
    try:
        import asyncpg
    except ImportError as exc:
        raise SystemExit(
            "Error: asyncpg is required to load live assessment data. "
            f"Install it with `pip install asyncpg`. ({exc})"
        ) from exc

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit(
            "Error: DATABASE_URL is not set. Either export it or use --demo."
        )

    async def _runner() -> AssessmentData:
        conn = await asyncpg.connect(database_url)
        try:
            return await _load_assessment_data_async(conn, assessment_id)
        finally:
            await conn.close()

    try:
        return asyncio.run(_runner())
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"Error: failed to load assessment — {exc}") from exc


# ============================================================================
# Demo data
# ============================================================================
def _demo_assessment() -> AssessmentData:
    """Realistic sample used by --demo mode. Mirrors the frontend mockup."""
    answers: List[Dict[str, Any]] = []
    # 6 questions per pillar × 7 pillars = 42 answers
    pillar_configs = [
        ("readiness", [
            ("Q_RDY_001", "ai_threat_awareness", "How often do you review AI-enabled threat intel?", "Quarterly", 40),
            ("Q_RDY_002", "mythos_preparedness", "Preparedness for autonomous AI attacks in 6 months", "Some defenses", 40),
            ("Q_RDY_003", "quantum_timeline",    "Target date for PQC migration", "Planned 2028 or later", 40),
            ("Q_RDY_004", "hndl_risk",           "Classified data at catastrophic HNDL risk?", "Partially aware", 50),
            ("Q_RDY_005", "ai_red_team",         "AI-driven red team cadence", "Annual engagement", 40),
            ("Q_RDY_006", "ai_skills",           "Security team expertise in AI attack vectors", "Basic awareness", 35),
        ]),
        ("security_measures", [
            ("Q_SEC_001", "identity",             "Phishing-resistant MFA coverage", "50-74%", 50),
            ("Q_SEC_002", "patching",             "Median CVE to patch time", "1-3 days", 75),
            ("Q_SEC_003", "soc_coverage",         "Around-the-clock SOC coverage", "Business hours only", 25),
            ("Q_SEC_004", "encryption_inventory", "Real-time crypto inventory", "Partial visibility only", 15),
            ("Q_SEC_005", "dlp_ai",               "Protection vs AI-service data exfiltration", "Policy with periodic monitoring", 65),
            ("Q_SEC_006", "zero_trust",           "Zero-trust / segmentation scope", "Traditional segmentation", 40),
        ]),
        ("dependencies", [
            ("Q_DEP_001", "sbom",                  "Automated SBOM on every deploy?", "Manual current", 60),
            ("Q_DEP_002", "ai_vendor_risk",        "Formal review of all AI vendors?", "Major vendors only", 50),
            ("Q_DEP_003", "concentration_risk",    "Single-vendor dependency of critical ops", "20-40%", 70),
            ("Q_DEP_004", "open_source_integrity", "Open-source compromise detection", "Periodic scans only", 40),
            ("Q_DEP_005", "vendor_contracts",      "Cybersecurity clauses in vendor contracts", "Top 10-20 vendors only", 60),
            ("Q_DEP_006", "cve_triage",            "Speed to identify affected systems on CVE", "Within 24 hours", 70),
        ]),
        ("investment", [
            ("Q_INV_001", "spend_ratio",           "% of IT budget allocated to cyber", "Slightly below benchmark", 70),
            ("Q_INV_002", "pqc_budget",            "Budget allocated for PQC migration", "Partial budget, plan forming", 60),
            ("Q_INV_003", "roi_measurement",       "Quantified ROI per major investment", "Major investments only", 60),
            ("Q_INV_004", "tool_sprawl",           "Distinct security tools/vendors", "20-40 tools", 40),
            ("Q_INV_005", "contract_benchmarking", "Contract benchmarking cadence", "1-2 years ago", 60),
            ("Q_INV_006", "breach_cost_model",     "Quantified breach-cost exposure", "Rough estimate, partial cover", 60),
        ]),
        ("compliance", [
            ("Q_CMP_001", "nis2",                  "NIS2 scope and compliance", "In scope, partially compliant", 50),
            ("Q_CMP_002", "eu_ai_act",             "EU AI Act inventory and classification", "Partial inventory", 50),
            ("Q_CMP_003", "dora",                  "DORA compliance status", "Not a financial entity", 100),
            ("Q_CMP_004", "incident_reporting",    "24-hour incident reporting capability", "Best effort, not tested", 25),
            ("Q_CMP_005", "dpia",                  "DPIA coverage for high-risk activities", "For some activities only", 35),
            ("Q_CMP_006", "regulatory_tracking",   "Tracking regulatory change across jurisdictions", "Ad hoc", 10),
        ]),
        ("governance", [
            ("Q_GOV_001", "board_oversight",         "Board briefings on AI/quantum threats", "Annually", 25),
            ("Q_GOV_002", "ciso_authority",          "CISO reporting line and halt authority", "Reports to CIO", 40),
            ("Q_GOV_003", "policy_currency",         "Security policies last updated", "12-24 months old", 30),
            ("Q_GOV_004", "ai_governance_committee", "Formal AI governance committee", "Informal group", 35),
            ("Q_GOV_005", "pqc_ownership",           "Named owner for PQC migration", "Shared, no clear owner", 20),
            ("Q_GOV_006", "risk_appetite_statement", "Board-approved risk appetite statement", "Draft stage", 20),
        ]),
        ("resilience", [
            ("Q_RES_001", "ransomware_recovery_drill",      "Full-recovery drill cadence", "Annual drill", 40),
            ("Q_RES_002", "tested_recovery_time_objective", "Tested RTO for critical systems", "1-7 days", 40),
            ("Q_RES_003", "ai_incident_response_playbook",  "AI-specific incident response playbook", "Generic plan only", 30),
            ("Q_RES_004", "offline_immutable_backups",      "Offline immutable backups", "Cloud-immutable only", 45),
            ("Q_RES_005", "incident_response_retainer",     "Pre-arranged IR retainer", "Providers identified only", 30),
            ("Q_RES_006", "business_impact_analysis",       "BIA with per-hour downtime cost", "Partial analysis", 55),
        ]),
    ]

    sector = "financial_services"
    sector_weights = {
        "readiness": 2.5, "security_measures": 1.5, "dependencies": 2.2,
        "investment": 1.2, "compliance": 3.0, "governance": 2.5, "resilience": 2.0,
    }

    dim_totals: Dict[str, Dict[str, float]] = {}
    for pillar, items in pillar_configs:
        for qid, subcat, qtext, ans_label, raw in items:
            w = sector_weights.get(pillar, 1.0)
            answers.append({
                "question_id": qid,
                "dimension": pillar,
                "subcategory": subcat,
                "question_text": qtext,
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

    peer_median = {
        "readiness": 54, "security_measures": 61, "dependencies": 52,
        "investment": 58, "compliance": 67, "governance": 55, "resilience": 50,
    }
    peer_p25 = {k: v - 10 for k, v in peer_median.items()}
    peer_p75 = {k: v + 10 for k, v in peer_median.items()}
    peer_p90 = {k: v + 20 for k, v in peer_median.items()}

    weakest = sorted(answers, key=lambda a: a["raw_score"])[:5]

    from report_design import rating_for_score
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
# PDF assembly
# ============================================================================
def _draw_page_frame(canvas, doc):
    """Common page header/footer drawn on every page except the cover."""
    canvas.saveState()
    # Header line
    canvas.setStrokeColor(hex_to_color(BORDER_SUBTLE))
    canvas.setLineWidth(0.4)
    canvas.line(
        MARGIN_LEFT, PAGE_SIZE[1] - MARGIN_TOP + 8,
        PAGE_SIZE[0] - MARGIN_RIGHT, PAGE_SIZE[1] - MARGIN_TOP + 8,
    )
    # Top left brand
    canvas.setFont(font_name("mono"), FS_MONO_XS)
    canvas.setFillColor(hex_to_color(TEXT_MUTED))
    canvas.drawString(
        MARGIN_LEFT, PAGE_SIZE[1] - MARGIN_TOP + 12,
        f"{BRAND_NAME} · {PRODUCT_NAME}",
    )
    canvas.drawRightString(
        PAGE_SIZE[0] - MARGIN_RIGHT, PAGE_SIZE[1] - MARGIN_TOP + 12,
        f"Page {canvas.getPageNumber()}",
    )
    # Footer line
    canvas.line(
        MARGIN_LEFT, MARGIN_BOTTOM - 8,
        PAGE_SIZE[0] - MARGIN_RIGHT, MARGIN_BOTTOM - 8,
    )
    canvas.drawString(
        MARGIN_LEFT, MARGIN_BOTTOM - 14,
        "Confidential",
    )
    canvas.drawRightString(
        PAGE_SIZE[0] - MARGIN_RIGHT, MARGIN_BOTTOM - 14,
        dt.date.today().isoformat(),
    )
    canvas.restoreState()


def _draw_cover_frame(canvas, doc):
    """The cover page gets a minimal background tint but no header/footer."""
    canvas.saveState()
    canvas.setFillColor(hex_to_color(BG))
    canvas.rect(0, 0, PAGE_SIZE[0], PAGE_SIZE[1], stroke=0, fill=1)
    canvas.restoreState()


def _build_document(output_path: Path) -> BaseDocTemplate:
    doc = BaseDocTemplate(
        str(output_path),
        pagesize=PAGE_SIZE,
        leftMargin=MARGIN_LEFT,
        rightMargin=MARGIN_RIGHT,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
        title="ABOL.ai AI & Quantum Security Index — Benchmark Report",
        author="ABOL.ai",
    )
    frame = Frame(
        MARGIN_LEFT, MARGIN_BOTTOM,
        CONTENT_WIDTH, CONTENT_HEIGHT,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        id="content",
    )
    doc.addPageTemplates([
        PageTemplate(id="cover",   frames=[frame], onPage=_draw_cover_frame),
        PageTemplate(id="content", frames=[frame], onPage=_draw_page_frame),
    ])
    return doc


def build_pdf(data: AssessmentData, output_path: Path) -> None:
    """Compose all sections and write the PDF to disk."""
    register_fonts()

    # Import section builders lazily so font registration happens first
    from report_sections import (
        back_cover_section,
        business_case_section,
        cover_section,
        executive_summary_section,
        historical_trends_section,
        methodology_appendix_section,
        methodology_intro_section,
        peer_benchmark_section,
        pillar_sections,
        regulatory_section,
        vendor_section,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = _build_document(output_path)

    data_dict = data.to_dict()
    story: List[Any] = []
    story.extend(cover_section(data_dict))
    # Switch to content template after cover
    from reportlab.platypus.doctemplate import NextPageTemplate
    story.insert(0, NextPageTemplate("content"))     # default for flowables before cover break
    # Actually — the first page IS the cover, then every page after uses "content".
    # Reorder:
    story = []
    story.append(NextPageTemplate("cover"))
    story.extend(cover_section(data_dict))
    story.append(NextPageTemplate("content"))
    story.extend(executive_summary_section(data_dict))
    story.extend(methodology_intro_section(data_dict))
    story.extend(pillar_sections(data_dict))
    story.extend(peer_benchmark_section(data_dict))
    story.extend(business_case_section(data_dict))
    story.extend(regulatory_section(data_dict))
    story.extend(vendor_section(data_dict))
    story.extend(historical_trends_section(data_dict))
    story.extend(methodology_appendix_section(data_dict))
    story.extend(back_cover_section(data_dict))

    doc.build(story)


# ============================================================================
# CLI
# ============================================================================
def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="generate_report.py",
        description="Generate a 40+ page ABOL.ai benchmark PDF.",
    )
    p.add_argument(
        "assessment_id", nargs="?",
        help="UUID of a completed assessment. Omit when using --demo.",
    )
    p.add_argument(
        "--output", "-o",
        help="Output PDF path (default: ./reports/abol_report_<id>_<YYYYMMDD>.pdf)",
    )
    p.add_argument(
        "--language", default="en",
        help="Report language (only 'en' is supported today).",
    )
    p.add_argument(
        "--demo", action="store_true",
        help="Generate a PDF with hardcoded sample data (no DB required).",
    )
    return p


def _default_output_path(assessment_id: str) -> Path:
    short = assessment_id.split("-")[0] if "-" in assessment_id else assessment_id[:8]
    date = dt.date.today().strftime("%Y%m%d")
    return Path("reports") / f"abol_report_{short}_{date}.pdf"


def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.language != "en":
        log.warning("Only 'en' is supported today; falling back to English.")

    if args.demo:
        data = _demo_assessment()
        log.info("Demo mode: using hardcoded sample assessment")
    else:
        if not args.assessment_id:
            parser.error("assessment_id is required unless --demo is used")
        log.info("Loading assessment %s from database", args.assessment_id)
        data = load_assessment_data(args.assessment_id)
        log.info(
            "Loaded %d answers across %d dimensions, overall %.1f (%s)",
            len(data.answers), len(data.dimension_scores),
            data.overall_percentage, data.rating,
        )

    output = Path(args.output) if args.output else _default_output_path(data.assessment_id)
    log.info("Building PDF -> %s", output)
    build_pdf(data, output)

    log.info("Done. PDF: %s (size %.1f KB)", output, output.stat().st_size / 1024)
    print(str(output))
    return 0


if __name__ == "__main__":
    sys.exit(main())
