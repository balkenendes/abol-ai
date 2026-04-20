"""
report_llm.py
=============
Single LLM integration point for the report — generates the executive
summary (Section 2). All other sections are rule-based.

Contract:
  build_executive_summary(data) -> ExecutiveSummary

If the Anthropic API call fails for any reason (missing key, network error,
rate limit, invalid JSON response), we fall back to a deterministic
rule-based template so the CLI never fails because of LLM issues.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)


# ----------------------------------------------------------------------------
# Output contract
# ----------------------------------------------------------------------------
@dataclass
class ExecutiveSummary:
    paragraph_1: str
    paragraph_2: str
    paragraph_3: str
    top_3_actions: List[str] = field(default_factory=list)
    source: str = "fallback"   # "llm" or "fallback"


# ----------------------------------------------------------------------------
# System prompt
# ----------------------------------------------------------------------------
EXEC_SUMMARY_SYSTEM_PROMPT = """You are the lead author of the ABOL.ai
Executive Summary — a one-page narrative opening to a board-facing
cybersecurity benchmark report. Your reader is a busy IT director or CISO
who needs to brief the C-suite.

STYLE RULES (strict):
- Exactly three paragraphs, each 80-120 words.
- Direct and quantified. No hedging ("you may want to consider",
  "it might be worthwhile"). Use imperatives where appropriate.
- No generic AI boilerplate ("In today's digital landscape...").
- Each paragraph must reference at least one specific number from the
  supplied data (score, percentile, weight, or question outcome).
- Paragraph 1 = current state assessment.
- Paragraph 2 = top three risks with concrete consequence.
- Paragraph 3 = recommended posture and first 90-day move.
- Also produce "top_3_actions" — three crisp imperative sentences
  (<= 18 words each), each starting with a verb.

