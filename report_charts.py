"""
report_charts.py
================
Custom chart primitives for the ABOL.ai PDF report. Implemented in pure
ReportLab (no matplotlib dependency) so the report generator stays
lightweight and deterministic.

All chart functions return either a `Drawing` (for placement via Flowable)
or a custom `Flowable` subclass. They are strictly IBCS-compliant:
  - Solid dark fill     = Actual (your score)
  - Medium grey         = Benchmark / peer median
  - Hatched pattern     = Budget / top quartile
  - Red                 = Unfavorable variance
  - Green               = Favorable variance
"""

from __future__ import annotations

import math
from typing import Iterable, List, Optional, Sequence, Tuple

from reportlab.graphics.shapes import (
    Circle,
    Drawing,
    Line,
    Polygon,
    Rect,
    String,
    Group,
)
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle

from report_design import (
    ACCENT,
    ACCENT_DARK,
    ACCENT_LIGHTER,
    BG_SURFACE,
    BORDER,
    BORDER_SUBTLE,
    DIM_COLORS,
    DIM_LABELS,
    DIM_ORDER,
    FS_BODY_SM,
    FS_CAPTION,
    FS_MONO_SM,
    FS_MONO_XS,
    IBCS_AC,
    IBCS_BM,
    IBCS_BU,
    IBCS_GRID,
    IBCS_NEG,
    IBCS_POS,
    TEXT,
    TEXT_MUTED,
    TEXT_SECONDARY,
    font_name,
    hex_to_color,
)


# ============================================================================
# Helpers
# ============================================================================
def _rl(c: str):
    """hex -> reportlab color."""
    return hex_to_color(c)


def _hatched_rect(drawing: Drawing, x: float, y: float, w: float, h: float,
                  stroke_hex: str = IBCS_AC, gap: float = 2.0) -> None:
    """Draw a hatched rectangle (IBCS 'Plan/Budget' notation)."""
    # Outline
    drawing.add(Rect(x, y, w, h, fillColor=colors.white,
                     strokeColor=_rl(stroke_hex), strokeWidth=0.8))
    # Diagonal lines inside, clipped by iterating
    n = int((w + h) / gap) + 1
    for i in range(-n, n):
        offset = i * gap
        x1 = x + offset
        y1 = y
        x2 = x + offset + h
        y2 = y + h
        # Clip to box
        if x2 < x or x1 > x + w:
            continue
        if x1 < x:
            y1 = y + (x - x1)
            x1 = x
        if x2 > x + w:
            y2 = y + h - (x2 - (x + w))
            x2 = x + w
        drawing.add(Line(x1, y1, x2, y2, strokeColor=_rl(stroke_hex), strokeWidth=0.6))


def _variance_sign(value: float) -> str:
    """Return '+X' or '−X' (proper minus sign) for IBCS-compliant labels."""
    if value > 0:
        return f"+{value:.0f}"
    if value < 0:
        return f"−{abs(value):.0f}"
    return "0"


# ============================================================================
# 1. IBCS horizontal bar chart — AC / BM / BU with variance label
# ============================================================================
def ibcs_horizontal_bar_chart(
    your_score: float,
    peer_median: float,
    peer_top_quartile: float,
    width: float = 160 * mm,
    height: float = 34 * mm,
    show_axis: bool = True,
) -> Drawing:
    """Three horizontal bars (AC solid, BM outlined, BU hatched) + variance."""
    d = Drawing(width, height)

    # Layout
    label_w = 38 * mm
    val_w = 14 * mm
    bar_region_x = label_w
    bar_region_w = width - label_w - val_w
    row_h = (height - 10) / 3.0

    # Zero baseline
    d.add(Line(bar_region_x, 5, bar_region_x, height - 5,
               strokeColor=_rl(IBCS_AC), strokeWidth=1.2))

    # Gridlines at 25/50/75
    for pct in (25, 50, 75, 100):
        gx = bar_region_x + bar_region_w * (pct / 100)
        d.add(Line(gx, 5, gx, height - 5,
                   strokeColor=_rl(IBCS_GRID), strokeWidth=0.4))

    rows = [
        ("Your score",  your_score,         "ac"),
        ("Peer median", peer_median,        "bm"),
        ("Top quartile", peer_top_quartile, "bu"),
    ]

    bar_h = row_h * 0.6
    for i, (label, val, kind) in enumerate(rows):
        y = height - 5 - (i + 1) * row_h + (row_h - bar_h) / 2
        # Label
        d.add(String(2, y + bar_h / 2 - 3, label,
                     fontName=font_name("medium"),
                     fontSize=FS_BODY_SM, fillColor=_rl(TEXT)))
        # Bar
        bw = bar_region_w * max(0.0, min(100.0, val)) / 100
        if kind == "ac":
            d.add(Rect(bar_region_x, y, bw, bar_h,
                       fillColor=_rl(IBCS_AC),
                       strokeColor=_rl(IBCS_AC), strokeWidth=0))
        elif kind == "bm":
            d.add(Rect(bar_region_x, y, bw, bar_h,
                       fillColor=colors.white,
                       strokeColor=_rl(IBCS_BM), strokeWidth=1.2))
        else:  # bu — hatched
            _hatched_rect(d, bar_region_x, y, bw, bar_h)
        # Value
        d.add(String(width - val_w + 2, y + bar_h / 2 - 3,
                     f"{val:.0f}",
                     fontName=font_name("mono_bold"),
                     fontSize=FS_BODY_SM, fillColor=_rl(IBCS_AC)))

    # X-axis labels
    if show_axis:
        for pct in (0, 25, 50, 75, 100):
            gx = bar_region_x + bar_region_w * (pct / 100)
            d.add(String(gx, 0, str(pct),
                         fontName=font_name("mono"),
                         fontSize=FS_MONO_XS, fillColor=_rl(TEXT_MUTED),
                         textAnchor="middle"))

    return d


