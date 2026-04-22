#!/usr/bin/env python3
"""
build_assets.py
===============
Builds the two PDF deliverables from the source whitepaper
`ABOL_AI_Quantum_Security_Index_2026.pdf`:

  1. whitepaper_teaser.pdf    — free lead magnet emailed after waitlist signup
                                Pages 1-3 of the source + 1 custom paywall page.
                                4 pages total, ~100 KB. Served statically at
                                https://abol.ai/whitepaper-teaser.pdf.

  2. whitepaper_deep_dive.pdf — pages 4-32 of the source, extracted standalone.
                                Used by generate_report.py to append deep
                                content to the personalized benchmark PDF
                                for paid orders.

Run once whenever the source whitepaper changes:

    python build_assets.py

Idempotent. Overwrites the two outputs. Source PDF is read-only.
"""

from __future__ import annotations

import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

SOURCE_WHITEPAPER = Path("ABOL_AI_Quantum_Security_Index_2026.pdf")
TEASER_OUTPUT = Path("whitepaper-teaser.pdf")
DEEP_DIVE_OUTPUT = Path("whitepaper_deep_dive.pdf")

TEASER_PAGES = (0, 1, 2)   # pages 1-3 (0-indexed) — cover + summary + 7 pillars glance
DEEP_DIVE_PAGES = range(3, 32)  # pages 4-32 (0-indexed) — all deep content

# Design tokens mirror report_design.py / app.html
BG = HexColor("#FAF6EF")
TEXT = HexColor("#14110F")
TEXT_SECONDARY = HexColor("#4A3E30")
TEXT_MUTED = HexColor("#8A7D6A")
ACCENT = HexColor("#E8650A")
ACCENT_DARK = HexColor("#7C2D12")
BG_SURFACE = HexColor("#FDF5E6")
BORDER = HexColor("#E5DCC8")


def _register_fonts() -> tuple[str, str]:
    """Try to register Manrope + JetBrains Mono; fall back to Helvetica."""
    fonts_dir = Path("fonts")
    body_font = "Helvetica"
    mono_font = "Courier"
    try:
        manrope = fonts_dir / "Manrope-Bold.ttf"
        if manrope.exists():
            pdfmetrics.registerFont(TTFont("Manrope-Bold", str(manrope)))
            body_font = "Manrope-Bold"
    except Exception:
        pass
    try:
        jbm = fonts_dir / "JetBrainsMono-Regular.ttf"
        if jbm.exists():
            pdfmetrics.registerFont(TTFont("JetBrainsMono", str(jbm)))
            mono_font = "JetBrainsMono"
    except Exception:
        pass
    return body_font, mono_font


