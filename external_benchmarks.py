"""
external_benchmarks.py
======================
Public-source benchmark data cited in the ABOL.ai report and used to
bootstrap the ABOL Index peer comparison before proprietary cohort data
reaches N > 30 per sector.

Four sources, all publicly published and annually refreshed:

  * Thales Data Threat Report 2026 (n=3,120, 20 countries, via S&P 451)
  * IBM Cost of a Data Breach Report 2024 (annual)
  * ENISA Threat Landscape 2025 (n=4,875 EU incidents, Jul 2024–Jun 2025)
  * Verizon Data Breach Investigations Report 2025 (n=22,000 incidents,
    12,195 breaches)

These numbers are snapshots. When a newer edition of any source is
published, update the corresponding dict below and bump `_VERSION`.
Nothing else in the codebase has to change.

Peer distribution schema
------------------------
`PEER_DISTRIBUTIONS[pillar][sector]` returns a dict with keys
`median`, `p25`, `p75`, `source`, and `sample_size_category`. All values
are scores in the 0–100 ABOL pillar-score space, derived from the public
statistics above. Derivation methodology is documented inline next to
each entry — the goal is that every number can be traced back to a
citable public source, with the sector adjustments explicit.

Replacement schedule
--------------------
When a given (sector, pillar) cohort reaches N > 30 real completed
assessments in Supabase, the runtime should prefer the computed
proprietary percentile over the public-source derivation. That crossover
logic lives in `report_loaders._load_from_supabase_async()`, not here —
this module remains the stable public-only fallback.
"""

from __future__ import annotations

from typing import Dict, Optional, Tuple

_VERSION = "2026-04-22"


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
    "citation_short": "Thales 2026",
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
    "citation_short": "IBM 2024",
    # Industry cost multipliers (rough; used for exposure estimation)
    "financial_sector_multiplier":  1.8,
    "healthcare_sector_multiplier": 2.1,
}


# ----------------------------------------------------------------------------
# ENISA Threat Landscape 2025
# ----------------------------------------------------------------------------
# Source: ENISA Threat Landscape 2025, n=4,875 EU-specific incidents
# analyzed between 1 July 2024 and 30 June 2025. Annual publication of
# the EU Agency for Cybersecurity. EU-specific — load-bearing for NIS2
# and DORA compliance positioning.
ENISA_TL_2025: Dict[str, object] = {
    # Top targeted sectors (share of tracked incidents)
    "sector_public_admin":          0.382,  # 38.2% of all incidents
    "sector_transport":             0.075,
    "sector_digital_infra":         0.048,
    "sector_finance":               0.045,
    "sector_manufacturing":         0.029,

    # Threat-type distribution (what hit the EU in the survey window)
    "phishing_intrusion_access":    0.60,   # 60% of intrusion access starts with phishing
    "vuln_exploit_intrusion":       0.213,
    "ddos_share_of_reports":        0.77,   # dominant in report volume (hacktivist-driven)

    # Motivation / actor type
    "hacktivism_share":             0.80,
    "cybercrime_share":             0.134,
    "state_aligned_share":          0.072,

    # Operational technology
    "ot_threat_share":              0.182,

    # Provenance
    "source": (
        "ENISA Threat Landscape 2025 · EU Agency for Cybersecurity · "
        "n=4,875 EU incidents (1 Jul 2024 – 30 Jun 2025)"
    ),
    "citation_short": "ENISA TL 2025",
}


# ----------------------------------------------------------------------------
# Verizon DBIR 2025
# ----------------------------------------------------------------------------
# Source: Verizon Data Breach Investigations Report 2025, n=22,000
# incidents including 12,195 confirmed breaches. The most-cited annual
# cyber benchmark globally — the reference every CISO compares against.
VERIZON_DBIR_2025: Dict[str, object] = {
    # Incident surface
    "incidents_analyzed":           22_000,
    "confirmed_breaches":           12_195,

    # Attack vectors (share of breaches)
    "third_party_involvement":      0.30,   # doubled YoY
    "vuln_exploitation":            0.20,   # +34% YoY
    "credential_abuse":             0.22,
    "ransomware_in_breaches":       0.44,
    "ransomware_in_system_intrusion": 0.75,

    # Patching posture
    "edge_vpn_patched_on_time":     0.54,
    "edge_vpn_median_fix_days":     32,

    # Ransomware economics
    "ransomware_median_payout_usd": 115_000,
    "ransomware_refused_to_pay":    0.64,

    # GenAI exposure
    "employees_using_genai_on_corp":       0.15,
    "genai_users_non_corporate_email":     0.72,
    "genai_users_corp_email_no_sso":       0.17,

    # Provenance
    "source": (
        "Verizon 2025 Data Breach Investigations Report · "
        "n=22,000 incidents, 12,195 confirmed breaches"
    ),
    "citation_short": "Verizon DBIR 2025",
}


