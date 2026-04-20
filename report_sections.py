"""
report_sections.py
==================
One function per report section. Each function takes the assessment data
object and returns a list of ReportLab Flowables ready to be dropped into
the document story.

Sections follow the spec:
  1. Cover
  2. Executive Summary
  3. How this report was built
  4. Seven Pillars (2 pages each = 14 pages)
  5. Peer Benchmark (3 pages)
  6. Business Case (6 pages)
  7. Regulatory Context (4 pages)
  8. Vendor Recommendations (3 pages)
  9. Historical Trends (2 pages)
 10. Methodology & Appendix (4 pages)
 11. Back cover
"""

from __future__ import annotations

import datetime as dt
from dataclasses import asdict
from typing import Any, Dict, Iterable, List, Optional, Sequence

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable,
    HRFlowable,
    KeepInFrame,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from external_benchmarks import (
    IBM_2024,
    SECTOR_BREACH_MULTIPLIER,
    THALES_2026,
    get_relevant_thales_stat,
)
from report_charts import (
    ibcs_horizontal_bar_chart,
    pillar_gap_bar,
    priority_action_card,
    radar_chart_7_axis,
    roadmap_gantt,
    score_ring,
)
from report_design import (
    ACCENT,
    ACCENT_DARK,
    ACCENT_LIGHTER,
    BG_SURFACE,
    BORDER,
    BORDER_SUBTLE,
    BRAND_NAME,
    CONFIDENTIAL_STATEMENT,
    CONTENT_WIDTH,
    CORAL,
    DIM_COLORS,
    DIM_DESCRIPTIONS,
    DIM_LABELS,
    DIM_ORDER,
    FS_BODY,
    FS_BODY_SM,
    FS_CAPTION,
    FS_DISPLAY_L,
    FS_DISPLAY_M,
    FS_DISPLAY_XL,
    FS_H1,
    FS_H2,
    FS_H3,
    FS_MONO_SM,
    FS_MONO_XS,
    IBCS_AC,
    IBCS_BM,
    IBCS_GRID,
    IBCS_NEG,
    IBCS_POS,
    LINE_H_NORMAL,
    LINE_H_TIGHT,
    PRODUCT_NAME,
    RATINGS,
    SAGE,
    TEXT,
    TEXT_MUTED,
    TEXT_SECONDARY,
    font_name,
    hex_to_color,
    rating_for_score,
)
from report_llm import ExecutiveSummary, build_executive_summary


# ============================================================================
# Style factory — paragraph styles are lazily built once per report
# ============================================================================
class _Styles:
    def __init__(self):
        self.body = ParagraphStyle(
            "body", fontName=font_name("regular"),
            fontSize=FS_BODY, leading=FS_BODY * LINE_H_NORMAL,
            textColor=hex_to_color(TEXT), spaceAfter=6,
        )
        self.body_small = ParagraphStyle(
            "body_small", parent=self.body,
            fontSize=FS_BODY_SM, leading=FS_BODY_SM * LINE_H_NORMAL,
            textColor=hex_to_color(TEXT_SECONDARY),
        )
        self.caption = ParagraphStyle(
            "caption", parent=self.body,
            fontSize=FS_CAPTION, leading=FS_CAPTION * 1.3,
            textColor=hex_to_color(TEXT_MUTED),
        )
        self.mono_caption = ParagraphStyle(
            "mono_caption", parent=self.caption,
            fontName=font_name("mono"),
        )
        self.h1 = ParagraphStyle(
            "h1", fontName=font_name("extrabold"),
            fontSize=FS_H1, leading=FS_H1 * LINE_H_TIGHT,
            textColor=hex_to_color(TEXT), spaceAfter=10,
        )
        self.h2 = ParagraphStyle(
            "h2", fontName=font_name("bold"),
            fontSize=FS_H2, leading=FS_H2 * LINE_H_TIGHT,
            textColor=hex_to_color(TEXT), spaceAfter=8,
        )
        self.h3 = ParagraphStyle(
            "h3", fontName=font_name("semibold"),
            fontSize=FS_H3, leading=FS_H3 * LINE_H_TIGHT,
            textColor=hex_to_color(TEXT), spaceAfter=6,
        )
        self.label = ParagraphStyle(
            "label", fontName=font_name("mono_bold"),
            fontSize=FS_MONO_XS, leading=FS_MONO_XS * 1.3,
            textColor=hex_to_color(ACCENT), spaceAfter=4,
            alignment=0,
        )
        self.message = ParagraphStyle(
            "message", parent=self.body,
            fontName=font_name("bold"),
            fontSize=FS_H3, leading=FS_H3 * LINE_H_TIGHT,
            textColor=hex_to_color(IBCS_AC), spaceAfter=8,
        )


_STYLES: Optional[_Styles] = None


def _styles() -> _Styles:
    global _STYLES
    if _STYLES is None:
        _STYLES = _Styles()
    return _STYLES


# ============================================================================
# Helpers
# ============================================================================
def _hr(color_hex: str = IBCS_AC, thickness: float = 1.0, space_after: float = 6):
    return HRFlowable(
        width="100%", thickness=thickness,
        color=hex_to_color(color_hex),
        spaceBefore=0, spaceAfter=space_after,
    )


def _label(text: str, color_hex: str = ACCENT) -> Paragraph:
    st = _styles()
    style = ParagraphStyle(
        f"label_{color_hex}",
        parent=st.label, textColor=hex_to_color(color_hex),
    )
    return Paragraph(text.upper(), style)


def _money_eur(amount: float) -> str:
    """Format a euro amount with K/M suffix."""
    if amount >= 1_000_000:
        return f"€{amount / 1_000_000:.1f}M"
    if amount >= 1_000:
        return f"€{amount / 1_000:.0f}K"
    return f"€{amount:.0f}"


def _page_break() -> PageBreak:
    return PageBreak()


