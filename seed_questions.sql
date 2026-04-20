-- ============================================================================
-- ABOL.ai Benchmark - Seed Questions
-- ============================================================================
-- 30 core questions + adaptive branches across 6 dimensions
-- Future-proofing questions marked is_future_proofing=true (anticipate Mythos,
-- AGI, quantum hackers - nearly impossible to score 100% today)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- DIMENSION 1: READINESS (AI + Quantum threat readiness)
-- ----------------------------------------------------------------------------

INSERT INTO questions (question_id, dimension, subcategory, is_core) VALUES
('Q_RDY_001', 'readiness', 'ai_threat_awareness', true),
('Q_RDY_002', 'readiness', 'mythos_preparedness', true),
('Q_RDY_003', 'readiness', 'quantum_timeline', true),
('Q_RDY_004', 'readiness', 'harvest_decrypt_later', true),
('Q_RDY_005', 'readiness', 'ai_red_team', true);

INSERT INTO question_versions (question_id, version_number, question_text, help_text, question_type, options, max_score, is_future_proofing) VALUES
('Q_RDY_001', 1,
 'How often does your organization review threat intelligence specifically related to AI-enabled attacks (autonomous agents, AI-generated phishing, AI-discovered zero-days)?',
 'Think Anthropic Mythos, Chinese state actors using Claude for reconnaissance, AI-generated voice cloning scams. Weekly review is best practice for 2026.',
 'single_choice',
 '[
    {"value": "weekly", "label": "Weekly or more often", "score": 100},
    {"value": "monthly", "label": "Monthly", "score": 70},
    {"value": "quarterly", "label": "Quarterly", "score": 40},
    {"value": "ad_hoc", "label": "Only when something happens", "score": 15},
    {"value": "never", "label": "We do not specifically track AI threats", "score": 0}
 ]'::jsonb, 100, false),

('Q_RDY_002', 1,
 'If a Mythos-class AI model (capable of autonomously discovering thousands of zero-days in your stack) became publicly available within 6 months, how prepared would your organization be?',
 'Anthropic stated similar capabilities will be in open-source models within 6-18 months. This question anticipates that reality.',
 'scale',
 '[
    {"value": 1, "label": "Not prepared at all - we would be fully exposed", "score": 0},
    {"value": 2, "label": "Minimally prepared", "score": 20},
    {"value": 3, "label": "Some defenses in place", "score": 40},
    {"value": 4, "label": "Mostly prepared - active patching pipeline", "score": 70},
    {"value": 5, "label": "Fully prepared - AI-augmented defense running 24/7", "score": 100}
 ]'::jsonb, 100, true),

('Q_RDY_003', 1,
 'What is your organization''s stated target date to complete migration to post-quantum cryptography (NIST ML-KEM / ML-DSA)?',
 'NIST standards finalized August 2024. NSA CNSA 2.0 deadline: January 2027 for national security systems. Financial services: 2028-2030 typical targets.',
 'single_choice',
 '[
    {"value": "completed", "label": "Already completed", "score": 100},
    {"value": "in_progress_2026", "label": "In progress, completion 2026", "score": 90},
    {"value": "planned_2027", "label": "Planned for 2027", "score": 70},
    {"value": "planned_2028_2030", "label": "Planned 2028-2030", "score": 40},
    {"value": "no_plan", "label": "No formal plan yet", "score": 0},
    {"value": "unknown", "label": "I do not know", "score": 0}
 ]'::jsonb, 100, false),

('Q_RDY_004', 1,
 'Have you identified and classified all data that would be catastrophic if decrypted 5-10 years from now (harvest-now-decrypt-later scenario)?',
 'State actors are harvesting encrypted data today, betting that quantum computers will decrypt it within a decade. Your long-lived secrets (M&A documents, IP, citizen data) are at highest risk.',
 'single_choice',
 '[
    {"value": "fully", "label": "Yes, fully classified with retention policies", "score": 100},
    {"value": "partial", "label": "Partially - we know the key data assets", "score": 50},
    {"value": "aware", "label": "Aware of the concept but not actioned", "score": 15},
    {"value": "no", "label": "No", "score": 0}
 ]'::jsonb, 100, false),