# ============================================================================
# 2. 7-axis radar chart
# ============================================================================
def radar_chart_7_axis(
    your_scores: dict,
    peer_scores: dict,
    top_quartile_scores: dict,
    size: float = 100 * mm,
) -> Drawing:
    """Radar chart comparing your scores against peer and top-quartile.

    All three score dicts are keyed by pillar id (readiness, ..., resilience).
    Missing keys are treated as 0.
    """
    d = Drawing(size, size)
    cx = size / 2
    cy = size / 2
    r_max = size * 0.38
    n_axes = len(DIM_ORDER)

    # Ring gridlines at 25/50/75/100
    for pct in (25, 50, 75, 100):
        r = r_max * (pct / 100)
        # Polygon ring
        pts = []
        for i in range(n_axes):
            angle = -math.pi / 2 + i * (2 * math.pi / n_axes)
            pts.extend([cx + r * math.cos(angle), cy + r * math.sin(angle)])
        poly = Polygon(pts, fillColor=None,
                       strokeColor=_rl(IBCS_GRID), strokeWidth=0.5)
        d.add(poly)

    # Axes + labels
    for i, pillar in enumerate(DIM_ORDER):
        angle = -math.pi / 2 + i * (2 * math.pi / n_axes)
        x_end = cx + r_max * math.cos(angle)
        y_end = cy + r_max * math.sin(angle)
        d.add(Line(cx, cy, x_end, y_end,
                   strokeColor=_rl(IBCS_GRID), strokeWidth=0.5))
        # Label
        label_r = r_max + 8 * mm
        lx = cx + label_r * math.cos(angle)
        ly = cy + label_r * math.sin(angle)
        label = DIM_LABELS.get(pillar, pillar)
        # Keep label readable — split on spaces for two lines if long
        if len(label) > 14:
            label = label.replace(" & ", "\n& ").replace(" and ", "\n& ")
        d.add(String(lx, ly, label,
                     fontName=font_name("medium"),
                     fontSize=FS_CAPTION, fillColor=_rl(TEXT),
                     textAnchor="middle"))

    def _polygon_for(scores: dict, fill_hex: str, stroke_hex: str,
                     fill_opacity: float):
        pts = []
        for i, pillar in enumerate(DIM_ORDER):
            val = float(scores.get(pillar, 0))
            angle = -math.pi / 2 + i * (2 * math.pi / n_axes)
            r = r_max * max(0.0, min(100.0, val)) / 100
            pts.extend([cx + r * math.cos(angle), cy + r * math.sin(angle)])
        poly = Polygon(
            pts,
            fillColor=_rl(fill_hex),
            fillOpacity=fill_opacity,
            strokeColor=_rl(stroke_hex),
            strokeWidth=1.2,
        )
        return poly

    # Layer order: top quartile (faint, back) → peer median → your score (front)
    d.add(_polygon_for(top_quartile_scores, IBCS_BU, IBCS_BU, 0.20))
    d.add(_polygon_for(peer_scores,         IBCS_BM, IBCS_BM, 0.18))
    d.add(_polygon_for(your_scores,         IBCS_AC, IBCS_AC, 0.30))

    return d