# ============================================================================
# Section 1 — COVER
# ============================================================================
def cover_section(data: Dict[str, Any]) -> List[Flowable]:
    st = _styles()
    story: List[Flowable] = []

    score = float(data.get("overall_percentage", 0))
    rating = data.get("rating") or rating_for_score(score)
    rating_cfg = RATINGS.get(rating, RATINGS["At Risk"])
    org_name = data.get("organization_name") or "Confidential Assessment"
    assessment_id = str(data.get("assessment_id", "—"))
    gen_date = dt.date.today().isoformat()

    # Hexagon logo mark + wordmark + spacer
    story.append(Spacer(1, 20 * mm))
    story.append(_label("The AI &amp; Quantum Security Index", ACCENT))

    # Title
    story.append(Paragraph(
        "Benchmark Report",
        ParagraphStyle(
            "cover_title", fontName=font_name("extrabold"),
            fontSize=42, leading=44,
            textColor=hex_to_color(TEXT), spaceAfter=6,
        ),
    ))
    story.append(Paragraph(
        f"Prepared for <b>{_escape(org_name)}</b>",
        ParagraphStyle(
            "cover_sub", fontName=font_name("regular"),
            fontSize=14, leading=18,
            textColor=hex_to_color(TEXT_SECONDARY), spaceAfter=4,
        ),
    ))
    story.append(Paragraph(
        f"Assessment {assessment_id}  ·  Published {gen_date}",
        ParagraphStyle(
            "cover_meta", fontName=font_name("mono"),
            fontSize=FS_MONO_SM, leading=FS_MONO_SM * 1.4,
            textColor=hex_to_color(TEXT_MUTED), spaceAfter=20,
        ),
    ))

    # Giant score
    story.append(Spacer(1, 14 * mm))
    score_style = ParagraphStyle(
        "cover_score", fontName=font_name("mono_bold"),
        fontSize=FS_DISPLAY_XL, leading=FS_DISPLAY_XL,
        textColor=hex_to_color(rating_cfg["color"]), spaceAfter=0,
    )
    story.append(Paragraph(f"{score:.0f}", score_style))
    story.append(Paragraph(
        f"/ 100  ·  <b>{rating}</b>",
        ParagraphStyle(
            "cover_rating", fontName=font_name("medium"),
            fontSize=18, leading=22,
            textColor=hex_to_color(rating_cfg["color"]), spaceAfter=20,
        ),
    ))

    # Rating scale strip
    scale = [
        ("Critical", "Critical"),
        ("At Risk",  "At Risk"),
        ("Fair",     "Fair"),
        ("Strong",   "Strong"),
        ("Leader",   "Leader"),
    ]
    cells = []
    for label, _ in scale:
        cfg = RATINGS[label]
        active = label == rating
        cells.append(Paragraph(
            f"<b>{label}</b>" if active else label,
            ParagraphStyle(
                f"scale_{label}",
                fontName=font_name("bold" if active else "regular"),
                fontSize=FS_BODY_SM,
                textColor=hex_to_color(cfg["color"] if active else TEXT_MUTED),
                alignment=1,
            ),
        ))
    t = Table([cells], colWidths=[CONTENT_WIDTH / 5] * 5)
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, hex_to_color(BORDER)),
        ("LINEBEFORE", (1, 0), (-1, -1), 0.4, hex_to_color(BORDER_SUBTLE)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 40 * mm))

    # Footer
    story.append(_hr(BORDER))
    story.append(Paragraph(
        f"© {dt.date.today().year} {BRAND_NAME}  ·  {CONFIDENTIAL_STATEMENT}",
        st.mono_caption,
    ))
    story.append(_page_break())
    return story


# ============================================================================
# Section 2 — EXECUTIVE SUMMARY
# ============================================================================
def executive_summary_section(data: Dict[str, Any]) -> List[Flowable]:
    st = _styles()
    story: List[Flowable] = []
    summary: ExecutiveSummary = build_executive_summary(data)

    story.append(_label("Executive summary"))
    story.append(Paragraph(
        "Your organization at a glance",
        st.h1,
    ))
    story.append(Paragraph(summary.paragraph_1, st.body))
    story.append(Paragraph(summary.paragraph_2, st.body))
    story.append(Paragraph(summary.paragraph_3, st.body))

    story.append(Spacer(1, 6 * mm))

    # Per-pillar bar scorecard
    story.append(_label("Pillar scorecard", ACCENT_DARK))
    dim_map = {d.get("dimension"): d for d in data.get("dimension_scores", [])}
    peer_map = data.get("peer_median_by_dimension", {})
    for pillar in DIM_ORDER:
        d = dim_map.get(pillar)
        if not d:
            continue
        story.append(pillar_gap_bar(
            label=DIM_LABELS.get(pillar, pillar),
            your_score=float(d.get("percentage", 0)),
            peer_median=float(peer_map.get(pillar, 52)),
            width=CONTENT_WIDTH,
            height=10 * mm,
        ))

    story.append(_page_break())

    # Top-3 actions
    story.append(_label("Top 3 urgent actions"))
    story.append(Paragraph("What to do in the next 30 days", st.h2))
    for i, action in enumerate(summary.top_3_actions, start=1):
        item_style = ParagraphStyle(
            f"top_action_{i}", parent=st.body,
            leftIndent=24, firstLineIndent=-24,
            spaceAfter=8,
        )
        story.append(Paragraph(
            f"<font name='{font_name('mono_bold')}' color='{ACCENT}'>0{i}</font>"
            f"  &nbsp;&nbsp;{_escape(action)}",
            item_style,
        ))

    story.append(Spacer(1, 8 * mm))
    story.append(_hr(BORDER_SUBTLE))
    story.append(Paragraph(
        f"Summary source: {summary.source} (LLM with rule-based fallback).",
        st.mono_caption,
    ))

    story.append(_page_break())
    return story


# ============================================================================
# Section 3 — HOW THIS REPORT WAS BUILT
# ============================================================================
def methodology_intro_section(data: Dict[str, Any]) -> List[Flowable]:
    st = _styles()
    story: List[Flowable] = []

    story.append(_label("Methodology overview"))
    story.append(Paragraph("How this report was built", st.h1))

    story.append(Paragraph(
        "The ABOL.ai AI &amp; Quantum Security Index scores every assessed "
        "organization across seven pillars, using 42 weighted questions. "
        "Each question carries a sector-specific multiplier: for example, "
        "Compliance is weighted 3.0× for Financial Services but 1.2× for SMBs. "
        "Scores are computed at answer time and frozen, so future changes to "
        "question wording or weights do not retroactively shift any historic "
        "assessment.",
        st.body,
    ))

    peer_n = int(data.get("peer_sample_size", 0))
    sector = (data.get("sector") or "unknown").replace("_", " ")
    emp_bucket = data.get("employee_bucket") or "unknown"
    story.append(Paragraph(
        f"Your assessment is compared to <b>{peer_n}</b> peers in the "
        f"<b>{sector}</b> sector, size bucket <b>{emp_bucket}</b>. "
        f"Percentiles (p10, p25, p50, p75, p90) are derived from the "
        f"completed_assessments view in the ABOL database.",
        st.body,
    ))

    # Sector weight table for the current organization
    sector_key = (data.get("sector") or "smb")
    story.append(Spacer(1, 4 * mm))
    story.append(_label("Sector weights applied", ACCENT_DARK))
    header = ["Pillar", "Weight applied", "Interpretation"]
    rows = [header]
    default_weights = _default_sector_weights(sector_key)
    for pillar in DIM_ORDER:
        w = default_weights.get(pillar, 1.0)
        rows.append([
            DIM_LABELS[pillar],
            f"{w:.1f}×",
            _weight_narrative(w),
        ])
    t = Table(rows, colWidths=[55 * mm, 30 * mm, CONTENT_WIDTH - 85 * mm])
    t.setStyle(_ibcs_table_style(header_row=True))
    story.append(t)

    story.append(Spacer(1, 6 * mm))
    story.append(_label("Data sources", TEXT_MUTED))
    story.append(Paragraph(
        "Thales 2026 Data Threat Report (n=3,120 across 20 countries). "
        "IBM Cost of a Data Breach Report 2024 (annual study). "
        "ABOL.ai peer network — 287 anonymized European organizations.",
        st.caption,
    ))

    story.append(_hr(BORDER_SUBTLE))
    story.append(Paragraph(CONFIDENTIAL_STATEMENT, st.mono_caption))

    story.append(_page_break())
    return story


def _default_sector_weights(sector: str) -> Dict[str, float]:
    """Mirror the sector weights used by the front-end for display purposes."""
    table = {
        "smb":                {"readiness": 1.0, "security_measures": 1.5, "dependencies": 1.0, "investment": 1.3, "compliance": 1.2, "governance": 1.0, "resilience": 1.4},
        "corporate":          {"readiness": 1.5, "security_measures": 1.5, "dependencies": 1.8, "investment": 1.0, "compliance": 2.0, "governance": 1.8, "resilience": 1.5},
        "financial_services": {"readiness": 2.5, "security_measures": 1.5, "dependencies": 2.2, "investment": 1.2, "compliance": 3.0, "governance": 2.5, "resilience": 2.0},
    }
    return table.get(sector, table["smb"])


