"""
report_design.py
================
Design tokens and font registration for the ABOL.ai PDF report.

These constants mirror the CSS variables defined in the frontend
`app.html` so the PDF and the web experience share one visual language.

Only this module is allowed to know about ReportLab or font files. Other
modules should import the named tokens and never hard-code hex strings.
"""

from __future__ import annotations

import logging
import os
import urllib.request
from pathlib import Path
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

log = logging.getLogger(__name__)

# ----------------------------------------------------------------------------
# Color palette (hex strings, from app.html :root)
# ----------------------------------------------------------------------------
BG = "#FAF6EF"              # warm cream page background
BG_RAISED = "#FFFFFF"
BG_SURFACE = "#FDF5E6"
BORDER = "#E5DCC8"
BORDER_SUBTLE = "#F0E7D4"
TEXT = "#14110F"
TEXT_SECONDARY = "#4A3E30"
TEXT_MUTED = "#8A7D6A"
ACCENT = "#E8650A"
ACCENT_LIGHT = "#FBA54E"
ACCENT_LIGHTER = "#FFE4C4"
ACCENT_DARK = "#7C2D12"
ACCENT_DARKER = "#431407"
SAGE = "#3D6B4F"
CORAL = "#B91C1C"
WARNING_BG = "#FFF7E6"
WARNING_BORDER = "#E8650A"

# IBCS scenario colors — strict semantic use only
IBCS_AC = "#2C2622"          # Actual
IBCS_BM = "#8A7D6A"          # Benchmark / peer / prior year
IBCS_BU = "#C9BCA5"          # Budget / plan / target
IBCS_POS = "#3D6B4F"         # Favorable variance
IBCS_NEG = "#991B1B"         # Unfavorable variance
IBCS_GRID = "#E5DCC8"        # Axis, gridlines, reference

# Dimension/pillar colors — match app.html DIM object
DIM_COLORS = {
    "readiness":         "#C2850C",
    "security_measures": "#5F826A",
    "dependencies":      "#9A7B4F",
    "investment":        "#7A8B6E",
    "compliance":        "#8B7355",
    "governance":        "#C45D4A",
    "resilience":        "#6B8A99",
}

DIM_LABELS = {
    "readiness":         "Readiness",
    "security_measures": "Security Measures",
    "dependencies":      "Dependencies",
    "investment":        "Investment & Business Case",
    "compliance":        "Compliance",
    "governance":        "Governance",
    "resilience":        "Resilience",
}

DIM_DESCRIPTIONS = {
    "readiness":         "AI + Quantum threat awareness & preparedness",
    "security_measures": "Technical controls & defense capabilities",
    "dependencies":      "Supply chain, vendors & third-party risk",
    "investment":        "Cyber spend, return on investment & planning",
    "compliance":        "Regulatory readiness & audit posture",
    "governance":        "Board oversight, accountability & policy",
    "resilience":        "Recovery, continuity & incident response",
}

DIM_ORDER = [
    "readiness",
    "security_measures",
    "dependencies",
    "investment",
    "compliance",
    "governance",
    "resilience",
]

# Rating colors and thresholds — match the RATINGS object in app.html
RATINGS = {
    "Leader":   {"color": "#166534", "bg": "#E8F0EC", "min_score": 85},
    "Strong":   {"color": "#3D6B4F", "bg": "#E8EDEA", "min_score": 70},
    "Fair":     {"color": "#B45309", "bg": "#FCF1E2", "min_score": 50},
    "At Risk":  {"color": "#C2410C", "bg": "#FCEBDE", "min_score": 30},
    "Critical": {"color": "#991B1B", "bg": "#F5E0E0", "min_score": 0},
}


def rating_for_score(score: float) -> str:
    """Return the rating label for a 0-100 score."""
    for label, cfg in RATINGS.items():
        if score >= cfg["min_score"]:
            return label
    return "Critical"


def hex_to_color(hex_str: str):
    """Convert a hex string like '#E8650A' to a reportlab Color instance."""
    return colors.HexColor(hex_str)


# ----------------------------------------------------------------------------
# Typography
# ----------------------------------------------------------------------------
# ReportLab does not ship with Manrope or JetBrains Mono. We download them
# from Google Fonts' open source repository on first run and cache locally.

FONT_DIR = Path(__file__).resolve().parent / "fonts"
FONT_DIR.mkdir(parents=True, exist_ok=True)

# Direct raw TTF URLs. Manrope is sourced from a community static-fonts
# mirror (terrapkg/pkg-manrope-fonts); JetBrains Mono comes from the
# official JetBrains/JetBrainsMono repo. Both are SIL Open Font Licensed.
MANROPE_BASE = "https://raw.githubusercontent.com/terrapkg/pkg-manrope-fonts/main"
JBM_BASE = "https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/ttf"