('Q_RDY_005', 1,
 'Does your organization conduct regular AI red team exercises where AI systems actively attempt to breach your defenses?',
 'This anticipates the reality where defenders must use AI at the same speed as attackers. Currently only bleeding-edge organizations do this.',
 'single_choice',
 '[
    {"value": "continuous", "label": "Continuously - automated AI red team runs 24/7", "score": 100},
    {"value": "quarterly", "label": "Quarterly AI red team engagements", "score": 70},
    {"value": "annual", "label": "Annual AI red team test", "score": 40},
    {"value": "human_only", "label": "Only traditional human pen-testing", "score": 20},
    {"value": "none", "label": "No red team activities", "score": 0}
 ]'::jsonb, 100, true);

-- Sector weights for READINESS (FinServ weighs higher)
INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'smb'::sector_type, 1.0, 'Baseline weight'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_RDY_%';

INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'corporate'::sector_type, 1.5, 'Corporates have broader attack surface'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_RDY_%';

INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'financial_services'::sector_type, 2.5, 'FinServ: systemic risk, regulated, high-value target'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_RDY_%';

-- ----------------------------------------------------------------------------
-- DIMENSION 2: SECURITY MEASURES (controls in place)
-- ----------------------------------------------------------------------------

INSERT INTO questions (question_id, dimension, subcategory, is_core) VALUES
('Q_SEC_001', 'security_measures', 'identity', true),
('Q_SEC_002', 'security_measures', 'patching', true),
('Q_SEC_003', 'security_measures', 'soc_coverage', true),
('Q_SEC_004', 'security_measures', 'encryption_inventory', true),
('Q_SEC_005', 'security_measures', 'backup_recovery', true);

INSERT INTO question_versions (question_id, version_number, question_text, help_text, question_type, options, max_score, is_future_proofing) VALUES
('Q_SEC_001', 1,
 'What percentage of your workforce uses phishing-resistant MFA (FIDO2 hardware keys, passkeys, or platform authenticators) for all critical systems?',
 'SMS and app-based MFA are bypassable by AI-generated social engineering. Phishing-resistant MFA is the 2026 minimum.',
 'single_choice',
 '[
    {"value": "100", "label": "100% - all users, all critical systems", "score": 100},
    {"value": "75_99", "label": "75-99%", "score": 75},
    {"value": "50_74", "label": "50-74%", "score": 50},
    {"value": "25_49", "label": "25-49%", "score": 25},
    {"value": "under_25", "label": "Less than 25% or unknown", "score": 0}
 ]'::jsonb, 100, false),

('Q_SEC_002', 1,
 'What is your median time from CVE publication to patch deployment in production for critical vulnerabilities?',
 'Mythos-class AI can weaponize a new CVE within hours. Your patch window must shrink accordingly.',
 'single_choice',
 '[
    {"value": "under_24h", "label": "Under 24 hours", "score": 100},
    {"value": "1_3_days", "label": "1-3 days", "score": 75},
    {"value": "1_week", "label": "Within 1 week", "score": 50},
    {"value": "1_month", "label": "Within 1 month", "score": 25},
    {"value": "over_month", "label": "More than 1 month or unknown", "score": 0}
 ]'::jsonb, 100, false),

('Q_SEC_003', 1,
 'Does your organization have 24/7/365 security operations coverage with AI-augmented triage?',
 'AI attacks compress timelines from days to minutes. Business-hours-only SOC is no longer sufficient for 2026 threat landscape.',
 'single_choice',
 '[
    {"value": "24_7_ai", "label": "Yes, 24/7 with AI-augmented triage", "score": 100},
    {"value": "24_7_human", "label": "Yes, 24/7 but human-only triage", "score": 70},
    {"value": "business_hours", "label": "Business hours only", "score": 30},
    {"value": "mssp", "label": "Outsourced to MSSP (unclear coverage)", "score": 40},
    {"value": "none", "label": "No dedicated SOC", "score": 0}
 ]'::jsonb, 100, true),

