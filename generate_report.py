#!/usr/bin/env python3
"""
generate_report.py
==================
CLI that generates a 40+ page ABOL.ai benchmark PDF for a completed
assessment. Thin orchestration layer — data loading lives in
`report_loaders.py`, content rendering in `report_sections.py`.

Usage:
    python generate_report.py <assessment_id> [--source supabase|postgres] [--output FILE]
    python generate_report.py --demo
    python generate_report.py --source supabase <assessment_id>

Environment (per --source):
    supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (production path)
    postgres: DATABASE_URL                              (local dev / legacy)
    demo:     (none — hardcoded)

ANTHROPIC_API_KEY is always optional. If set, `report_llm` uses it for
the executive summary; otherwise the deterministic fallback summary
builds from scores alone.
"""

from __future__ import annotations

import argparse
import datetime as dt
import logging
import os
import sys
from pathlib import Path
from typing import Any, List, Optional

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
from report_loaders import (
    AssessmentData,
    LoaderError,
    load_assessment_data,
)

logging.basicConfig(
    level=os.environ.get("ABOL_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("generate_report")


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
    from reportlab.platypus.doctemplate import NextPageTemplate
    story: List[Any] = []
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

    # Paid report = personalized benchmark + full whitepaper deep dive (Sections 1-12).
    # If whitepaper_deep_dive.pdf exists alongside, append its pages so the buyer
    # gets one coherent PDF: their data first, the shared deep content after.
    # Build it via `python build_assets.py`. Non-fatal if missing.
    _attach_whitepaper_if_present(output_path)


def _attach_whitepaper_if_present(output_path: Path) -> None:
    """Concat whitepaper_deep_dive.pdf onto the end of output_path.

    No-op if the deep-dive PDF isn't on disk — paid reports still render,
    just without the appended whitepaper content. Build the deep dive with
    `python build_assets.py` (one-time, or whenever the source whitepaper
    updates).
    """
    deep_dive = Path("whitepaper_deep_dive.pdf")
    if not deep_dive.exists():
        log.info("whitepaper_deep_dive.pdf not found — skipping attach (run build_assets.py)")
        return
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        log.warning("pypdf not installed — skipping whitepaper attach")
        return

    try:
        writer = PdfWriter()
        base = PdfReader(str(output_path))
        for p in base.pages:
            writer.add_page(p)
        extra = PdfReader(str(deep_dive))
        for p in extra.pages:
            writer.add_page(p)
        with output_path.open("wb") as f:
            writer.write(f)
        log.info(
            "attached whitepaper deep dive: %d personalized + %d deep-dive = %d pages total",
            len(base.pages), len(extra.pages), len(writer.pages),
        )
    except Exception as exc:
        log.warning("whitepaper attach failed (non-fatal): %s", exc)


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
    p.add_argument(
        "--source", choices=["supabase", "postgres", "demo"],
        default=None,
        help="Data source: 'supabase' (production, default when DB creds present), "
             "'postgres' (local dev), 'demo' (no DB). Inferred from --demo or "
             "env vars when not specified.",
    )
    return p


def _infer_source(args) -> str:
    """Pick the loader source from flags + env when --source is not explicit."""
    if args.source:
        return args.source
    if args.demo:
        return "demo"
    # Prefer supabase if service-role creds are available — that's the prod path
    if os.environ.get("SUPABASE_SERVICE_ROLE_KEY") and os.environ.get("SUPABASE_URL"):
        return "supabase"
    # Fall back to postgres if DATABASE_URL is set
    if os.environ.get("DATABASE_URL"):
        return "postgres"
    return "demo"  # safest default


def _default_output_path(assessment_id: str) -> Path:
    short = assessment_id.split("-")[0] if "-" in assessment_id else assessment_id[:8]
    date = dt.date.today().strftime("%Y%m%d")
    return Path("reports") / f"abol_report_{short}_{date}.pdf"


def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.language != "en":
        log.warning("Only 'en' is supported today; falling back to English.")

    source = _infer_source(args)
    if source != "demo" and not args.assessment_id:
        parser.error("assessment_id is required unless --demo is used")

    try:
        if source == "demo":
            log.info("Demo mode: using hardcoded sample assessment")
        else:
            log.info("Loading assessment %s via source=%s", args.assessment_id, source)
        data = load_assessment_data(source, args.assessment_id or "demo")
    except LoaderError as exc:
        # Map loader errors to non-zero exit + friendly message
        log.error("Load failed (%s): %s", exc.__class__.__name__, exc)
        return 1
    except Exception as exc:  # noqa: BLE001
        log.exception("Unexpected load failure: %s", exc)
        return 2

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