OUTPUT FORMAT:
Return valid JSON only. No prose before or after. Exactly these keys:
{
  "paragraph_1": "...",
  "paragraph_2": "...",
  "paragraph_3": "...",
  "top_3_actions": ["...", "...", "..."]
}
"""


def _format_context(data: Dict[str, Any]) -> str:
    """Turn the assessment dict into a compact human-readable context block."""
    lines: List[str] = []
    lines.append(f"SECTOR: {data.get('sector', 'unknown')}")
    lines.append(f"SIZE BUCKET: {data.get('employee_bucket', 'unknown')}")
    lines.append(f"COUNTRY: {data.get('country', 'unknown')}")
    lines.append(f"OVERALL SCORE: {data.get('overall_percentage', 0):.1f} / 100")
    lines.append(f"RATING: {data.get('rating', 'unknown')}")
    lines.append("")
    lines.append("PILLAR SCORES:")
    for d in data.get("dimension_scores", []):
        pct = d.get("percentage", 0)
        peer = d.get("peer_percentile")
        peer_s = f", peer pct: {peer:.0f}" if peer is not None else ""
        lines.append(f"  - {d.get('dimension', '?')}: {pct:.1f}/100{peer_s}")
    lines.append("")
    weakest = data.get("weakest_questions", [])[:5]
    if weakest:
        lines.append("TOP 5 WEAKEST QUESTION OUTCOMES:")
        for q in weakest:
            txt = q.get("question_text", "")[:100]
            lines.append(
                f"  - [{q.get('dimension','?')}] {txt}  "
                f"(score {q.get('raw_score', 0):.0f}/100, weight {q.get('sector_weight_applied', 1.0):.1f})"
            )
    return "\n".join(lines)


# ----------------------------------------------------------------------------
# Anthropic call
# ----------------------------------------------------------------------------
def _call_anthropic(context: str, model: str = "claude-sonnet-4-6") -> Optional[Dict[str, Any]]:
    """Call the Anthropic API. Returns parsed JSON dict or None on failure."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        log.info("ANTHROPIC_API_KEY not set — using fallback summary")
        return None

    try:
        from anthropic import Anthropic   # type: ignore
    except ImportError:
        log.warning("anthropic package not installed — using fallback summary")
        return None

    try:
        client = Anthropic(api_key=api_key)
        response = client.messages.create(
            model=model,
            max_tokens=1500,
            system=EXEC_SUMMARY_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": context}],
        )
        raw = "".join(
            block.text for block in response.content if getattr(block, "type", "") == "text"
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("Anthropic API call failed: %s", exc)
        return None

    # Extract JSON — the model sometimes wraps in code fences despite the prompt
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        # strip leading "json" language tag if present
        if raw.lower().startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        log.warning("LLM returned invalid JSON: %s", exc)
        return None

    # Minimal shape check
    required = {"paragraph_1", "paragraph_2", "paragraph_3", "top_3_actions"}
    if not required.issubset(parsed.keys()):
        log.warning("LLM JSON missing required keys: got %s", list(parsed.keys()))
        return None
    if not isinstance(parsed["top_3_actions"], list):
        log.warning("LLM top_3_actions is not a list")
        return None

    return parsed


# ----------------------------------------------------------------------------
# Rule-based fallback
# ----------------------------------------------------------------------------
def build_fallback_summary(data: Dict[str, Any]) -> ExecutiveSummary:
    """Produce a usable summary from the raw data without an LLM."""
    score = float(data.get("overall_percentage", 0))
    rating = data.get("rating", "At Risk")
    sector = data.get("sector", "smb").replace("_", " ")
    size = data.get("employee_bucket", "")
    dims = data.get("dimension_scores", [])
    weakest = sorted(dims, key=lambda d: d.get("percentage", 100))[:3]
    strongest = sorted(dims, key=lambda d: -d.get("percentage", 0))[0] if dims else None

    weak_names = ", ".join(
        d.get("dimension", "?").replace("_", " ") for d in weakest
    ) or "several pillars"

    p1 = (
        f"The organisation scores {score:.0f} out of 100 on the ABOL AI & Quantum "
        f"Security Index, which places it in the \"{rating}\" band. For a "
        f"{sector} company of the {size} size class, this score reflects "
        f"material exposure across the seven pillars of the index. "
        f"The peer cohort median is typically 52 in this sector; firms in the "
        f"\"Leader\" band require sustained scores above 85. Your posture is "
        f"measurable, but currently sits below the threshold that insurers, "
        f"auditors and boards increasingly expect of regulated European firms."
    )

    worst = weakest[0] if weakest else None
    worst_name = worst.get("dimension", "compliance").replace("_", " ") if worst else "compliance"
    worst_pct = worst.get("percentage", 0) if worst else 0
    p2 = (
        f"Three concentrations of risk stand out. First, {worst_name} "
        f"registers only {worst_pct:.0f} of 100 — the single largest "
        f"contributor to the overall gap. Second, the broader cluster "
        f"around {weak_names} signals that fundamentals are not yet in "
        f"place, which in practice means that one well-executed attack or "
        f"one audit cycle can surface a systemic finding rather than an "
        f"isolated issue. Third, the quantum-related questions show that "
        f"the organisation is not yet prepared for the January 2027 "
        f"migration horizon that regulators have already committed to."
    )

    strong_name = strongest.get("dimension", "").replace("_", " ") if strongest else ""
    strong_clause = (
        f"Build on the relative strength in {strong_name}, "
        if strong_name else ""
    )
    p3 = (
        f"{strong_clause}and move decisively in the next 90 days. Assign a "
        f"named executive sponsor to each of the three weakest pillars; "
        f"commission a scoped investment plan with concrete euro figures "
        f"and timelines; and schedule a re-assessment in 90 days to verify "
        f"progress against this baseline. Pair the plan with an external "
        f"incident-response retainer and a quantified breach-cost estimate "
        f"so the board can approve funding against a credible number rather "
        f"than against fear."
    )

    top3 = [
        f"Assign a named executive sponsor to each weakest pillar within 30 days.",
        f"Commission a scoped investment plan with euro figures by day 60.",
        f"Re-assess in 90 days to verify the baseline has actually moved.",
    ]

    return ExecutiveSummary(
        paragraph_1=p1.strip(),
        paragraph_2=p2.strip(),
        paragraph_3=p3.strip(),
        top_3_actions=top3,
        source="fallback",
    )


# ----------------------------------------------------------------------------
# Public entry point
# ----------------------------------------------------------------------------
def build_executive_summary(data: Dict[str, Any]) -> ExecutiveSummary:
    """Generate the 3-paragraph executive summary + top-3 actions.

    Tries Claude first; falls back to rule-based template on any failure.
    """
    ctx = _format_context(data)
    llm_result = _call_anthropic(ctx)
    if llm_result is None:
        return build_fallback_summary(data)

    return ExecutiveSummary(
        paragraph_1=str(llm_result["paragraph_1"]).strip(),
        paragraph_2=str(llm_result["paragraph_2"]).strip(),
        paragraph_3=str(llm_result["paragraph_3"]).strip(),
        top_3_actions=[str(a).strip() for a in llm_result["top_3_actions"][:3]],
        source="llm",
    )