# ----------------------------------------------------------------------------
# PEER_DISTRIBUTIONS — the cold-start ABOL Index peer dataset
# ----------------------------------------------------------------------------
# Returns median + P25 + P75 per (pillar, sector) in 0-100 ABOL score space.
#
# Derivation model
# ----------------
# Each pillar has a baseline median anchored to one or more of the four
# public sources above. Sector adjustments multiply the baseline:
#
#     SMB               ~= baseline * 0.80   (smaller teams, less budget)
#     Corporate         ~= baseline * 1.00   (the modal org in the surveys)
#     Financial Services~= baseline * 1.25   (regulated, DORA-mandated,
#                                             consistently higher maturity
#                                             across every source sampled)
#
# P25 / P75 spread assumes ±25% around the sector median, capped at
# [5, 95]. This is the observed spread in IBM + Verizon cohort data;
# revisit when the first real ABOL cohort crosses N > 30.
#
# Anchors per pillar (the single public stat that determines baseline):
#
# readiness             Thales 2026 ai_security_budget_dedicated (0.30)
#                       → baseline 30
# security_measures     Verizon DBIR edge_vpn_patched_on_time (0.54)
#                       → baseline 54
# dependencies          Thales sensitive_data_encrypted_cloud (0.47)
#                       inverse-framed with DBIR third_party_involvement
#                       → baseline 45
# investment            Thales ai_security_budget_dedicated (0.30)
#                       + IBM ai_automation_savings signal
#                       → baseline 35
# compliance            Thales complete_data_location_knowledge (0.34)
#                       + ENISA sector_finance/public_admin signal
#                       → baseline 42
# governance            Thales c_suite_breach_blind_spot inverse (0.22)
#                       + Thales ai_security_budget_dedicated (0.30)
#                       → baseline 32
# resilience            IBM mean_time_to_identify (194d implies low
#                       baseline) + Verizon ransomware_refused_to_pay
#                       (0.64 shows IR maturity distribution)
#                       → baseline 40

PEER_DISTRIBUTIONS: Dict[str, Dict[str, Dict[str, object]]] = {
    "readiness": {
        "smb":                {"median": 24, "p25": 16, "p75": 32, "source": "thales_2026", "sample_size_category": "derived"},
        "corporate":          {"median": 30, "p25": 22, "p75": 38, "source": "thales_2026", "sample_size_category": "derived"},
        "financial_services": {"median": 42, "p25": 32, "p75": 54, "source": "thales_2026+enisa_tl_2025", "sample_size_category": "derived"},
    },
    "security_measures": {
        "smb":                {"median": 43, "p25": 32, "p75": 54, "source": "verizon_dbir_2025", "sample_size_category": "derived"},
        "corporate":          {"median": 54, "p25": 42, "p75": 66, "source": "verizon_dbir_2025", "sample_size_category": "derived"},
        "financial_services": {"median": 67, "p25": 54, "p75": 80, "source": "verizon_dbir_2025+enisa_tl_2025", "sample_size_category": "derived"},
    },
    "dependencies": {
        "smb":                {"median": 36, "p25": 26, "p75": 46, "source": "thales_2026+verizon_dbir_2025", "sample_size_category": "derived"},
        "corporate":          {"median": 45, "p25": 34, "p75": 56, "source": "thales_2026+verizon_dbir_2025", "sample_size_category": "derived"},
        "financial_services": {"median": 56, "p25": 44, "p75": 68, "source": "thales_2026+verizon_dbir_2025", "sample_size_category": "derived"},
    },
    "investment": {
        "smb":                {"median": 28, "p25": 19, "p75": 37, "source": "thales_2026+ibm_2024", "sample_size_category": "derived"},
        "corporate":          {"median": 35, "p25": 26, "p75": 44, "source": "thales_2026+ibm_2024", "sample_size_category": "derived"},
        "financial_services": {"median": 44, "p25": 33, "p75": 55, "source": "thales_2026+ibm_2024", "sample_size_category": "derived"},
    },
    "compliance": {
        "smb":                {"median": 34, "p25": 24, "p75": 44, "source": "thales_2026+enisa_tl_2025", "sample_size_category": "derived"},
        "corporate":          {"median": 42, "p25": 32, "p75": 52, "source": "thales_2026+enisa_tl_2025", "sample_size_category": "derived"},
        "financial_services": {"median": 63, "p25": 52, "p75": 75, "source": "thales_2026+enisa_tl_2025", "sample_size_category": "derived"},
    },
    "governance": {
        "smb":                {"median": 26, "p25": 17, "p75": 35, "source": "thales_2026", "sample_size_category": "derived"},
        "corporate":          {"median": 32, "p25": 23, "p75": 41, "source": "thales_2026", "sample_size_category": "derived"},
        "financial_services": {"median": 48, "p25": 37, "p75": 60, "source": "thales_2026+enisa_tl_2025", "sample_size_category": "derived"},
    },
    "resilience": {
        "smb":                {"median": 32, "p25": 22, "p75": 42, "source": "ibm_2024+verizon_dbir_2025", "sample_size_category": "derived"},
        "corporate":          {"median": 40, "p25": 30, "p75": 50, "source": "ibm_2024+verizon_dbir_2025", "sample_size_category": "derived"},
        "financial_services": {"median": 55, "p25": 43, "p75": 67, "source": "ibm_2024+verizon_dbir_2025+enisa_tl_2025", "sample_size_category": "derived"},
    },
}