def _weight_narrative(w: float) -> str:
    if w >= 2.5:
        return "Critical — regulatory or systemic risk amplifier"
    if w >= 1.8:
        return "High — regulated/elevated sector exposure"
    if w >= 1.3:
        return "Elevated — materially affects posture"
    if w >= 1.0:
        return "Baseline weight"
    return "Reduced weight"


# ============================================================================
# Section 4 — SEVEN PILLARS (2 pages per pillar)
# ============================================================================
def pillar_sections(data: Dict[str, Any]) -> List[Flowable]:
    story: List[Flowable] = []
    for pillar in DIM_ORDER:
        story.extend(_pillar_page_a(data, pillar))
        story.extend(_pillar_page_b(data, pillar))
    return story


def _pillar_page_a(data: Dict[str, Any], pillar: str) -> List[Flowable]:
    st = _styles()
    story: List[Flowable] = []

    # Locate the pillar score
    dim_scores = {d.get("dimension"): d for d in data.get("dimension_scores", [])}
    dim = dim_scores.get(pillar) or {}
    score = float(dim.get("percentage", 0))
    peer_pctile = dim.get("peer_percentile")
    peer_median = float(data.get("peer_median_by_dimension", {}).get(pillar, 52))
    top_quartile = float(data.get("peer_p75_by_dimension", {}).get(pillar, 68))
    rating = rating_for_score(score)
    rating_cfg = RATINGS[rating]
    color_hex = DIM_COLORS.get(pillar, ACCENT)

    story.append(_label(f"Pillar · {DIM_LABELS.get(pillar, pillar)}", color_hex))
    story.append(Paragraph(DIM_LABELS.get(pillar, pillar), st.h1))
    story.append(Paragraph(
        DIM_DESCRIPTIONS.get(pillar, ""),
        st.body_small,
    ))
    story.append(Spacer(1, 4 * mm))

    # Score block — score ring + rating + percentile
    ring = score_ring(score, size=36 * mm, color_hex=rating_cfg["color"])
    stats_rows = [
        ["Rating",
         Paragraph(
             f"<b><font color='{rating_cfg['color']}'>{rating}</font></b>",
             st.body)],
        ["Peer percentile",
         Paragraph(
             f"Better than <b>{int(peer_pctile) if peer_pctile is not None else '—'}%</b> of peers"
             if peer_pctile is not None else "—",
             st.body,
         )],
        ["Peer median", Paragraph(f"{peer_median:.0f} / 100", st.body)],
        ["Top quartile", Paragraph(f"{top_quartile:.0f} / 100", st.body)],
    ]
    stats_tbl = Table(stats_rows, colWidths=[38 * mm, CONTENT_WIDTH - 38 * mm - 45 * mm])
    stats_tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), font_name("mono")),
        ("FONTSIZE", (0, 0), (0, -1), FS_MONO_XS),
        ("TEXTCOLOR", (0, 0), (0, -1), hex_to_color(TEXT_MUTED)),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, hex_to_color(BORDER_SUBTLE)),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))

    top_block = Table(
        [[ring, stats_tbl]],
        colWidths=[45 * mm, CONTENT_WIDTH - 45 * mm],
    )
    top_block.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(top_block)
    story.append(Spacer(1, 6 * mm))

    # IBCS bar chart
    story.append(_label("Your score vs. peer cohort", ACCENT_DARK))
    story.append(ibcs_horizontal_bar_chart(
        your_score=score,
        peer_median=peer_median,
        peer_top_quartile=top_quartile,
        width=CONTENT_WIDTH,
        height=34 * mm,
    ))
    story.append(Spacer(1, 4 * mm))

    # External benchmark callout
    ext = get_relevant_thales_stat(pillar, score)
    callout_rows = [
        [Paragraph(
            f"<b><font name='{font_name('mono_bold')}' color='{ACCENT_DARK}' size='11'>"
            f"{_escape(ext['stat'])}</font></b>  "
            f"<b>{_escape(ext['headline'])}</b>",
            st.body,
        )],
        [Paragraph(_escape(ext["narrative"]), st.body_small)],
        [Paragraph(f"Source: {_escape(ext['source'])}", st.mono_caption)],
    ]
    callout_tbl = Table(callout_rows, colWidths=[CONTENT_WIDTH])
    callout_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), hex_to_color(BG_SURFACE)),
        ("LINEBEFORE", (0, 0), (0, -1), 3, hex_to_color(color_hex)),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(callout_tbl)

    story.append(_page_break())
    return story


def _pillar_page_b(data: Dict[str, Any], pillar: str) -> List[Flowable]:
    st = _styles()
    story: List[Flowable] = []
    color_hex = DIM_COLORS.get(pillar, ACCENT)

    story.append(_label(f"Pillar · {DIM_LABELS.get(pillar, pillar)} — detail", color_hex))
    story.append(Paragraph("Question-level breakdown", st.h1))

    # Find all answers for this pillar
    answers = [a for a in data.get("answers", []) if a.get("dimension") == pillar]
    if not answers:
        story.append(Paragraph(
            "No answers recorded for this pillar.",
            st.body,
        ))
        story.append(_page_break())
        return story

    header = ["#", "Question", "Your answer", "Score", "Weight"]
    rows: List[List[Any]] = [header]
    for i, a in enumerate(answers, start=1):
        qtext = a.get("question_text", "") or ""
        ans = a.get("answer_label", "") or "—"
        raw = float(a.get("raw_score", 0))
        w = float(a.get("sector_weight_applied", 1.0))
        rows.append([
            str(i),
            Paragraph(_escape(_truncate_text(qtext, 80)), st.body_small),
            Paragraph(_escape(_truncate_text(ans, 40)), st.body_small),
            f"{raw:.0f}",
            f"{w:.1f}×",
        ])

    t = Table(rows, colWidths=[
        8 * mm, CONTENT_WIDTH * 0.46, CONTENT_WIDTH * 0.28, 14 * mm, 14 * mm,
    ])
    style_cmds = _ibcs_table_style(header_row=True)
    # Highlight weak rows
    for row_idx, a in enumerate(answers, start=1):
        if float(a.get("raw_score", 0)) < 50:
            style_cmds.append(("LINEBEFORE", (0, row_idx), (0, row_idx), 3, hex_to_color(IBCS_NEG)))
            style_cmds.append(("BACKGROUND", (0, row_idx), (-1, row_idx), hex_to_color("#FDEEEE")))
    t.setStyle(TableStyle(style_cmds))
    story.append(t)
    story.append(Spacer(1, 4 * mm))

    # Top 2 gaps narrative
    weakest = sorted(answers, key=lambda a: float(a.get("raw_score", 100)))[:2]
    if weakest:
        story.append(_label("Top 2 gaps in this pillar", IBCS_NEG))
        for a in weakest:
            narrative = _gap_narrative(a)
            story.append(Paragraph(narrative, st.body))

    story.append(_page_break())
    return story


def _gap_narrative(answer: Dict[str, Any]) -> str:
    """Rule-based template text explaining a gap."""
    qtext = _escape(_truncate_text(answer.get("question_text", ""), 140))
    raw = float(answer.get("raw_score", 0))
    w = float(answer.get("sector_weight_applied", 1.0))
    if raw < 15:
        severity = "critical gap"
    elif raw < 35:
        severity = "material gap"
    elif raw < 50:
        severity = "notable gap"
    else:
        severity = "emerging gap"
    return (
        f"<b>{severity.title()}</b> on: {qtext} "
        f"Current score: <b>{raw:.0f}/100</b> (sector weight {w:.1f}×). "
        f"This question contributes disproportionately to the overall pillar "
        f"result given the applied weight; closing it is a high-leverage move."
    )