# ============================================================================
# 3. Score ring (circular gauge)
# ============================================================================
def score_ring(score: float, size: float = 40 * mm,
               color_hex: Optional[str] = None) -> Drawing:
    """Circular 0-100 gauge with the score in the center."""
    d = Drawing(size, size)
    cx = size / 2
    cy = size / 2
    r_outer = size * 0.45
    r_inner = size * 0.38
    color_hex = color_hex or IBCS_AC

    # Background ring
    d.add(Circle(cx, cy, r_outer,
                 fillColor=_rl(BG_SURFACE),
                 strokeColor=_rl(BORDER), strokeWidth=0.4))
    d.add(Circle(cx, cy, r_inner,
                 fillColor=colors.white,
                 strokeColor=None))

    # Progress arc: approximated by N filled wedges
    frac = max(0.0, min(1.0, score / 100))
    n_segments = 64
    n_filled = int(frac * n_segments)
    for i in range(n_filled):
        a1 = -math.pi / 2 + i * (2 * math.pi / n_segments)
        a2 = -math.pi / 2 + (i + 1) * (2 * math.pi / n_segments)
        pts = [
            cx + r_outer * math.cos(a1), cy + r_outer * math.sin(a1),
            cx + r_outer * math.cos(a2), cy + r_outer * math.sin(a2),
            cx + r_inner * math.cos(a2), cy + r_inner * math.sin(a2),
            cx + r_inner * math.cos(a1), cy + r_inner * math.sin(a1),
        ]
        d.add(Polygon(pts, fillColor=_rl(color_hex), strokeColor=None))

    # Score text centered
    d.add(String(cx, cy - 4, f"{score:.0f}",
                 fontName=font_name("mono_bold"),
                 fontSize=size * 0.3, fillColor=_rl(color_hex),
                 textAnchor="middle"))
    d.add(String(cx, cy - size * 0.22, "/ 100",
                 fontName=font_name("mono"),
                 fontSize=size * 0.1, fillColor=_rl(TEXT_MUTED),
                 textAnchor="middle"))

    return d


# ============================================================================
# 4. Roadmap Gantt — 3 waves
# ============================================================================
def roadmap_gantt(
    actions: List[dict],
    width: float = 170 * mm,
    height: float = 90 * mm,
    timeline_months: int = 36,
) -> Drawing:
    """Gantt-style visualization grouping actions into 3 waves.

    Each action dict: { "title", "pillar", "wave" (1-3), "start_month",
    "duration_months" }. Missing fields are tolerated.
    """
    d = Drawing(width, height)

    # Header strip
    header_h = 14
    lane_count = 3
    lane_h = (height - header_h - 8) / lane_count
    track_x = 30 * mm
    track_w = width - track_x - 4 * mm

    # Month scale
    month_w = track_w / timeline_months
    # Quarter ticks
    for q in range(0, timeline_months + 1, 3):
        gx = track_x + q * month_w
        d.add(Line(gx, 8, gx, height - header_h,
                   strokeColor=_rl(IBCS_GRID), strokeWidth=0.4))
        d.add(String(gx, 2, f"M{q}",
                     fontName=font_name("mono"),
                     fontSize=FS_MONO_XS, fillColor=_rl(TEXT_MUTED),
                     textAnchor="middle"))

    # Wave labels + lanes
    waves = {
        1: ("Wave 1", "Quick wins — months 0-6"),
        2: ("Wave 2", "Structural — months 6-12"),
        3: ("Wave 3", "Strategic — months 12-36"),
    }
    lane_top = height - header_h
    for idx, wave_num in enumerate([1, 2, 3]):
        y = lane_top - (idx + 1) * lane_h
        # Lane background
        d.add(Rect(track_x, y, track_w, lane_h,
                   fillColor=_rl(BG_SURFACE), strokeColor=None))
        # Wave header
        name, desc = waves[wave_num]
        d.add(String(2, y + lane_h - 6, name,
                     fontName=font_name("bold"),
                     fontSize=FS_BODY_SM, fillColor=_rl(IBCS_AC)))
        d.add(String(2, y + lane_h - 14, desc,
                     fontName=font_name("mono"),
                     fontSize=FS_MONO_XS, fillColor=_rl(TEXT_MUTED)))
        # Lane border
        d.add(Line(track_x, y, track_x + track_w, y,
                   strokeColor=_rl(BORDER), strokeWidth=0.4))

    # Header
    d.add(String(track_x, height - 8, "3-year remediation roadmap",
                 fontName=font_name("bold"),
                 fontSize=FS_BODY_SM, fillColor=_rl(IBCS_AC)))

    # Plot action bars
    for action in actions:
        wave_num = int(action.get("wave", 1))
        if wave_num not in (1, 2, 3):
            continue
        pillar = action.get("pillar", "readiness")
        color = DIM_COLORS.get(pillar, ACCENT)
        start = float(action.get("start_month", 0))
        duration = float(action.get("duration_months", 3))
        lane_index = wave_num - 1
        y_lane = lane_top - (lane_index + 1) * lane_h
        bar_h = 5
        bar_y = y_lane + lane_h / 2 - bar_h / 2
        bar_x = track_x + start * month_w
        bar_w = max(2.0, duration * month_w)
        d.add(Rect(bar_x, bar_y, bar_w, bar_h,
                   fillColor=_rl(color), strokeColor=None))
        # Mini label (truncated)
        label = action.get("title", "")[:32]
        d.add(String(bar_x, bar_y + bar_h + 1.5, label,
                     fontName=font_name("medium"),
                     fontSize=FS_MONO_XS, fillColor=_rl(TEXT)))

    return d