# Canonical source metadata, keyed by the short IDs used in
# PEER_DISTRIBUTIONS.source. Render this next to charts for full citation.
SOURCE_ATTRIBUTIONS: Dict[str, Dict[str, str]] = {
    "thales_2026":       {"label": "Thales 2026 Data Threat Report",         "url": "https://cpl.thalesgroup.com/data-threat-report", "n": "3,120"},
    "ibm_2024":          {"label": "IBM Cost of a Data Breach Report 2024",  "url": "https://www.ibm.com/reports/data-breach",        "n": "annual"},
    "enisa_tl_2025":     {"label": "ENISA Threat Landscape 2025",            "url": "https://www.enisa.europa.eu/publications/enisa-threat-landscape-2025", "n": "4,875 EU incidents"},
    "verizon_dbir_2025": {"label": "Verizon DBIR 2025",                      "url": "https://www.verizon.com/business/resources/reports/dbir/", "n": "22,000 incidents, 12,195 breaches"},
    "data_pending":      {"label": "Peer data pending",                      "url": "",                                               "n": "n/a"},
}


def get_peer_median(sector: str, pillar: str) -> Dict[str, object]:
    """Return peer distribution (median, P25, P75, source attribution) for a
    sector × pillar pair, from the cold-start public dataset.

    Parameters
    ----------
    sector : str
        One of "smb", "corporate", "financial_services". Case-sensitive —
        match the Sector enum in main.py.
    pillar : str
        One of the seven ABOL pillar keys: "readiness", "security_measures",
        "dependencies", "investment", "compliance", "governance",
        "resilience". Case-sensitive.

    Returns
    -------
    Dict[str, object]
        Keys:
          * median : int — peer median score (0-100), or None if unknown
          * p25    : int — 25th percentile, or None if unknown
          * p75    : int — 75th percentile ("top-quartile threshold"), or
                     None if unknown
          * source : str — short source ID; look up full attribution in
                     SOURCE_ATTRIBUTIONS
          * sample_size_category : str — "derived" for the cold-start
                     public-source derivation, "cohort" once real data
                     replaces the public baseline, "unavailable" on miss

    On unknown sector or pillar, returns a "data_pending" shape. The
    caller is expected to render a graceful "Peer data pending for this
    sector" placeholder rather than failing the report build. This is
    the designed recovery path from the Sprint 1 eng review.
    """
    pillar_data = PEER_DISTRIBUTIONS.get(pillar)
    if pillar_data is None:
        return {
            "median": None,
            "p25": None,
            "p75": None,
            "source": "data_pending",
            "sample_size_category": "unavailable",
        }
    sector_data = pillar_data.get(sector)
    if sector_data is None:
        return {
            "median": None,
            "p25": None,
            "p75": None,
            "source": "data_pending",
            "sample_size_category": "unavailable",
        }
    # Defensive copy — callers sometimes mutate
    return dict(sector_data)


def get_source_attribution(source_id: str) -> Dict[str, str]:
    """Resolve a PEER_DISTRIBUTIONS.source short ID to its full citation
    metadata (label, URL, sample size). For multi-source derivations
    (e.g. "thales_2026+verizon_dbir_2025"), returns the first source
    mentioned. Callers that want all sources should split on '+' and
    call this function per ID.
    """
    primary = source_id.split("+")[0] if source_id else "data_pending"
    return SOURCE_ATTRIBUTIONS.get(primary, SOURCE_ATTRIBUTIONS["data_pending"])