# ============================================================================
# Section 5 — PEER BENCHMARK (3 pages)
# ============================================================================
def peer_benchmark_section(data: Dict[str, Any]) -> List[Flowable]:
    st = _styles()
    story: List[Flowable] = []

    # Page 1 — radar chart
    story.append(_label("Peer benchmark"))
    story.append(Paragraph("Seven-pillar comparison", st.h1))
    story.append(Paragraph(
        "The chart below overlays your scores (solid), peer median (outlined) "
        "and sector top quartile (hatched) across all seven pillars. "
        "Wider separation to the outer rings indicates stronger relative "
        "posture; bunching near the center flags systemic weakness.",
        st.body,
    ))
    your_dict = {
        d["dimension"]: d.get("percentage", 0)
        for d in data.get("dimension_scores", [])
    }
    peer_dict = data.get("peer_median_by_dimension", {}) or {}
    tq_dict = data.get("peer_p75_by_dimension", {}) or {}
    story.append(Spacer(1, 4 * mm))
    story.append(radar_chart_7_axis(
        your_scores=your_dict,
        peer_scores=peer_dict,
        top_quartile_scores=tq_dict,
        size=140 * mm,
    ))
    story.append(_page_break())

    # Page 2 — detailed comparison table with percentiles
    story.append(_label("Benchmark detail"))
    story.append(Paragraph("Your score vs. sector percentiles", st.h1))
    header = ["Pillar", "You", "p25", "p50", "p75", "p90", "Δ vs. p50"]
    rows: List[List[Any]] = [header]
    p25_map = data.get("peer_p25_by_dimension", {}) or {}
    p90_map = data.get("peer_p90_by_dimension", {}) or {}
    for pillar in DIM_ORDER:
        your = float(your_dict.get(pillar, 0))
        p50 = float(peer_dict.get(pillar, 0))
        delta = your - p50
        delta_color = IBCS_POS if delta >= 0 else IBCS_NEG
        delta_str = f"<font color='{delta_color}'><b>{_signed(delta)}</b></font>"
        rows.append([
            DIM_LABELS[pillar],
            f"{your:.0f}",
            f"{float(p25_map.get(pillar, 0)):.0f}",
            f"{p50:.0f}",
            f"{float(tq_dict.get(pillar, 0)):.0f}",
            f"{float(p90_map.get(pillar, 0)):.0f}",
            Paragraph(delta_str, st.body_small),
        ])
    t = Table(rows, colWidths=[55 * mm, 15 * mm, 15 * mm, 15 * mm, 15 * mm, 15 * mm, CONTENT_WIDTH - 130 * mm])
    t.setStyle(_ibcs_table_style(header_row=True, numeric_cols=[1, 2, 3, 4, 5, 6]))
    story.append(t)

    story.append(Spacer(1, 4 * mm))
    story.append(_label("Sample note", TEXT_MUTED))
    story.append(Paragraph(
        f"Sample size: <b>n = {int(data.get('peer_sample_size', 0))}</b>  ·  "
        f"Sector: <b>{_escape((data.get('sector') or '').replace('_', ' '))}</b>  ·  "
        f"Size bucket: <b>{_escape(data.get('employee_bucket', '—'))}</b>",
        st.caption,
    ))
    story.append(_page_break())

    # Page 3 — external benchmarks
    story.append(_label("External benchmarks"))
    story.append(Paragraph("How the industry compares", st.h1))

    # IBM 2024
    ibm_rows = [
        ["Metric", "Value", "Source"],
        [
            "Average breach cost (global)",
            f"USD {IBM_2024['avg_breach_cost_global_usd']:,.0f}",
            "IBM 2024",
        ],
        [
            "Average breach cost (Europe)",
            f"EUR {IBM_2024['avg_breach_cost_europe_eur']:,.0f}",
            "IBM 2024",
        ],
        [
            "Mean time to identify",
            f"{IBM_2024['mean_time_to_identify_days']} days",
            "IBM 2024",
        ],
        [
            "Mean time to contain",
            f"{IBM_2024['mean_time_to_contain_days']} days",
            "IBM 2024",
        ],
        [
            "AI automation savings per breach",
            f"USD {IBM_2024['ai_automation_savings_usd']:,.0f}",
            "IBM 2024",
        ],
    ]
    t = Table(ibm_rows, colWidths=[
        CONTENT_WIDTH * 0.55, CONTENT_WIDTH * 0.22, CONTENT_WIDTH * 0.23,
    ])
    t.setStyle(_ibcs_table_style(header_row=True, numeric_cols=[1]))
    story.append(t)
    story.append(Spacer(1, 4 * mm))

    # Thales 2026 (selection of most striking stats)
    thales_rows = [
        ["Indicator (2026)", "Value", "Source"],
        ["Firms with dedicated AI security budget", f"{THALES_2026['ai_security_budget_dedicated']*100:.0f}%", "Thales 2026"],
        ["Firms funding AI security from existing budget", f"{THALES_2026['ai_security_budget_existing']*100:.0f}%", "Thales 2026"],
        ["Firms that have seen deepfake attacks", f"{THALES_2026['deepfake_attacks_seen']*100:.0f}%", "Thales 2026"],
        ["C-suite reporting no breach (vs IT)", f"{THALES_2026['c_suite_breach_blind_spot']*100:.0f}%", "Thales 2026"],
        ["Firms with complete data-location knowledge", f"{THALES_2026['complete_data_location_knowledge']*100:.0f}%", "Thales 2026"],
        ["Firms that cite harvest-now-decrypt-later", f"{THALES_2026['hndl_top_concern']*100:.0f}%", "Thales 2026"],
        ["Firms prototyping post-quantum crypto", f"{THALES_2026['pqc_prototyping']*100:.0f}%", "Thales 2026"],
    ]
    t = Table(thales_rows, colWidths=[
        CONTENT_WIDTH * 0.55, CONTENT_WIDTH * 0.22, CONTENT_WIDTH * 0.23,
    ])
    t.setStyle(_ibcs_table_style(header_row=True, numeric_cols=[1]))
    story.append(t)
    story.append(Spacer(1, 4 * mm))

    story.append(_label("Additional benchmarks", TEXT_MUTED))
    story.append(Paragraph(
        "Placeholder — future editions of this report will integrate ENISA, "
        "Verizon DBIR, Microsoft Digital Defense and Mandiant M-Trends data.",
        st.caption,
    ))

    story.append(_page_break())
    return story