('Q_SEC_004', 1,
 'Do you maintain a complete, real-time cryptographic inventory of every TLS certificate, VPN tunnel, SSH key, database encryption, and signed document in your environment?',
 'Prerequisite for any quantum migration. Most organizations have 30-70% visibility at best. True real-time inventory is rare.',
 'single_choice',
 '[
    {"value": "realtime", "label": "Yes, real-time automated inventory", "score": 100},
    {"value": "quarterly", "label": "Quarterly manual inventory", "score": 60},
    {"value": "annual", "label": "Annual inventory", "score": 30},
    {"value": "partial", "label": "Partial visibility only", "score": 15},
    {"value": "none", "label": "No formal inventory", "score": 0}
 ]'::jsonb, 100, false),

('Q_SEC_005', 1,
 'How frequently do you test recovery from a ransomware scenario involving AI-orchestrated attacks that disable backups?',
 'Modern AI-enabled ransomware specifically targets backup infrastructure. Untested backups are worthless.',
 'single_choice',
 '[
    {"value": "monthly", "label": "Monthly full recovery drills", "score": 100},
    {"value": "quarterly", "label": "Quarterly drills", "score": 75},
    {"value": "annual", "label": "Annual drill", "score": 40},
    {"value": "partial", "label": "Partial/tabletop only", "score": 20},
    {"value": "never", "label": "Never tested", "score": 0}
 ]'::jsonb, 100, false);

-- Security measures: balanced weights across sectors
INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, s, 1.5, 'Security baseline critical for all sectors'
FROM question_versions qv, (VALUES ('smb'::sector_type), ('corporate'::sector_type), ('financial_services'::sector_type)) AS sectors(s)
WHERE qv.question_id LIKE 'Q_SEC_%';

-- ----------------------------------------------------------------------------
-- DIMENSION 3: DEPENDENCIES (supply chain, third-party risk)
-- ----------------------------------------------------------------------------

INSERT INTO questions (question_id, dimension, subcategory, is_core) VALUES
('Q_DEP_001', 'dependencies', 'sbom', true),
('Q_DEP_002', 'dependencies', 'ai_vendor_risk', true),
('Q_DEP_003', 'dependencies', 'critical_vendor_concentration', true),
('Q_DEP_004', 'dependencies', 'open_source_risk', true);

INSERT INTO question_versions (question_id, version_number, question_text, help_text, question_type, options, max_score, is_future_proofing) VALUES
('Q_DEP_001', 1,
 'Do you maintain a Software Bill of Materials (SBOM) for every production system, updated automatically on every deployment?',
 'SBOM is the foundation for responding to supply chain attacks. Required by EU CRA for many products from 2027.',
 'single_choice',
 '[
    {"value": "automated", "label": "Yes, automated SBOM on every deploy", "score": 100},
    {"value": "manual_current", "label": "Manual but kept current", "score": 60},
    {"value": "manual_stale", "label": "Manual, often stale", "score": 25},
    {"value": "none", "label": "No SBOM process", "score": 0}
 ]'::jsonb, 100, false),

('Q_DEP_002', 1,
 'Have you conducted a formal security review of every AI/LLM vendor and API your organization uses, including data flow analysis and prompt injection risk?',
 'AI vendors are a new attack surface. Data leakage via shared context, indirect prompt injection, and model poisoning are emerging risks.',
 'single_choice',
 '[
    {"value": "all_reviewed", "label": "Yes, all AI vendors formally reviewed", "score": 100},
    {"value": "major_only", "label": "Major vendors only (OpenAI, Anthropic, etc.)", "score": 50},
    {"value": "shadow_ai", "label": "No - employees use AI tools without review", "score": 10},
    {"value": "no_ai", "label": "We have no AI vendors", "score": 0}
 ]'::jsonb, 100, true),