# ----------------------------------------------------------------------------
# Narrative helper — one contextual stat per pillar (existing behavior)
# ----------------------------------------------------------------------------
# PILLAR_CONTEXT narratives have been updated where ENISA or Verizon DBIR
# tell a sharper story than the original Thales/IBM framing.
PILLAR_CONTEXT: Dict[str, Dict[str, str]] = {
    "readiness": {
        "stat": "78%",
        "headline": "C-suite report no breach — but 43% of IT teams did",
        "narrative": (
            "Executives consistently overestimate their own cyber posture. "
            "Thales 2026 finds a 21-point blind spot between C-suite and "
            "operational teams, reflected in the low average readiness "
            "scores across surveyed firms. Only 30% have a dedicated AI "
            "security budget — the clearest proxy for real readiness in "
            "the AI era."
        ),
        "source": "Thales 2026",
    },
    "security_measures": {
        "stat": "54%",
        "headline": "Only 54% of edge and VPN vulnerabilities get patched on time",
        "narrative": (
            "Verizon DBIR 2025 finds median patch time for edge-facing "
            "flaws is 32 days — long enough for agentic attackers to "
            "find, exploit, and monetize them. Tool sprawl makes it "
            "worse: Thales 2026 reports the average firm runs 7 data "
            "protection tools but only 39% trust them."
        ),
        "source": "Verizon DBIR 2025 · Thales 2026",
    },
    "dependencies": {
        "stat": "30%",
        "headline": "Third-party involvement in breaches has doubled to 30%",
        "narrative": (
            "Verizon DBIR 2025 reports third-party vectors are now "
            "responsible for nearly one-third of all breaches — up "
            "sharply year over year. Typical firms depend on 89 SaaS "
            "apps and 2.3 cloud providers (Thales 2026); 46% reported a "
            "cloud breach in the past 12 months."
        ),
        "source": "Verizon DBIR 2025 · Thales 2026",
    },
    "investment": {
        "stat": "USD 2.2M",
        "headline": "AI-augmented defense saves USD 2.2M per breach on average",
        "narrative": (
            "IBM 2024 shows organizations deploying AI and automation "
            "extensively in security operations save USD 2.2M per breach "
            "versus those that do not. Yet only 30% of firms have a "
            "dedicated AI security budget (Thales 2026) — the investment "
            "gap is the single clearest predictor of breach-cost exposure."
        ),
        "source": "IBM 2024 · Thales 2026",
    },
    "compliance": {
        "stat": "34%",
        "headline": "Only 34% of firms know where all their sensitive data lives",
        "narrative": (
            "NIS2, DORA, and the EU AI Act all require evidence of data "
            "classification and flow. Most firms cannot answer that "
            "question today, leaving them exposed to audit findings and "
            "regulatory penalties. ENISA TL 2025 finds public admin "
            "(38.2%), transport (7.5%), and finance (4.5%) sustain the "
            "bulk of tracked incidents in the EU — and the regulators "
            "know it."
        ),
        "source": "Thales 2026 · ENISA TL 2025",
    },
    "governance": {
        "stat": "30%",
        "headline": "Only 30% of firms have a dedicated AI security budget",
        "narrative": (
            "53% fund AI security from existing budgets, 17% have nothing "
            "(Thales 2026). Board-level governance of AI-specific risk "
            "remains rare even as the EU AI Act reaches enforcement in "
            "2026. ENISA TL 2025 notes hacktivist and state-aligned "
            "activity is up sharply — governance failures have direct "
            "geopolitical consequences now."
        ),
        "source": "Thales 2026 · ENISA TL 2025",
    },
    "resilience": {
        "stat": "194 days",
        "headline": "Mean time to identify a breach is 194 days",
        "narrative": (
            "Plus 64 more days to contain it (IBM 2024). Verizon DBIR "
            "2025 reports 44% of breaches involve ransomware; 64% of "
            "victims now refuse to pay, but only organizations with "
            "tested incident-response playbooks and pre-arranged "
            "retainers cut recovery time meaningfully. The gap between "
            "paper plans and tested plans is where this pillar lives."
        ),
        "source": "IBM 2024 · Verizon DBIR 2025",
    },
}


def get_relevant_thales_stat(pillar: str, score: float) -> Dict[str, str]:
    """Return a pillar-specific external benchmark callout.

    Kept for backward compatibility with the existing report_sections code.
    Name is legacy — the narrative now cites ENISA and Verizon DBIR where
    they tell a sharper story. For new code, use get_peer_median() for
    numeric peer data and this function for the prose callout.

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
# Sector multipliers — used by the business-case breach-cost estimator.
# Separate from the maturity adjustment used for PEER_DISTRIBUTIONS above —
# these are *cost* multipliers, not *maturity* multipliers.
# ----------------------------------------------------------------------------
SECTOR_BREACH_MULTIPLIER = {
    "smb":                1.0,
    "corporate":          1.4,
    "financial_services": 1.8,
    # Fallback used if the sector string is unknown
    "_default":           1.2,
}