# ============================================================================
# Section 6 — BUSINESS CASE (6 pages)
# ============================================================================
def business_case_section(data: Dict[str, Any]) -> List[Flowable]:
    st = _styles()
    story: List[Flowable] = []

    score = float(data.get("overall_percentage", 0))
    sector = data.get("sector", "smb")
    multiplier = SECTOR_BREACH_MULTIPLIER.get(sector, SECTOR_BREACH_MULTIPLIER["_default"])
    base_cost = float(IBM_2024["avg_breach_cost_europe_eur"])
    # Exposure formula: inflated by posture gap (1 - score/100)^0.5
    gap_factor = max(0.0, 1.0 - score / 100) ** 0.5
    breach_exposure = base_cost * multiplier * gap_factor

    # Breakdown — simple proportional split (IBM-style buckets)
    # detection & escalation, notification, post-breach response, lost business
    breakdown = {
        "Detection & escalation": breach_exposure * 0.30,
        "Notification costs":     breach_exposure * 0.10,
        "Post-breach response":   breach_exposure * 0.30,
        "Lost business":          breach_exposure * 0.30,
    }

    # Page 1 — current exposure
    story.append(_label("Business case"))
    story.append(Paragraph("Current risk exposure", st.h1))
    story.append(Paragraph(
        f"At a score of <b>{score:.0f}/100</b> and a "
        f"<b>{sector.replace('_', ' ')}</b> multiplier of <b>{multiplier:.1f}×</b>, "
        f"your estimated breach-cost exposure is:",
        st.body,
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        f"<font name='{font_name('mono_bold')}' size='36' color='{IBCS_NEG}'>"
        f"{_money_eur(breach_exposure)}</font>  "
        f"<font size='14' color='{TEXT_MUTED}'>per incident</font>",
        st.body,
    ))
    story.append(Spacer(1, 4 * mm))

    rows = [["Cost bucket", "Estimated", "Share"]]
    for k, v in breakdown.items():
        rows.append([k, _money_eur(v), f"{v / breach_exposure * 100:.0f}%"])
    t = Table(rows, colWidths=[CONTENT_WIDTH * 0.55, CONTENT_WIDTH * 0.25, CONTENT_WIDTH * 0.2])
    t.setStyle(_ibcs_table_style(header_row=True, numeric_cols=[1, 2]))
    story.append(t)

    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "Methodology: base cost = IBM 2024 European average €4.35M, "
        "adjusted by sector multiplier and by (1 − score/100)^0.5 as a "
        "gap-amplification factor. Buckets follow the IBM four-component "
        "breakdown and may differ from your actual incident profile.",
        st.caption,
    ))
    story.append(_page_break())

    # Page 2 — savings from remediation
    story.append(_label("Business case · remediation upside"))
    story.append(Paragraph("The value of closing the gap", st.h1))
    improved_score = min(100, score + 20)
    improved_factor = max(0.0, 1.0 - improved_score / 100) ** 0.5
    improved_exposure = base_cost * multiplier * improved_factor
    savings = breach_exposure - improved_exposure

    story.append(Paragraph(
        f"If your overall score improves by <b>20 points</b> (from {score:.0f} "
        f"to {improved_score:.0f}), the modeled exposure drops to "
        f"<b>{_money_eur(improved_exposure)}</b>, an annualized delta of "
        f"<b>{_money_eur(savings)}</b>.",
        st.body,
    ))
    story.append(Paragraph(
        f"Separately, IBM 2024 reports that firms with extensive AI and "
        f"automation in their security operations save an additional "
        f"<b>USD {IBM_2024['ai_automation_savings_usd']:,.0f}</b> per breach. "
        "Combining both effects builds the three-year NPV model below.",
        st.body,
    ))

    # Simple 3-year NPV table
    npv_rows = [["Year", "Expected loss avoided", "Program cost (low)", "Program cost (high)", "Net (midpoint)"]]
    annual_saving = savings
    program_costs = [(250_000, 600_000), (180_000, 420_000), (140_000, 320_000)]
    for y in (1, 2, 3):
        low, high = program_costs[y - 1]
        mid_cost = (low + high) / 2
        net = annual_saving - mid_cost
        npv_rows.append([
            f"Year {y}",
            _money_eur(annual_saving),
            _money_eur(low),
            _money_eur(high),
            _money_eur(net),
        ])
    t = Table(npv_rows, colWidths=[
        22 * mm, 38 * mm, 36 * mm, 36 * mm,
        CONTENT_WIDTH - 132 * mm,
    ])
    t.setStyle(_ibcs_table_style(header_row=True, numeric_cols=[1, 2, 3, 4]))
    story.append(t)
    story.append(Paragraph(
        "Assumption note: expected-loss avoidance is modeled as a flat "
        "annualized figure; program cost declines each year as investments "
        "shift from capex to opex. Not a discounted NPV — adjust for your "
        "organization's hurdle rate.",
        st.caption,
    ))
    story.append(_page_break())

    # Pages 3-5 — Top 10 priority actions
    story.append(_label("Business case · priority actions"))
    story.append(Paragraph("Top 10 priority actions", st.h1))
    story.append(Paragraph(
        "Ranked by <b>(100 − raw score) × applied sector weight</b>. "
        "Investment ranges are indicative — actual quotes depend on vendor "
        "choice, existing tooling and scope.",
        st.body_small,
    ))
    story.append(Spacer(1, 4 * mm))

    actions = _derive_top10_actions(data)
    for idx, action in enumerate(actions, start=1):
        story.append(priority_action_card(
            rank=idx,
            title=action["title"],
            pillar=action["pillar"],
            current_state=action["current_state"],
            target_state=action["target_state"],
            investment_range=action["investment_range"],
            timeline=action["timeline"],
            uplift=action["uplift"],
            width=CONTENT_WIDTH,
        ))
        story.append(Spacer(1, 3 * mm))
        if idx in (3, 6, 10):
            story.append(_page_break())

    # Page 6 — 3-year roadmap
    story.append(_label("Business case · roadmap"))
    story.append(Paragraph("Three-year remediation roadmap", st.h1))
    # Assign actions to waves
    waved_actions = _assign_waves(actions)
    story.append(roadmap_gantt(waved_actions, width=CONTENT_WIDTH, height=90 * mm))
    story.append(Spacer(1, 4 * mm))
    # Wave totals
    rows = [["Wave", "Window", "Actions", "Cumulative low", "Cumulative high"]]
    cum_low = cum_high = 0.0
    for wave in (1, 2, 3):
        w_actions = [a for a in waved_actions if a.get("wave") == wave]
        low = sum(a.get("cost_low", 0) for a in w_actions)
        high = sum(a.get("cost_high", 0) for a in w_actions)
        cum_low += low
        cum_high += high
        window = {1: "0-6 months", 2: "6-12 months", 3: "12-36 months"}[wave]
        rows.append([
            f"Wave {wave}", window, str(len(w_actions)),
            _money_eur(cum_low), _money_eur(cum_high),
        ])
    t = Table(rows, colWidths=[20 * mm, 34 * mm, 22 * mm, 42 * mm, CONTENT_WIDTH - 118 * mm])
    t.setStyle(_ibcs_table_style(header_row=True, numeric_cols=[2, 3, 4]))
    story.append(t)

    story.append(_page_break())
    return story