FONT_SPECS = [
    # (reportlab_name, filename, remote_url)
    ("Manrope",           "Manrope-Regular.ttf",      f"{MANROPE_BASE}/manrope-regular.ttf"),
    ("Manrope-Medium",    "Manrope-Medium.ttf",       f"{MANROPE_BASE}/manrope-medium.ttf"),
    ("Manrope-SemiBold",  "Manrope-SemiBold.ttf",     f"{MANROPE_BASE}/manrope-semibold.ttf"),
    ("Manrope-Bold",      "Manrope-Bold.ttf",         f"{MANROPE_BASE}/manrope-bold.ttf"),
    ("Manrope-ExtraBold", "Manrope-ExtraBold.ttf",    f"{MANROPE_BASE}/manrope-extrabold.ttf"),
    ("JetBrainsMono",     "JetBrainsMono-Medium.ttf", f"{JBM_BASE}/JetBrainsMono-Medium.ttf"),
    ("JetBrainsMono-Bold","JetBrainsMono-Bold.ttf",   f"{JBM_BASE}/JetBrainsMono-Bold.ttf"),
]

# Tracks whether registration succeeded. Other modules use font_name() to
# pick the right family and fall back automatically if needed.
_FONTS_REGISTERED = False


def _download_font(remote_url: str, local_path: Path) -> bool:
    """Download a font file. Returns True on success."""
    try:
        log.info("Downloading font %s", remote_url)
        req = urllib.request.Request(
            remote_url, headers={"User-Agent": "ABOL-report-generator/1.0"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        if len(data) < 1000:
            log.warning("Font %s too small (%d bytes), skipping", remote_url, len(data))
            return False
        local_path.write_bytes(data)
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("Font download failed for %s: %s", remote_url, exc)
        return False


def register_fonts() -> bool:
    """Register Manrope + JetBrains Mono with ReportLab. Idempotent.

    Returns True if the custom fonts are available, False if we have to
    fall back to Helvetica / Courier.
    """
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return True

    all_ok = True
    for rl_name, filename, url in FONT_SPECS:
        target = FONT_DIR / filename
        if not target.exists():
            if not _download_font(url, target):
                all_ok = False
                continue
        try:
            pdfmetrics.registerFont(TTFont(rl_name, str(target)))
        except Exception as exc:  # noqa: BLE001
            log.warning("Could not register %s: %s", rl_name, exc)
            all_ok = False

    _FONTS_REGISTERED = all_ok
    if not all_ok:
        log.warning(
            "Falling back to built-in Helvetica/Courier. PDF will render but "
            "typography will not match the brand."
        )
    return all_ok


def font_name(variant: str = "regular") -> str:
    """Return the registered font name for the given variant.

    Variants:
      regular, medium, semibold, bold, extrabold, mono, mono_bold
    Falls back to Helvetica / Courier if custom fonts failed to register.
    """
    fallback = {
        "regular":   "Helvetica",
        "medium":    "Helvetica",
        "semibold":  "Helvetica-Bold",
        "bold":      "Helvetica-Bold",
        "extrabold": "Helvetica-Bold",
        "mono":      "Courier",
        "mono_bold": "Courier-Bold",
    }
    custom = {
        "regular":   "Manrope",
        "medium":    "Manrope-Medium",
        "semibold":  "Manrope-SemiBold",
        "bold":      "Manrope-Bold",
        "extrabold": "Manrope-ExtraBold",
        "mono":      "JetBrainsMono",
        "mono_bold": "JetBrainsMono-Bold",
    }
    name = custom[variant]
    # Pragmatic check: if registration never succeeded, fall back
    if not _FONTS_REGISTERED:
        return fallback[variant]
    return name


# ----------------------------------------------------------------------------
# Page geometry
# ----------------------------------------------------------------------------
PAGE_SIZE = A4                        # 210mm x 297mm
MARGIN_LEFT = 18 * mm
MARGIN_RIGHT = 18 * mm
MARGIN_TOP = 22 * mm
MARGIN_BOTTOM = 22 * mm
CONTENT_WIDTH = PAGE_SIZE[0] - MARGIN_LEFT - MARGIN_RIGHT
CONTENT_HEIGHT = PAGE_SIZE[1] - MARGIN_TOP - MARGIN_BOTTOM


# ----------------------------------------------------------------------------
# Typography scale
# ----------------------------------------------------------------------------
FS_DISPLAY_XL = 120     # cover score
FS_DISPLAY_L = 42
FS_DISPLAY_M = 30
FS_H1 = 24
FS_H2 = 18
FS_H3 = 14
FS_BODY = 10.5
FS_BODY_SM = 9.5
FS_CAPTION = 8.5
FS_MONO_SM = 8
FS_MONO_XS = 7

LINE_H_TIGHT = 1.2
LINE_H_NORMAL = 1.45
LINE_H_LOOSE = 1.6


# ----------------------------------------------------------------------------
# Brand strings
# ----------------------------------------------------------------------------
BRAND_NAME = "ABOL.ai"
PRODUCT_NAME = "AI & Quantum Security Index"
CONFIDENTIAL_STATEMENT = (
    "Confidential — for internal use by the requesting organization and "
    "authorized readers only. Benchmark cohort data is anonymized and aggregated."
)