# ============================================================================
# 5. Priority-action card — a Flowable
# ============================================================================
class PriorityActionCard(Flowable):
    """Structured card describing one top-10 priority action.

    Renders as a bordered block with accent-colored left stripe.
    """

    def __init__(
        self,
        rank: int,
        title: str,
        pillar: str,
        current_state: str,
        target_state: str,
        investment_range: str,
        timeline: str,
        uplift: str,
        width: float = 170 * mm,
    ):
        super().__init__()
        self.rank = rank
        self.title = title
        self.pillar = pillar
        self.current_state = current_state
        self.target_state = target_state
        self.investment_range = investment_range
        self.timeline = timeline
        self.uplift = uplift
        self.width = width
        self.height = 38 * mm  # fixed for simplicity

    def wrap(self, availWidth, availHeight):
        self.width = min(self.width, availWidth)
        return self.width, self.height

    def draw(self):
        c = self.canv
        color = DIM_COLORS.get(self.pillar, ACCENT)

        # Left accent stripe
        c.setFillColor(_rl(color))
        c.rect(0, 0, 3 * mm, self.height, stroke=0, fill=1)

        # Main card background
        c.setFillColor(_rl("#FFFFFF"))
        c.setStrokeColor(_rl(BORDER))
        c.setLineWidth(0.5)
        c.rect(3 * mm, 0, self.width - 3 * mm, self.height, stroke=1, fill=1)

        # Rank badge
        c.setFillColor(_rl(ACCENT_LIGHTER))
        c.setStrokeColor(_rl(ACCENT))
        c.setLineWidth(0.5)
        c.rect(7 * mm, self.height - 10 * mm, 8 * mm, 7 * mm, stroke=1, fill=1)
        c.setFillColor(_rl(ACCENT_DARK))
        c.setFont(font_name("extrabold"), 11)
        c.drawCentredString(11 * mm, self.height - 8 * mm, f"{self.rank:02d}")

        # Title
        c.setFillColor(_rl(TEXT))
        c.setFont(font_name("bold"), 11.5)
        c.drawString(18 * mm, self.height - 7 * mm, _truncate(self.title, 80))
        c.setFillColor(_rl(TEXT_MUTED))
        c.setFont(font_name("mono"), FS_MONO_XS)
        c.drawString(18 * mm, self.height - 10.5 * mm,
                     DIM_LABELS.get(self.pillar, self.pillar).upper())

        # Current / target columns
        col1_x = 7 * mm
        col2_x = self.width / 2
        row_y = self.height - 18 * mm

        c.setFont(font_name("mono"), FS_MONO_XS)
        c.setFillColor(_rl(TEXT_MUTED))
        c.drawString(col1_x, row_y, "CURRENT STATE")
        c.drawString(col2_x, row_y, "TARGET STATE")

        c.setFont(font_name("regular"), FS_BODY_SM)
        c.setFillColor(_rl(TEXT))
        _draw_wrapped(c, _truncate(self.current_state, 120),
                      col1_x, row_y - 3 * mm,
                      max_width=col2_x - col1_x - 4 * mm, leading=3.5 * mm)
        _draw_wrapped(c, _truncate(self.target_state, 120),
                      col2_x, row_y - 3 * mm,
                      max_width=self.width - col2_x - 6 * mm, leading=3.5 * mm)

        # Bottom strip — investment / timeline / uplift
        strip_y = 3 * mm
        c.setFillColor(_rl(IBCS_AC))
        c.setFont(font_name("mono_bold"), 9)
        c.drawString(col1_x, strip_y, f"€  {self.investment_range}")
        c.setFillColor(_rl(TEXT_SECONDARY))
        c.setFont(font_name("medium"), 9)
        c.drawString(col1_x + 55 * mm, strip_y, f"⏱  {self.timeline}")
        c.setFillColor(_rl(IBCS_POS))
        c.setFont(font_name("bold"), 9)
        c.drawString(col1_x + 105 * mm, strip_y, f"▲ {self.uplift}")