def build_paywall_page(output_path: Path) -> Path:
    """Generate a single paywall page PDF to append to the teaser."""
    body_font, mono_font = _register_fonts()
    c = canvas.Canvas(str(output_path), pagesize=A4)
    page_w, page_h = A4
    margin = 20 * mm

    # Background
    c.setFillColor(BG)
    c.rect(0, 0, page_w, page_h, stroke=0, fill=1)

    # Top band
    c.setFillColor(TEXT)
    c.rect(0, page_h - 22 * mm, page_w, 22 * mm, stroke=0, fill=1)

    c.setFont(mono_font, 9)
    c.setFillColor(HexColor("#FBA54E"))
    c.drawString(margin, page_h - 12 * mm, "ABOL.AI · 2026 EDITION")
    c.setFillColor(HexColor("#FFFFFF"))
    c.drawRightString(page_w - margin, page_h - 12 * mm, "END OF PREVIEW")

    # Main headline
    y = page_h - 55 * mm
    c.setFillColor(TEXT)
    c.setFont(body_font, 28)
    c.drawString(margin, y, "You've seen the summary.")
    y -= 11 * mm
    c.drawString(margin, y, "The remaining 29 pages")
    y -= 11 * mm
    c.drawString(margin, y, "are in the paid report.")

    # Divider
    y -= 14 * mm
    c.setStrokeColor(ACCENT)
    c.setLineWidth(2)
    c.line(margin, y, margin + 40 * mm, y)

    # What's in the paid report
    y -= 14 * mm
    c.setFont(mono_font, 9)
    c.setFillColor(TEXT_MUTED)
    c.drawString(margin, y, "WHAT'S IN THE FULL REPORT (EUR 425 ONE-TIME)")

    y -= 8 * mm
    lines = [
        ("Section 1",  "Why 2026 is different - three tectonic shifts"),
        ("Section 2",  "Mythos and the AI attack surface"),
        ("Section 3",  "Quantum reality check and the 90-day roadmap"),
        ("Section 4",  "The supply chain crisis and four layered controls"),
        ("Section 5",  "The credential crisis and the infostealer economy"),
        ("Section 6",  "The boardroom blind spot: 78% vs 57%"),
        ("Section 7",  "Business case + top 10 priority actions with budgets"),
        ("Section 8",  "The ABOL scoring framework in full"),
        ("Section 9",  "Concrete steps for the next 90 days"),
        ("Section 10", "Sector deep dives: SMB, Corporate, Financial Services"),
        ("Section 11", "Regulatory context: NIS2, DORA, EU AI Act"),
        ("Section 12", "Methodology and sources"),
    ]
    c.setFont(body_font, 10)
    for label, desc in lines:
        c.setFillColor(ACCENT)
        c.drawString(margin, y, label)
        c.setFillColor(TEXT_SECONDARY)
        c.drawString(margin + 24 * mm, y, desc)
        y -= 5.5 * mm

    # Plus your personalized benchmark
    y -= 8 * mm
    c.setFillColor(BG_SURFACE)
    c.rect(margin, y - 28 * mm, page_w - 2 * margin, 30 * mm, stroke=0, fill=1)
    c.setStrokeColor(ACCENT)
    c.setLineWidth(2)
    c.line(margin, y - 28 * mm, margin, y + 2 * mm)

    c.setFont(mono_font, 9)
    c.setFillColor(ACCENT_DARK)
    c.drawString(margin + 6 * mm, y - 3 * mm, "PLUS: YOUR ORGANIZATION")

    c.setFont(body_font, 12)
    c.setFillColor(TEXT)
    c.drawString(
        margin + 6 * mm, y - 11 * mm,
        "Your personalized benchmark against Thales, IBM,"
    )
    c.drawString(
        margin + 6 * mm, y - 16.5 * mm,
        "ENISA, Verizon. 43-page board-ready PDF."
    )
    c.setFont(body_font, 10)
    c.setFillColor(TEXT_SECONDARY)
    c.drawString(margin + 6 * mm, y - 22 * mm, "Your score per pillar. Your top 10 gaps with euro exposure.")
    c.drawString(margin + 6 * mm, y - 26.5 * mm, "Your 3-year investment roadmap, delivered within 1 hour.")

    y -= 40 * mm

    # CTA block
    c.setFillColor(ACCENT)
    c.rect(margin, y - 16 * mm, page_w - 2 * margin, 18 * mm, stroke=0, fill=1)
    c.setFont(body_font, 14)
    c.setFillColor(HexColor("#FFFFFF"))
    c.drawString(margin + 8 * mm, y - 6 * mm, "Start the free 9-minute scan at abol.ai")
    c.setFont(mono_font, 9)
    c.drawString(margin + 8 * mm, y - 11.5 * mm, "Pay EUR 425 on the Results page. Full report in your inbox within 1 hour.")

    y -= 28 * mm

    # URL + explanation
    c.setFont(mono_font, 11)
    c.setFillColor(ACCENT_DARK)
    c.drawString(margin, y, "https://abol.ai")

    y -= 8 * mm
    c.setFont(body_font, 10)
    c.setFillColor(TEXT_SECONDARY)
    for line in [
        "No login. No sales call. Your score lands in your inbox the moment you finish.",
        "Questions? Reply to this email or info@abol.ai.",
    ]:
        c.drawString(margin, y, line)
        y -= 5 * mm

    # Footer
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(margin, 18 * mm, page_w - margin, 18 * mm)
    c.setFont(mono_font, 8)
    c.setFillColor(TEXT_MUTED)
    c.drawString(margin, 13 * mm, "ABOL.AI · AI and Quantum Security Index · 2026 Edition")
    c.drawRightString(page_w - margin, 13 * mm, "End of preview · page 4 of 4")

    c.showPage()
    c.save()
    return output_path


def build_teaser() -> None:
    """Pages 1-3 + generated paywall page -> whitepaper-teaser.pdf."""
    if not SOURCE_WHITEPAPER.exists():
        print(f"ERROR: source {SOURCE_WHITEPAPER} not found", file=sys.stderr)
        sys.exit(1)

    paywall_tmp = Path("_paywall_tmp.pdf")
    build_paywall_page(paywall_tmp)

    reader_src = PdfReader(str(SOURCE_WHITEPAPER))
    reader_paywall = PdfReader(str(paywall_tmp))
    writer = PdfWriter()

    for i in TEASER_PAGES:
        if i < len(reader_src.pages):
            writer.add_page(reader_src.pages[i])

    for p in reader_paywall.pages:
        writer.add_page(p)

    with TEASER_OUTPUT.open("wb") as f:
        writer.write(f)

    paywall_tmp.unlink(missing_ok=True)
    size_kb = TEASER_OUTPUT.stat().st_size / 1024
    print(f"  teaser: {TEASER_OUTPUT} ({len(writer.pages)} pages, {size_kb:.0f} KB)")


def build_deep_dive() -> None:
    """Pages 4-32 extracted standalone -> whitepaper_deep_dive.pdf.

    Used by generate_report.py --attach-whitepaper to concat with the
    personalized benchmark PDF.
    """
    if not SOURCE_WHITEPAPER.exists():
        print(f"ERROR: source {SOURCE_WHITEPAPER} not found", file=sys.stderr)
        sys.exit(1)

    reader = PdfReader(str(SOURCE_WHITEPAPER))
    writer = PdfWriter()
    for i in DEEP_DIVE_PAGES:
        if i < len(reader.pages):
            writer.add_page(reader.pages[i])

    with DEEP_DIVE_OUTPUT.open("wb") as f:
        writer.write(f)

    size_kb = DEEP_DIVE_OUTPUT.stat().st_size / 1024
    print(f"  deep dive: {DEEP_DIVE_OUTPUT} ({len(writer.pages)} pages, {size_kb:.0f} KB)")


if __name__ == "__main__":
    print(f"Source: {SOURCE_WHITEPAPER}")
    build_teaser()
    build_deep_dive()
    print("Done.")