('Q_DEP_003', 1,
 'What percentage of your critical business operations depend on a single cloud provider or SaaS vendor (no redundancy)?',
 'Concentration risk is systemic. A single AWS/Azure/CrowdStrike outage should not halt your entire business.',
 'single_choice',
 '[
    {"value": "under_20", "label": "Less than 20% (strong multi-vendor posture)", "score": 100},
    {"value": "20_40", "label": "20-40%", "score": 70},
    {"value": "40_60", "label": "40-60%", "score": 40},
    {"value": "over_60", "label": "Over 60%", "score": 15},
    {"value": "unknown", "label": "We have not measured this", "score": 0}
 ]'::jsonb, 100, false),

('Q_DEP_004', 1,
 'How do you detect if an open-source dependency in your stack has been compromised (typosquatting, maintainer takeover, AI-generated malicious commits)?',
 'Mythos-class AI can generate convincing malicious pull requests. Detection must be automated and continuous.',
 'single_choice',
 '[
    {"value": "continuous_ai", "label": "Continuous AI-powered scanning", "score": 100},
    {"value": "signed_commits", "label": "Signed commits + dependency pinning", "score": 75},
    {"value": "vuln_scans", "label": "Periodic vulnerability scans only", "score": 40},
    {"value": "trust_npm", "label": "We trust package registries", "score": 10},
    {"value": "no_process", "label": "No specific process", "score": 0}
 ]'::jsonb, 100, true);

INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'smb'::sector_type, 1.0, 'Baseline'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_DEP_%';

INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'corporate'::sector_type, 1.8, 'Large vendor ecosystems amplify dependency risk'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_DEP_%';

INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'financial_services'::sector_type, 2.2, 'DORA requires formal third-party risk management'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_DEP_%';

-- ----------------------------------------------------------------------------
-- DIMENSION 4: COST EFFICIENCY (cyber spend effectiveness)
-- ----------------------------------------------------------------------------

INSERT INTO questions (question_id, dimension, subcategory, is_core) VALUES
('Q_CST_001', 'cost_efficiency', 'spend_ratio', true),
('Q_CST_002', 'cost_efficiency', 'tool_sprawl', true),
('Q_CST_003', 'cost_efficiency', 'contract_benchmarking', true),
('Q_CST_004', 'cost_efficiency', 'roi_measurement', true);

INSERT INTO question_versions (question_id, version_number, question_text, help_text, question_type, options, max_score, is_future_proofing) VALUES
('Q_CST_001', 1,
 'What percentage of your total IT budget is allocated to cybersecurity?',
 'Benchmark: SMB 8-12%, Corporate 10-14%, Financial Services 14-20%. Too low = underinvestment. Too high = likely inefficient.',
 'single_choice',
 '[
    {"value": "in_range", "label": "Within industry benchmark range", "score": 100},
    {"value": "slightly_low", "label": "Slightly below benchmark (1-3 points)", "score": 70},
    {"value": "slightly_high", "label": "Slightly above benchmark (1-3 points)", "score": 70},
    {"value": "significantly_off", "label": "Significantly outside range", "score": 25},
    {"value": "unknown", "label": "I do not know", "score": 0}
 ]'::jsonb, 100, false),

('Q_CST_002', 1,
 'How many distinct security tools/vendors does your organization currently pay for?',
 'The average enterprise has 45+ security tools with significant overlap. Tool sprawl = wasted money and integration debt.',
 'single_choice',
 '[
    {"value": "under_10", "label": "Under 10 (consolidated stack)", "score": 100},
    {"value": "10_20", "label": "10-20", "score": 75},
    {"value": "20_40", "label": "20-40", "score": 40},
    {"value": "over_40", "label": "Over 40", "score": 15},
    {"value": "unknown", "label": "We have no central inventory", "score": 0}
 ]'::jsonb, 100, false),

('Q_CST_003', 1,
 'When was the last time you benchmarked your cybersecurity contract prices against the market?',
 'IT contracts typically contain 15-30% negotiation room. Regular benchmarking is standard in procurement-mature organizations.',
 'single_choice',
 '[
    {"value": "last_year", "label": "Within the last 12 months", "score": 100},
    {"value": "1_2_years", "label": "1-2 years ago", "score": 60},
    {"value": "2_5_years", "label": "2-5 years ago", "score": 25},
    {"value": "never", "label": "Never formally benchmarked", "score": 0}
 ]'::jsonb, 100, false),