def _derive_top10_actions(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Rank answered questions with score < 50 by (100 - raw) * weight."""
    answers = data.get("answers", [])
    candidates = [
        a for a in answers
        if float(a.get("raw_score", 100)) < 50
    ]
    candidates.sort(
        key=lambda a: (100 - float(a.get("raw_score", 0))) * float(a.get("sector_weight_applied", 1.0)),
        reverse=True,
    )
    top = candidates[:10]
    return [_action_from_answer(a) for a in top]


# Investment rubric — subcategory -> (low, high, timeline, title template)
INVESTMENT_RUBRIC: Dict[str, Dict[str, Any]] = {
    "identity":                    {"low": 80_000, "high": 300_000,
                                    "title": "Phishing-resistant MFA rollout",
                                    "timeline": "Medium 3-9mo"},
    "patching":                    {"low": 40_000, "high": 120_000,
                                    "title": "Automated patch and CVE pipeline",
                                    "timeline": "Medium 3-9mo"},
    "soc_coverage":                {"low": 180_000, "high": 450_000,
                                    "title": "24/7 AI-augmented SOC",
                                    "timeline": "Strategic 9-18mo"},
    "encryption_inventory":        {"low": 40_000, "high": 120_000,
                                    "title": "Cryptographic inventory and PQC discovery",
                                    "timeline": "Medium 3-9mo"},
    "backup_recovery":             {"low": 30_000, "high": 100_000,
                                    "title": "Offline immutable backup architecture",
                                    "timeline": "Medium 3-9mo"},
    "sbom":                        {"low": 20_000, "high": 60_000,
                                    "title": "SBOM automation in CI/CD",
                                    "timeline": "Quick win <3mo"},
    "ai_vendor_risk":              {"low": 25_000, "high": 80_000,
                                    "title": "AI and LLM vendor security review program",
                                    "timeline": "Quick win <3mo"},
    "ai_red_team":                 {"low": 60_000, "high": 150_000,
                                    "title": "AI red teaming engagement",
                                    "timeline": "Medium 3-9mo"},
    "board_oversight":             {"low": 8_000, "high": 25_000,
                                    "title": "Quarterly board cyber briefing cadence",
                                    "timeline": "Quick win <3mo"},
    "ai_governance_committee":     {"low": 15_000, "high": 40_000,
                                    "title": "AI governance committee setup",
                                    "timeline": "Quick win <3mo"},
    "incident_response_retainer":  {"low": 25_000, "high": 80_000,
                                    "title": "External IR and forensics retainer",
                                    "timeline": "Quick win <3mo"},
    "ransomware_recovery_drill":   {"low": 30_000, "high": 80_000,
                                    "title": "Full-recovery drill program",
                                    "timeline": "Medium 3-9mo"},
    "offline_immutable_backups":   {"low": 30_000, "high": 100_000,
                                    "title": "Backup immutability upgrade",
                                    "timeline": "Medium 3-9mo"},
    "nis2":                        {"low": 50_000, "high": 200_000,
                                    "title": "NIS2 compliance gap remediation",
                                    "timeline": "Strategic 9-18mo"},
    "eu_ai_act":                   {"low": 40_000, "high": 150_000,
                                    "title": "EU AI Act inventory and classification",
                                    "timeline": "Medium 3-9mo"},
    "dora":                        {"low": 60_000, "high": 180_000,
                                    "title": "DORA framework alignment",
                                    "timeline": "Strategic 9-18mo"},
}


def _action_from_answer(a: Dict[str, Any]) -> Dict[str, Any]:
    subcat = a.get("subcategory") or ""
    rubric = INVESTMENT_RUBRIC.get(subcat, {
        "low": 10_000, "high": 50_000,
        "title": f"Custom scoping: {a.get('question_text','Action')[:60]}",
        "timeline": "Medium 3-9mo",
    })
    raw = float(a.get("raw_score", 0))
    weight = float(a.get("sector_weight_applied", 1.0))
    uplift_pts = int(min(30, (100 - raw) * 0.4))
    current = _truncate_text(a.get("answer_label", "Current state not specified"), 100)
    target = "Target: consistently at best-practice level with documented evidence."
    return {
        "title": rubric["title"],
        "pillar": a.get("dimension", "readiness"),
        "current_state": current,
        "target_state": target,
        "investment_range": f"{rubric['low']//1000}K - {rubric['high']//1000}K one-time",
        "cost_low": rubric["low"],
        "cost_high": rubric["high"],
        "timeline": rubric["timeline"],
        "uplift": f"+{uplift_pts} pillar points",
        "weight": weight,
        "raw_score": raw,
        "subcategory": subcat,
    }


def _assign_waves(actions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Assign top 10 actions to Wave 1/2/3 based on timeline string."""
    result = []
    for idx, a in enumerate(actions):
        timeline = a.get("timeline", "Medium 3-9mo")
        if timeline.startswith("Quick"):
            wave = 1
            start = idx * 0.8
            duration = 3
        elif timeline.startswith("Medium"):
            wave = 2
            start = 6 + (idx % 3) * 1.2
            duration = 6
        else:
            wave = 3
            start = 12 + (idx % 3) * 3
            duration = 9
        result.append({**a, "wave": wave, "start_month": start, "duration_months": duration})
    return result


# ============================================================================
# Section 7 — REGULATORY CONTEXT (4 pages)
# ============================================================================
REGULATIONS = [
    {
        "key": "nis2",
        "title": "NIS2 — Network and Information Security Directive",
        "applies_to": "Essential and Important entities across 18 sectors in the EU",
        "deadline": "Transposed into national law October 2024; ongoing enforcement",
        "fine_exposure": "Up to 2% of global turnover for Essential entities",
        "what_it_requires": [
            "Board-level accountability for cyber risk management",
            "24-hour early warning on significant incidents; 72-hour notification",
            "Supply-chain cybersecurity obligations",
            "Encryption, incident response and business continuity measures",
        ],
    },
    {
        "key": "dora",
        "title": "DORA — Digital Operational Resilience Act",
        "applies_to": "Financial entities and critical ICT third parties in the EU",
        "deadline": "In force January 2025",
        "fine_exposure": "Significant administrative penalties; supervisory intervention",
        "what_it_requires": [
            "ICT risk management framework with board oversight",
            "Incident classification and reporting to competent authorities",
            "Digital operational resilience testing, including TLPT",
            "Third-party risk management with register of contractual arrangements",
        ],
    },
    {
        "key": "ai_act",
        "title": "EU AI Act — Regulation (EU) 2024/1689",
        "applies_to": "Providers and deployers of AI systems in the EU",
        "deadline": "Prohibited practices from February 2025; full applicability August 2026",
        "fine_exposure": "Up to €35M or 7% of global turnover for prohibited practices",
        "what_it_requires": [
            "Inventory and risk classification of all AI systems",
            "High-risk AI obligations: risk management, data governance, logging",
            "Transparency obligations for limited-risk AI",
            "Prohibited practices list (social scoring, untargeted scraping, etc.)",
        ],
    },
    {
        "key": "pqc",
        "title": "Post-Quantum Cryptography — NIST + NSA CNSA 2.0",
        "applies_to": "US federal systems, national security contractors, by extension EU firms working with them",
        "deadline": "January 2027 for federal systems; flow-down to contractors",
        "fine_exposure": "Loss of contract eligibility; data exposure to HNDL attacks",
        "what_it_requires": [
            "Cryptographic inventory across all systems",
            "Migration plan to ML-KEM, ML-DSA, SLH-DSA algorithms",
            "Hybrid-mode deployments during transition",
            "Vendor attestation of PQC-ready roadmaps",
        ],
    },
]


def regulatory_section(data: Dict[str, Any]) -> List[Flowable]:
    st = _styles()
    story: List[Flowable] = []
    for reg in REGULATIONS:
        story.extend(_regulation_page(data, reg))
    return story


def _regulation_page(data: Dict[str, Any], reg: Dict[str, Any]) -> List[Flowable]:
    st = _styles()
    story: List[Flowable] = []

    story.append(_label(f"Regulation · {reg['key'].upper()}", ACCENT_DARK))
    story.append(Paragraph(reg["title"], st.h1))
    story.append(Paragraph(
        f"<b>Applies to:</b> {_escape(reg['applies_to'])}", st.body_small))
    story.append(Paragraph(
        f"<b>Deadline:</b> {_escape(reg['deadline'])}", st.body_small))
    story.append(Paragraph(
        f"<b>Fine exposure:</b> <font color='{IBCS_NEG}'>{_escape(reg['fine_exposure'])}</font>",
        st.body_small,
    ))

    story.append(Spacer(1, 3 * mm))
    story.append(_label("What it requires"))
    for req in reg["what_it_requires"]:
        story.append(Paragraph(f"▸ {_escape(req)}", st.body))

    # Where you stand — pull from compliance answers
    comp_answers = [a for a in data.get("answers", []) if a.get("dimension") == "compliance"]
    if comp_answers:
        story.append(Spacer(1, 4 * mm))
        story.append(_label("Where you stand today", IBCS_NEG))
        avg_score = sum(float(a.get("raw_score", 0)) for a in comp_answers) / len(comp_answers)
        story.append(Paragraph(
            f"Average compliance pillar score: <b>{avg_score:.0f}/100</b>. "
            f"Lowest-scoring question in this area: "
            f"<i>{_escape(_truncate_text(min(comp_answers, key=lambda a: a.get('raw_score', 0)).get('question_text', ''), 140))}</i>.",
            st.body,
        ))

    story.append(Spacer(1, 3 * mm))
    story.append(_label("Recommended actions", ACCENT))
    story.append(Paragraph(
        "Map each requirement above to a named owner, a 90-day milestone "
        "and a budget line item. Track progress in the ABOL dashboard and "
        "retake the assessment quarterly to document improvement for auditors.",
        st.body,
    ))

    story.append(_page_break())
    return story


# ============================================================================
# Section 8 — VENDOR RECOMMENDATIONS (3 pages)
# ============================================================================
VENDOR_CATEGORIES = [
    {
        "gap": "24/7 SOC augmentation",
        "pillar": "security_measures",
        "categories": [
            ("EDR / XDR platforms", "Endpoint and extended detection & response"),
            ("MDR providers", "Managed detection & response (outsourced SOC)"),
            ("SOAR tools", "Security orchestration, automation & response"),
        ],
    },
    {
        "gap": "Post-quantum readiness",
        "pillar": "readiness",
        "categories": [
            ("Cryptographic discovery", "Scanners that inventory crypto primitives across estate"),
            ("PKI modernization", "Platforms supporting ML-KEM / ML-DSA migration"),
            ("HSM providers", "Hardware security modules with PQC-ready roadmaps"),
        ],
    },
    {
        "gap": "Software supply-chain hygiene",
        "pillar": "dependencies",
        "categories": [
            ("SCA tools", "Software composition analysis"),
            ("SBOM generators", "Automated CycloneDX / SPDX generation"),
            ("Dependency scanners", "Continuous vulnerability scanning of deps"),
        ],
    },
    {
        "gap": "Identity hardening",
        "pillar": "security_measures",
        "categories": [
            ("Phishing-resistant MFA", "FIDO2, platform authenticators"),
            ("Passwordless IdPs", "Identity providers with risk-based auth"),
            ("Privileged access management", "Vaulting, just-in-time access"),
        ],
    },
    {
        "gap": "AI vendor risk management",
        "pillar": "dependencies",
        "categories": [
            ("AI security posture management", "ASPM and model-risk scanning"),
            ("Prompt firewalls", "Inspection of prompts and responses at gateway"),
            ("Data loss prevention for AI", "DLP extensions covering AI services"),
        ],
    },
    {
        "gap": "Compliance automation",
        "pillar": "compliance",
        "categories": [
            ("GRC platforms", "Controls library, evidence collection"),
            ("Continuous controls monitoring", "Near-real-time attestation"),
            ("Regulatory intelligence", "Tracking NIS2 / DORA / AI Act updates"),
        ],
    },
]


def vendor_section(data: Dict[str, Any]) -> List[Flowable]:
    st = _styles()
    story: List[Flowable] = []

    # Page 1 header + first 2 gaps
    story.append(_label("Vendor categories"))
    story.append(Paragraph("Where to look, without naming names", st.h1))
    story.append(Paragraph(
        "Vendor neutrality is a core ABOL.ai commitment. The categories below "
        "map to your gap profile; we do not receive commission from vendors "
        "and do not endorse specific products. Use this as a shortlist "
        "starting point for your own procurement process.",
        st.body,
    ))

    for i, block in enumerate(VENDOR_CATEGORIES):
        story.append(Spacer(1, 3 * mm))
        story.append(_label(f"Gap · {block['gap']}", DIM_COLORS.get(block['pillar'], ACCENT)))
        rows = [["Category", "What it does"]]
        for cat_name, cat_desc in block["categories"]:
            rows.append([cat_name, cat_desc])
        t = Table(rows, colWidths=[CONTENT_WIDTH * 0.35, CONTENT_WIDTH * 0.65])
        t.setStyle(_ibcs_table_style(header_row=True))
        story.append(t)
        if i in (1, 3):
            story.append(_page_break())

    story.append(Spacer(1, 4 * mm))
    story.append(_label("Disclaimer", TEXT_MUTED))
    story.append(Paragraph(
        "ABOL.ai does not receive commission or referral fees from any "
        "vendor. These are category suggestions based on your gap profile. "
        "Validate vendor fit against your own procurement, security and "
        "compliance criteria.",
        st.caption,
    ))

    story.append(_page_break())
    return story


# ============================================================================
# Section 9 — HISTORICAL TRENDS (2 pages)
# ============================================================================
def historical_trends_section(data: Dict[str, Any]) -> List[Flowable]:
    st = _styles()
    story: List[Flowable] = []

    history = data.get("prior_assessments", [])   # list of dicts with {date, overall_percentage}

    story.append(_label("Historical trends"))
    story.append(Paragraph("How your posture has evolved", st.h1))

    if not history:
        story.append(Paragraph(
            "This is your first ABOL.ai assessment. There is no prior "
            "baseline against which to plot progression yet. Schedule your "
            "next review in 90 days to begin tracking a real trend line — "
            "both for internal management reporting and to demonstrate "
            "sustained improvement to auditors and insurers.",
            st.body,
        ))
        story.append(Spacer(1, 4 * mm))
        story.append(_label("Suggested cadence", ACCENT_DARK))
        story.append(Paragraph(
            "Quarterly for the first 12 months after a program launch; "
            "semi-annually thereafter once the score stabilises above 70.",
            st.body,
        ))
        story.append(_page_break())
        story.append(_label("Historical trends — by pillar"))
        story.append(Paragraph("Per-pillar evolution", st.h1))
        story.append(Paragraph(
            "No prior data on a per-pillar basis. After your second "
            "assessment, this page will show a side-by-side table of each "
            "pillar's score over time, with colour-coded variance arrows.",
            st.body,
        ))
        story.append(_page_break())
        return story

    # Have history — basic progression line in text form (drawing a full line
    # chart would require another primitive; we use a table)
    rows = [["Date", "Overall score", "Rating"]]
    for h in history:
        rows.append([
            h.get("date", ""),
            f"{float(h.get('overall_percentage', 0)):.0f}",
            h.get("rating", rating_for_score(float(h.get('overall_percentage', 0)))),
        ])
    # Add current assessment
    rows.append([
        "This assessment",
        f"{float(data.get('overall_percentage', 0)):.0f}",
        data.get("rating", ""),
    ])
    t = Table(rows, colWidths=[50 * mm, 40 * mm, CONTENT_WIDTH - 90 * mm])
    t.setStyle(_ibcs_table_style(header_row=True, numeric_cols=[1]))
    story.append(t)
    story.append(_page_break())

    story.append(_label("Historical trends — by pillar"))
    story.append(Paragraph("Per-pillar evolution", st.h1))
    story.append(Paragraph(
        "Full per-pillar time-series will be populated once historical "
        "per-pillar scores are available in the database.",
        st.body,
    ))
    story.append(_page_break())
    return story


# ============================================================================
# Section 10 — METHODOLOGY & APPENDIX (4 pages)
# ============================================================================
def methodology_appendix_section(data: Dict[str, Any]) -> List[Flowable]:
    st = _styles()
    story: List[Flowable] = []

    # Page 1 — scoring methodology
    story.append(_label("Methodology · scoring"))
    story.append(Paragraph("How scores are computed", st.h1))
    story.append(Paragraph(
        "Each question has a raw score 0-100 based on the selected answer "
        "option. At answer time, the raw score is multiplied by a "
        "sector-specific weight (1.0× to 3.0×) and the product is stored in "
        "the database. Pillar scores aggregate these weighted values against "
        "the theoretical maximum (100 × applied weights) to produce a 0-100 "
        "pillar percentage. The overall score is the sum of weighted pillar "
        "scores over the sum of weighted maximums — a sector-aware aggregate.",
        st.body,
    ))
    story.append(Paragraph(
        "<b>Why percentile matters.</b> A raw score of 60/100 might be "
        "exceptional for an SMB in a non-regulated sector and inadequate for "
        "a Tier-1 bank. Reporting both the raw score and the peer "
        "percentile (derived from the `completed_assessments` view filtered "
        "by sector and size bucket) ensures fair comparison.",
        st.body,
    ))
    story.append(_page_break())

    # Page 2 — version control
    story.append(_label("Methodology · version control"))
    story.append(Paragraph("Historical comparability", st.h1))
    story.append(Paragraph(
        "The ABOL schema uses a hybrid versioning model: stable question IDs "
        "plus versioned content. When a question is reworded or its scoring "
        "is tightened, a new <i>question_version</i> is created while the "
        "original <i>question_id</i> is preserved. Answers are linked to the "
        "specific version that was live at the time of answering, and scores "
        "are frozen at that moment. This means that year-over-year "
        "comparisons use the original rules under which each answer was "
        "given — no retroactive shifts, no hidden changes to historic "
        "baselines.",
        st.body,
    ))
    story.append(Paragraph(
        "This is a key differentiator versus self-service frameworks that "
        "edit questions in place. Without version control, long-running "
        "benchmarks quietly lose integrity.",
        st.body,
    ))
    story.append(_page_break())

    # Page 3 — full question list with answers
    story.append(_label("Appendix · all answers"))
    story.append(Paragraph("Complete response log", st.h1))
    header = ["ID", "Pillar", "Question", "Your answer", "Score", "Weight"]
    rows: List[List[Any]] = [header]
    for a in data.get("answers", []):
        rows.append([
            a.get("question_id", ""),
            DIM_LABELS.get(a.get("dimension", ""), ""),
            Paragraph(_escape(_truncate_text(a.get("question_text", ""), 90)), st.body_small),
            Paragraph(_escape(_truncate_text(a.get("answer_label", ""), 30)), st.body_small),
            f"{float(a.get('raw_score', 0)):.0f}",
            f"{float(a.get('sector_weight_applied', 1.0)):.1f}×",
        ])
    t = Table(rows, colWidths=[
        22 * mm, 28 * mm, CONTENT_WIDTH - 106 * mm,
        28 * mm, 14 * mm, 14 * mm,
    ])
    t.setStyle(_ibcs_table_style(header_row=True, small=True))
    story.append(t)
    story.append(_page_break())

    # Page 4 — glossary
    story.append(_label("Appendix · glossary"))
    story.append(Paragraph("Acronyms and terms", st.h1))
    glossary = [
        ("NIS2", "European Network and Information Security Directive — second version"),
        ("DORA", "Digital Operational Resilience Act for EU financial entities"),
        ("AI Act", "EU Regulation 2024/1689 on AI systems"),
        ("PQC", "Post-Quantum Cryptography — quantum-resistant algorithms"),
        ("HNDL", "Harvest Now, Decrypt Later — adversary strategy against current crypto"),
        ("MFA", "Multi-Factor Authentication"),
        ("SBOM", "Software Bill of Materials"),
        ("SOC", "Security Operations Center"),
        ("MDR", "Managed Detection and Response"),
        ("XDR", "Extended Detection and Response"),
        ("SOAR", "Security Orchestration, Automation and Response"),
        ("ML-KEM", "NIST-standardized post-quantum key encapsulation"),
        ("ML-DSA", "NIST-standardized post-quantum digital signature algorithm"),
        ("IBCS", "International Business Communication Standards — the chart grammar used throughout this report"),
    ]
    rows = [["Term", "Expansion"]]
    for k, v in glossary:
        rows.append([k, v])
    t = Table(rows, colWidths=[40 * mm, CONTENT_WIDTH - 40 * mm])
    t.setStyle(_ibcs_table_style(header_row=True))
    story.append(t)

    story.append(_page_break())
    return story


# ============================================================================
# Section 11 — BACK COVER
# ============================================================================
def back_cover_section(data: Dict[str, Any]) -> List[Flowable]:
    st = _styles()
    story: List[Flowable] = []
    aid = data.get("assessment_id", "")

    story.append(Spacer(1, 20 * mm))
    story.append(_label("Next steps"))
    story.append(Paragraph("Three moves for the next 90 days", st.h1))

    next_steps = [
        ("01", "Book a consultation",
         "Walk through the findings with a senior ABOL analyst — turn the report into an owned action plan."),
        ("02", "Schedule the next assessment",
         "Re-assess in 90 days to verify your baseline has actually moved. "
         "Recurring assessments demonstrate sustained improvement to auditors and insurers."),
        ("03", "Share with your board",
         "This report is designed to be handed to a non-technical board. "
         "The executive summary and the business case are the key slides to walk through."),
    ]
    for num, title, desc in next_steps:
        story.append(Paragraph(
            f"<font name='{font_name('mono_bold')}' color='{ACCENT}'>{num}</font>  "
            f"<b>{_escape(title)}</b>",
            st.h3,
        ))
        story.append(Paragraph(_escape(desc), st.body))
        story.append(Spacer(1, 3 * mm))

    story.append(Spacer(1, 12 * mm))
    story.append(_hr(BORDER))
    story.append(Paragraph(
        f"{BRAND_NAME}  ·  {PRODUCT_NAME}",
        ParagraphStyle(
            "backcover_brand", fontName=font_name("bold"),
            fontSize=FS_BODY, textColor=hex_to_color(TEXT),
        ),
    ))
    story.append(Paragraph(
        f"Assessment {aid}  ·  Link: https://abol.ai/r/{aid}",
        st.mono_caption,
    ))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(CONFIDENTIAL_STATEMENT, st.caption))

    return story