def priority_action_card(
    rank: int,
    title: str,
    pillar: str,
    current_state: str,
    target_state: str,
    investment_range: str,
    timeline: str,
    uplift: str,
    width: float = 170 * mm,
) -> PriorityActionCard:
    """Thin wrapper so callers can import a function, not a class."""
    return PriorityActionCard(
        rank=rank, title=title, pillar=pillar,
        current_state=current_state, target_state=target_state,
        investment_range=investment_range, timeline=timeline,
        uplift=uplift, width=width,
    )


# ============================================================================
# Small utilities used by Flowables
# ============================================================================
def _truncate(text: str, limit: int) -> str:
    text = text or ""
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _draw_wrapped(canv, text: str, x: float, y: float,
                  max_width: float, leading: float = 12) -> float:
    """Naive word-wrap for small snippets. Returns the next y below text."""
    words = (text or "").split()
    line: List[str] = []
    line_y = y
    for w in words:
        trial = " ".join(line + [w])
        if canv.stringWidth(trial) <= max_width:
            line.append(w)
        else:
            if line:
                canv.drawString(x, line_y, " ".join(line))
                line_y -= leading
            line = [w]
    if line:
        canv.drawString(x, line_y, " ".join(line))
        line_y -= leading
    return line_y


# ============================================================================
# 6. Pillar bar with integrated gap (used on pillar pages)
# ============================================================================
def pillar_gap_bar(
    label: str,
    your_score: float,
    peer_median: float,
    width: float = 170 * mm,
    height: float = 10 * mm,
) -> Drawing:
    """Single-row bar chart with your score + peer marker + gap."""
    d = Drawing(width, height)
    label_w = 50 * mm
    val_w = 18 * mm
    bar_x = label_w
    bar_w = width - label_w - val_w
    bar_y = 2
    bar_h = height - 4

    # Label
    d.add(String(0, bar_y + bar_h / 2 - 3, label,
                 fontName=font_name("medium"),
                 fontSize=FS_BODY_SM, fillColor=_rl(TEXT)))
    # Zero axis
    d.add(Line(bar_x, bar_y - 1, bar_x, bar_y + bar_h + 1,
               strokeColor=_rl(IBCS_AC), strokeWidth=1.0))
    # AC bar
    ac_w = bar_w * max(0.0, min(100.0, your_score)) / 100
    d.add(Rect(bar_x, bar_y, ac_w, bar_h,
               fillColor=_rl(IBCS_AC), strokeColor=None))
    # Gap segment — red from AC endpoint to peer marker (if negative)
    if your_score < peer_median:
        gap_x = bar_x + ac_w
        gap_w = bar_w * (peer_median - your_score) / 100
        mid_y = bar_y + bar_h / 2
        d.add(Rect(gap_x, mid_y - 1, gap_w, 2,
                   fillColor=_rl(IBCS_NEG), strokeColor=None))
    # Peer marker
    px = bar_x + bar_w * max(0.0, min(100.0, peer_median)) / 100
    d.add(Line(px, bar_y - 2, px, bar_y + bar_h + 2,
               strokeColor=_rl(IBCS_BM), strokeWidth=1.4))
    # Numeric values
    delta = your_score - peer_median
    color = IBCS_POS if delta >= 0 else IBCS_NEG
    d.add(String(width - val_w, bar_y + bar_h / 2 - 3,
                 f"{your_score:.0f}",
                 fontName=font_name("mono_bold"),
                 fontSize=FS_BODY_SM, fillColor=_rl(IBCS_AC)))
    d.add(String(width - val_w + 8 * mm, bar_y + bar_h / 2 - 3,
                 _variance_sign(delta),
                 fontName=font_name("mono_bold"),
                 fontSize=FS_BODY_SM, fillColor=_rl(color)))

    return d