('Q_CST_004', 1,
 'Can you quantify the ROI or cost-of-breach-avoidance for each major security investment?',
 'Mature security orgs translate spend to risk reduction in euros. This is required for board-level conversations under NIS2.',
 'single_choice',
 '[
    {"value": "fully", "label": "Yes, fully quantified per investment", "score": 100},
    {"value": "major_only", "label": "Major investments only", "score": 60},
    {"value": "qualitative", "label": "Qualitative justifications only", "score": 25},
    {"value": "no", "label": "We do not measure ROI", "score": 0}
 ]'::jsonb, 100, false);

INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, s, w, r
FROM question_versions qv, (VALUES
    ('smb'::sector_type, 1.3::decimal, 'Every euro matters for SMB'),
    ('corporate'::sector_type, 1.0::decimal, 'Baseline'),
    ('financial_services'::sector_type, 1.2::decimal, 'Regulatory cost scrutiny')
) AS sw(s, w, r)
WHERE qv.question_id LIKE 'Q_CST_%';

-- ----------------------------------------------------------------------------
-- DIMENSION 5: COMPLIANCE (NIS2, DORA, EU AI Act, GDPR)
-- ----------------------------------------------------------------------------

INSERT INTO questions (question_id, dimension, subcategory, is_core) VALUES
('Q_CMP_001', 'compliance', 'nis2', true),
('Q_CMP_002', 'compliance', 'eu_ai_act', true),
('Q_CMP_003', 'compliance', 'dora', true),
('Q_CMP_004', 'compliance', 'incident_reporting', true);

INSERT INTO question_versions (question_id, version_number, question_text, help_text, question_type, options, max_score, is_future_proofing) VALUES
('Q_CMP_001', 1,
 'NIS2 Directive: Is your organization in scope, and if yes, are you fully compliant with technical, organizational, and incident reporting requirements?',
 'NIS2 took effect October 2024. Essential and Important entities face fines up to 2% of global turnover. Scope is broader than most realize.',
 'single_choice',
 '[
    {"value": "in_scope_compliant", "label": "In scope and fully compliant", "score": 100},
    {"value": "in_scope_partial", "label": "In scope, partially compliant", "score": 50},
    {"value": "in_scope_noncompliant", "label": "In scope, not yet compliant", "score": 10},
    {"value": "not_in_scope_verified", "label": "Verified not in scope", "score": 100},
    {"value": "unknown", "label": "Unsure of scope applicability", "score": 0}
 ]'::jsonb, 100, false),

('Q_CMP_002', 1,
 'EU AI Act: Have you inventoried all AI systems in use and classified them per the Act (prohibited / high-risk / limited-risk / minimal-risk)?',
 'EU AI Act fully applies August 2026. High-risk AI systems face extensive obligations. Shadow AI is the biggest blind spot.',
 'single_choice',
 '[
    {"value": "complete", "label": "Complete inventory with risk classification", "score": 100},
    {"value": "partial", "label": "Partial inventory", "score": 50},
    {"value": "aware", "label": "Aware of requirements, not yet started", "score": 15},
    {"value": "no", "label": "No AI inventory", "score": 0}
 ]'::jsonb, 100, false),

('Q_CMP_003', 1,
 'DORA (Digital Operational Resilience Act): If you are a financial entity, is your ICT risk management framework compliant and tested?',
 'DORA applies to EU financial entities from January 2025. Requires ICT risk framework, incident reporting, and third-party risk management.',
 'single_choice',
 '[
    {"value": "fin_compliant", "label": "Financial entity, fully DORA compliant", "score": 100},
    {"value": "fin_partial", "label": "Financial entity, partial compliance", "score": 50},
    {"value": "fin_noncompliant", "label": "Financial entity, not compliant", "score": 0},
    {"value": "not_financial", "label": "Not a financial entity", "score": 100},
    {"value": "unknown", "label": "Unsure", "score": 20}
 ]'::jsonb, 100, false),

