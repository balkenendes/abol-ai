"""
external_benchmarks.py
======================
Hardcoded constants and narrative helpers for external benchmarks cited in
the ABOL.ai report: the 2026 Thales Data Threat Report and the IBM 2024
Cost of a Data Breach Report.

These numbers are snapshots; when newer editions are released, update the
dictionaries below and bump the `_VERSION` timestamp. Nothing else needs
to change.
"""

from __future__ import annotations

from typing import Dict, Optional, Tuple

_VERSION = "2026-04"


# ----------------------------------------------------------------------------
# Thales 2026 Data Threat Report
# ----------------------------------------------------------------------------
# Source: 2026 Thales Data Threat Report, surveyed 3,120 respondents across
# 20 countries, commissioned by Thales, conducted by S&P Global Market
# Intelligence 451 Research.
THALES_2026: Dict[str, object] = {
    # AI security investment
    "ai_security_budget_dedicated": 0.30,   # share with dedicated AI security budget
    "ai_security_budget_existing":  0.53,   # share funding AI security from existing budgets

    # AI-related threat exposure
    "deepfake_attacks_seen":        0.59,
    "reputational_damage_from_ai":  0.48,
    "ai_apps_targeted":             0.61,
    "ai_misinformation_attack_growth_rank": 2,   # rank among fastest growing attack types

    # Governance blind spot
    "c_suite_breach_blind_spot":    0.78,   # C-suite report no breach vs 57% IT

    # Identity & data
    "identity_top_discipline":      0.52,
    "sensitive_data_encrypted_cloud": 0.47,
    "complete_data_location_knowledge": 0.34,

    # Tool sprawl
    "tools_avg_data_protection":    7,
    "tools_five_plus_pct":          0.77,
    "confidence_in_tools":          0.39,

    # Post-quantum
    "hndl_top_concern":             0.61,   # "harvest now, decrypt later" as top concern
    "pqc_prototyping":              0.59,

    # Cloud
    "cloud_breach_rate":            0.46,   # 54% reported no cloud breach
    "human_error_leading_cause":    0.28,

    # Geopolitics
    "nation_state_top_concern":     0.63,

    # Environment complexity
    "avg_saas_apps":                89,
    "avg_cloud_providers":          2.26,

    # Provenance
    "source": (
        "2026 Thales Data Threat Report · S&P Global Market Intelligence "
        "451 Research · n=3,120 respondents across 20 countries"
    ),
}


# ----------------------------------------------------------------------------
# IBM Cost of a Data Breach Report 2024
# ----------------------------------------------------------------------------
IBM_2024: Dict[str, object] = {
    "avg_breach_cost_global_usd":   4_880_000,
    "avg_breach_cost_europe_eur":   4_350_000,
    "mean_time_to_identify_days":   194,
    "mean_time_to_contain_days":    64,
    "ai_automation_savings_usd":    2_220_000,
    "source": "IBM Cost of a Data Breach Report 2024 · annual study",
    # Industry cost multipliers (rough; used for exposure estimation)
    "financial_sector_multiplier":  1.8,
    "healthcare_sector_multiplier": 2.1,
}


# ----------------------------------------------------------------------------
# Narrative helper — one contextual stat per pillar
# ----------------------------------------------------------------------------
# For each pillar, (short headline, narrative sentence, source-key)
PILLAR_CONTEXT: Dict[str, Dict[str, str]] = {
    "readiness": {
        "stat": "78%",
        "headline": "C-suite report no breach — but 43% of IT teams did",
        "narrative": (
            "Executives consistently overestimate their own cyber posture. "
            "The Thales 2026 report finds a 21-point blind spot between "
            "C-suite and operational teams — reflected in the low average "
            "readiness scores across surveyed firms."
        ),
        "source": "Thales 2026",
    },
    "security_measures": {
        "stat": "7 tools",
        "headline": "Average firm runs 7 data-protection tools — yet only 39% trust them",
        "narrative": (
            "Tool sprawl correlates negatively with confidence. Organizations "
            "running 5+ overlapping security tools show lower confidence in "
            "their own defenses than those with consolidated, well-integrated "
            "stacks."
        ),
        "source": "Thales 2026",
    },
    "dependencies": {
        "stat": "89",
        "headline": "Typical firm now depends on 89 SaaS apps and 2.3 cloud providers",
        "narrative": (
            "Supply-chain attack surface has expanded dramatically. 46% of "
            "surveyed firms reported a cloud-based breach in the past "
            "12 months; human error remains the leading cause at 28%."
        ),
        "source": "Thales 2026",
    },
    "investment": {
        "stat": "USD 2.2M",
        "headline": "AI-augmented defense saves USD 2.2M per breach on average",
        "narrative": (
            "The IBM 2024 study shows that organizations deploying AI and "
            "automation extensively in security operations save USD 2.2M per "
            "breach compared with those that do not. The business case for "
            "AI-tier investment is now quantifiable."
        ),
        "source": "IBM 2024",
    },
    "compliance": {
        "stat": "34%",
        "headline": "Only 34% of firms know where all their sensitive data lives",
        "narrative": (
            "NIS2, DORA and the EU AI Act all require evidence of data "
            "classification and flow. The majority of firms cannot answer "
            "that question today — leaving them exposed to both audit "
            "findings and regulatory penalties."
        ),
        "source": "Thales 2026",
    },
    "governance": {
        "stat": "30%",
        "headline": "Only 30% of firms have a dedicated AI security budget",
        "narrative": (
            "53% fund AI security from existing budgets; 17% have nothing. "
            "Board-level governance of AI-specific risk remains rare — "
            "even as the EU AI Act begins enforcement in 2026."
        ),
        "source": "Thales 2026",
    },
    "resilience": {
        "stat": "194 days",
        "headline": "Mean time to identify a breach is 194 days",
        "narrative": (
            "Plus an additional 64 days to contain it. Organizations with "
            "tested incident-response playbooks and pre-arranged retainers "
            "cut these numbers by more than half."
        ),
        "source": "IBM 2024",
    },
}


def get_relevant_thales_stat(pillar: str, score: float) -> Dict[str, str]:
    """Return a pillar-specific external benchmark callout.

    The `score` argument is currently ignored but accepted so future
    versions can tailor the narrative to weak vs strong scores.
    """
    _ = score  # reserved for future logic
    ctx = PILLAR_CONTEXT.get(pillar)
    if ctx is None:
        return {
            "stat": "—",
            "headline": "External benchmark",
            "narrative": "No contextual benchmark available for this pillar.",
            "source": "—",
        }
    return dict(ctx)


# ----------------------------------------------------------------------------
# Sector multipliers — used by the business-case breach-cost estimator
# ----------------------------------------------------------------------------
SECTOR_BREACH_MULTIPLIER = {
    "smb":                1.0,
    "corporate":          1.4,
    "financial_services": 1.8,
    # Fallback used if the sector string is unknown
    "_default":           1.2,
}

# TODO: additional benchmarks
# -----------------------------------------------------------------------------
# Planned additions (not yet published in the report generator):
#   - ENISA Threat Landscape Report (annual)
#   - Verizon DBIR (annual)
#   - Microsoft Digital Defense Report
#   - Google/Mandiant M-Trends
# To add: append a constant dict following the pattern above, add a
# narrative block to PILLAR_CONTEXT if relevant, and cite in section 5.
# -----------------------------------------------------------------------------