# ============================================================================
# Shared utilities
# ============================================================================
def _ibcs_table_style(header_row: bool = False, numeric_cols: Optional[List[int]] = None,
                      small: bool = False) -> List:
    """IBCS-compliant table style commands."""
    cmds = [
        ("FONTNAME", (0, 0), (-1, -1), font_name("regular")),
        ("FONTSIZE", (0, 0), (-1, -1), FS_BODY_SM if not small else FS_CAPTION),
        ("TEXTCOLOR", (0, 0), (-1, -1), hex_to_color(TEXT)),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, 0), 1.2, hex_to_color(IBCS_AC)),
        ("LINEBELOW", (0, 1), (-1, -2), 0.3, hex_to_color(BORDER_SUBTLE)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    if header_row:
        cmds.append(("FONTNAME", (0, 0), (-1, 0), font_name("mono_bold")))
        cmds.append(("FONTSIZE", (0, 0), (-1, 0), FS_MONO_XS))
        cmds.append(("TEXTCOLOR", (0, 0), (-1, 0), hex_to_color(TEXT_MUTED)))
    if numeric_cols:
        for c in numeric_cols:
            cmds.append(("ALIGN", (c, 1), (c, -1), "RIGHT"))
            cmds.append(("FONTNAME", (c, 1), (c, -1), font_name("mono")))
    return cmds


def _escape(text: Any) -> str:
    """Minimal HTML escape for Paragraph safety."""
    if text is None:
        return ""
    s = str(text)
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _truncate_text(text: str, limit: int) -> str:
    text = text or ""
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _signed(value: float) -> str:
    if value > 0:
        return f"+{value:.0f}"
    if value < 0:
        return f"−{abs(value):.0f}"
    return "0"