('Q_CMP_004', 1,
 'Can your organization detect, investigate, and report a significant incident within 24 hours (NIS2 early warning requirement)?',
 'NIS2 requires 24-hour early warning, 72-hour notification, 1-month final report. Most orgs fail the 24-hour window.',
 'single_choice',
 '[
    {"value": "under_24", "label": "Yes, tested and proven under 24h", "score": 100},
    {"value": "under_72", "label": "Within 72 hours", "score": 60},
    {"value": "best_effort", "label": "Best effort, not tested", "score": 25},
    {"value": "no", "label": "No formal incident reporting process", "score": 0}
 ]'::jsonb, 100, false);

INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'smb'::sector_type, 1.2, 'NIS2 scope expanding to more SMBs'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_CMP_%';

INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'corporate'::sector_type, 2.0, 'Full NIS2 and AI Act exposure'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_CMP_%';

INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'financial_services'::sector_type, 3.0, 'DORA + NIS2 + sector-specific regulators'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_CMP_%';

-- ----------------------------------------------------------------------------
-- DIMENSION 6: GOVERNANCE (board oversight, policies)
-- ----------------------------------------------------------------------------

INSERT INTO questions (question_id, dimension, subcategory, is_core) VALUES
('Q_GOV_001', 'governance', 'board_oversight', true),
('Q_GOV_002', 'governance', 'ciso_authority', true),
('Q_GOV_003', 'governance', 'policy_currency', true),
('Q_GOV_004', 'governance', 'ai_governance_committee', true);

INSERT INTO question_versions (question_id, version_number, question_text, help_text, question_type, options, max_score, is_future_proofing) VALUES
('Q_GOV_001', 1,
 'How often does your board of directors receive a formal cybersecurity briefing covering AI and quantum threats?',
 'NIS2 makes board members personally liable for cyber oversight. Quarterly minimum is best practice. Annual briefings are no longer sufficient.',
 'single_choice',
 '[
    {"value": "monthly", "label": "Monthly", "score": 100},
    {"value": "quarterly", "label": "Quarterly", "score": 85},
    {"value": "biannual", "label": "Twice per year", "score": 50},
    {"value": "annual", "label": "Annually", "score": 25},
    {"value": "ad_hoc", "label": "Only when incidents occur", "score": 5},
    {"value": "never", "label": "Never", "score": 0}
 ]'::jsonb, 100, false),

('Q_GOV_002', 1,
 'Does your CISO (or equivalent) have direct reporting line to the CEO or board, with authority to halt projects on security grounds?',
 'CISO buried under IT often cannot escalate fast enough. Direct C-suite/board access is the benchmark for mature governance.',
 'single_choice',
 '[
    {"value": "ceo_board", "label": "Direct to CEO/board with halt authority", "score": 100},
    {"value": "ceo_no_halt", "label": "Direct to CEO, no formal halt authority", "score": 70},
    {"value": "cio_reports", "label": "Reports to CIO", "score": 40},
    {"value": "buried", "label": "Further buried in the org", "score": 15},
    {"value": "no_ciso", "label": "No dedicated CISO", "score": 0}
 ]'::jsonb, 100, false),

('Q_GOV_003', 1,
 'When were your core security policies (acceptable AI use, incident response, data classification, quantum-readiness) last reviewed and updated?',
 'Policies older than 12 months almost certainly do not address AI or quantum. Annual minimum, quarterly for fast-moving areas.',
 'single_choice',
 '[
    {"value": "under_6_months", "label": "All updated in last 6 months", "score": 100},
    {"value": "6_12_months", "label": "Updated in last 12 months", "score": 70},
    {"value": "12_24_months", "label": "12-24 months old", "score": 30},
    {"value": "older", "label": "Older than 24 months", "score": 5},
    {"value": "no_policies", "label": "No formal policies on these topics", "score": 0}
 ]'::jsonb, 100, false),

('Q_GOV_004', 1,
 'Does your organization have a formal AI governance committee responsible for approving AI use cases, monitoring deployed models, and managing AI-specific risks?',
 'EU AI Act requires governance structures for high-risk AI. Beyond compliance, this prevents shadow AI and model drift.',
 'single_choice',
 '[
    {"value": "formal_active", "label": "Yes, formal committee meeting monthly or more", "score": 100},
    {"value": "formal_quarterly", "label": "Formal committee, quarterly meetings", "score": 75},
    {"value": "informal", "label": "Informal group, ad hoc", "score": 35},
    {"value": "planned", "label": "Planned but not yet established", "score": 15},
    {"value": "none", "label": "No AI governance structure", "score": 0}
 ]'::jsonb, 100, false);

INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'smb'::sector_type, 1.0, 'Baseline'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_GOV_%';

INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'corporate'::sector_type, 1.8, 'Board liability and governance scrutiny'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_GOV_%';

INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'financial_services'::sector_type, 2.5, 'Regulator expectations for FS governance'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_GOV_%';

-- ----------------------------------------------------------------------------
-- ADAPTIVE BRANCH QUESTIONS (triggered based on core answers)
-- ----------------------------------------------------------------------------
-- Example: if Q_RDY_003 = "planned_2028_2030" or "no_plan", ask deeper questions

INSERT INTO questions (question_id, dimension, subcategory, is_core, parent_question_id, branch_condition) VALUES
('Q_RDY_003B', 'readiness', 'pqc_blockers', false, 'Q_RDY_003',
 '{"answer_in": ["planned_2028_2030", "no_plan"]}'::jsonb),
('Q_SEC_002B', 'security_measures', 'patch_automation', false, 'Q_SEC_002',
 '{"answer_in": ["1_week", "1_month", "over_month"]}'::jsonb),
('Q_DEP_002B', 'dependencies', 'shadow_ai_detail', false, 'Q_DEP_002',
 '{"answer_in": ["shadow_ai", "major_only"]}'::jsonb);

INSERT INTO question_versions (question_id, version_number, question_text, help_text, question_type, options, max_score, is_future_proofing) VALUES
('Q_RDY_003B', 1,
 'What is the primary blocker to your post-quantum cryptography migration?',
 'Understanding the blocker helps calibrate realistic remediation.',
 'single_choice',
 '[
    {"value": "vendor_readiness", "label": "Vendors not yet PQC-ready", "score": 60},
    {"value": "legacy_systems", "label": "Legacy systems cannot be upgraded", "score": 40},
    {"value": "budget", "label": "Budget not allocated", "score": 20},
    {"value": "awareness", "label": "Lack of internal awareness/sponsorship", "score": 10},
    {"value": "not_a_priority", "label": "Not considered a priority", "score": 0}
 ]'::jsonb, 100, false),

('Q_SEC_002B', 1,
 'What percentage of your patching process is automated versus manual?',
 'Manual patching at scale cannot keep up with AI-driven exploitation.',
 'single_choice',
 '[
    {"value": "over_80", "label": "Over 80% automated", "score": 100},
    {"value": "50_80", "label": "50-80% automated", "score": 60},
    {"value": "25_50", "label": "25-50% automated", "score": 30},
    {"value": "under_25", "label": "Under 25% automated", "score": 10}
 ]'::jsonb, 100, false),

('Q_DEP_002B', 1,
 'Have you experienced (or discovered after the fact) any data leakage through employee use of consumer AI tools (ChatGPT, Claude, Gemini)?',
 'Shadow AI leakage is now one of the top data loss vectors. Many organizations discover it only post-incident.',
 'single_choice',
 '[
    {"value": "no_monitoring_active", "label": "Yes, caught by active monitoring", "score": 70},
    {"value": "yes_after", "label": "Yes, discovered after the fact", "score": 20},
    {"value": "no_confident", "label": "No, with active monitoring in place", "score": 100},
    {"value": "no_unmonitored", "label": "Not that we know of (no monitoring)", "score": 15}
 ]'::jsonb, 100, true);

-- Branch questions use same sector weights as parents
INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, s, 1.0, 'Branch question - baseline weight'
FROM question_versions qv, (VALUES ('smb'::sector_type), ('corporate'::sector_type), ('financial_services'::sector_type)) AS sectors(s)
WHERE qv.question_id IN ('Q_RDY_003B', 'Q_SEC_002B', 'Q_DEP_002B');
