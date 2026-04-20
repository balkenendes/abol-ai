-- ============================================================================
-- Migration 002: Resilience Questions
-- ============================================================================
-- Seeds 6 questions for the new "resilience" pillar (recovery, continuity,
-- incident response). Mirrors the structure of seed_questions.sql.
--
-- Prerequisite: migration 001_seven_pillars.sql must be applied first so the
-- 'resilience' enum value exists on dimension_type.
--
-- Each question follows the stable-id + versioned-content pattern:
--   questions (stable question_id)
--     -> question_versions (version 1, options with per-option scores)
--        -> sector_weights (per-sector multipliers)
--
-- Sector weights for resilience (matching app.html line 765):
--   SMB:                1.4
--   Corporate:          1.5
--   Financial Services: 2.0
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Register the 6 stable question IDs
-- ----------------------------------------------------------------------------
INSERT INTO questions (question_id, dimension, subcategory, is_core) VALUES
('Q_RES_001', 'resilience', 'ransomware_recovery_drill',        true),
('Q_RES_002', 'resilience', 'tested_recovery_time_objective',   true),
('Q_RES_003', 'resilience', 'ai_incident_response_playbook',    true),
('Q_RES_004', 'resilience', 'offline_immutable_backups',        true),
('Q_RES_005', 'resilience', 'incident_response_retainer',       true),
('Q_RES_006', 'resilience', 'business_impact_analysis',         true)
ON CONFLICT (question_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Question version 1 content — text, options, scores
-- ----------------------------------------------------------------------------

-- Q_RES_001: Ransomware recovery drill frequency
INSERT INTO question_versions (question_id, version_number, question_text, help_text, question_type, options, max_score, is_future_proofing) VALUES
('Q_RES_001', 1,
 'How frequently do you test full recovery from a ransomware scenario where AI-orchestrated attacks have specifically targeted and disabled your backup infrastructure?',
 'Modern AI-enabled ransomware specifically targets backup systems. Untested backups are effectively worthless in a real incident.',
 'single_choice',
 '[
    {"value": "monthly",    "label": "Monthly full recovery drills including backup compromise scenarios", "score": 100},
    {"value": "quarterly",  "label": "Quarterly drills",                                                    "score":  75},
    {"value": "annual",     "label": "Annual drill",                                                        "score":  40},
    {"value": "tabletop",   "label": "Tabletop exercises only — no actual recovery tested",                 "score":  20},
    {"value": "never",      "label": "Recovery has never been tested",                                      "score":   0}
 ]'::jsonb, 100, false);

-- Q_RES_002: Tested recovery time objective
INSERT INTO question_versions (question_id, version_number, question_text, help_text, question_type, options, max_score, is_future_proofing) VALUES
('Q_RES_002', 1,
 'What is your organization''s tested recovery time objective for critical business systems after a major cyber incident?',
 'This is the actual tested time, not the planned or aspirational target. Many organizations discover their real recovery time is 5-10 times longer than expected.',
 'single_choice',
 '[
    {"value": "under_4h",     "label": "Under 4 hours — tested and verified",           "score": 100},
    {"value": "4_24h",        "label": "4-24 hours — tested",                           "score":  75},
    {"value": "1_7d",         "label": "1-7 days",                                      "score":  40},
    {"value": "over_7d",      "label": "More than 7 days or unknown",                   "score":  10},
    {"value": "never_tested", "label": "We have never tested actual recovery time",     "score":   0}
 ]'::jsonb, 100, false);

-- Q_RES_003: AI-specific incident response playbooks (future-proofing)
INSERT INTO question_versions (question_id, version_number, question_text, help_text, question_type, options, max_score, is_future_proofing) VALUES
('Q_RES_003', 1,
 'Does your incident response plan specifically address AI-enabled attack scenarios (autonomous exploitation, AI-generated social engineering, deepfake impersonation of executives)?',
 'Traditional incident response playbooks were not designed for the speed and sophistication of AI-enabled attacks. Specific procedures are needed.',
 'single_choice',
 '[
    {"value": "specific_tested",   "label": "Yes, specific AI-attack playbooks that have been tested in exercises", "score": 100},
    {"value": "specific_untested", "label": "Yes, documented but not yet tested in exercises",                      "score":  60},
    {"value": "generic",           "label": "We have a general incident response plan, not AI-specific",            "score":  30},
    {"value": "none",              "label": "No formal incident response plan",                                     "score":   0}
 ]'::jsonb, 100, true);

-- Q_RES_004: Offline immutable backups
INSERT INTO question_versions (question_id, version_number, question_text, help_text, question_type, options, max_score, is_future_proofing) VALUES
('Q_RES_004', 1,
 'Do you maintain offline, immutable backups that are physically separated from your production network and tested regularly?',
 'If an attacker gains administrative access to your network, online backups can be encrypted or deleted. Offline and immutable copies are the last line of defense.',
 'single_choice',
 '[
    {"value": "offline_tested",    "label": "Yes, offline immutable backups tested at least quarterly", "score": 100},
    {"value": "offline_untested",  "label": "Offline backups exist but are not regularly tested",       "score":  60},
    {"value": "cloud_immutable",   "label": "Cloud-based immutable backups only (no offline copy)",     "score":  45},
    {"value": "online_only",       "label": "Online backups only, connected to the production network", "score":  15},
    {"value": "none",              "label": "No structured backup strategy",                            "score":   0}
 ]'::jsonb, 100, false);

-- Q_RES_005: Incident response retainer
INSERT INTO question_versions (question_id, version_number, question_text, help_text, question_type, options, max_score, is_future_proofing) VALUES
('Q_RES_005', 1,
 'Does your organization have pre-arranged contracts with external incident response and forensics providers, with guaranteed response times?',
 'During a major incident, incident response providers are often fully booked. Pre-arranged retainers with guaranteed response times (typically under 4 hours) are critical.',
 'single_choice',
 '[
    {"value": "retainer_tested",   "label": "Yes, retainer in place with guaranteed response time, tested annually", "score": 100},
    {"value": "retainer_untested", "label": "Retainer in place but never activated or tested",                       "score":  65},
    {"value": "identified",        "label": "Providers identified but no formal agreement",                          "score":  30},
    {"value": "none",              "label": "We would need to find a provider during the incident",                  "score":   0}
 ]'::jsonb, 100, false);

-- Q_RES_006: Business impact analysis
INSERT INTO question_versions (question_id, version_number, question_text, help_text, question_type, options, max_score, is_future_proofing) VALUES
('Q_RES_006', 1,
 'Has your organization conducted a formal business impact analysis that quantifies the financial cost of downtime per hour for each critical business process?',
 'Without knowing the cost of downtime, it is impossible to make rational investment decisions about resilience. This analysis also drives recovery prioritization during an incident.',
 'single_choice',
 '[
    {"value": "current_quantified", "label": "Yes, current analysis with per-hour cost estimates for all critical processes", "score": 100},
    {"value": "partial",            "label": "Partial analysis — covers some critical processes",                             "score":  55},
    {"value": "outdated",           "label": "Analysis exists but is more than 2 years old",                                  "score":  25},
    {"value": "none",               "label": "No formal business impact analysis has been conducted",                         "score":   0}
 ]'::jsonb, 100, false);

-- ----------------------------------------------------------------------------
-- 3. Sector weights for all six resilience questions
-- ----------------------------------------------------------------------------
INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'smb'::sector_type, 1.4, 'Resilience gap more catastrophic for smaller teams'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_RES_%';

INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'corporate'::sector_type, 1.5, 'Larger org: more interdependencies amplify recovery complexity'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_RES_%';

INSERT INTO sector_weights (question_version_id, sector, weight, rationale)
SELECT qv.id, 'financial_services'::sector_type, 2.0, 'DORA mandates tested resilience with short recovery windows'
FROM question_versions qv WHERE qv.question_id LIKE 'Q_RES_%';

-- ----------------------------------------------------------------------------
-- 4. Verification (run manually)
-- ----------------------------------------------------------------------------
-- SELECT question_id, dimension, subcategory FROM questions WHERE dimension='resilience' ORDER BY question_id;
-- SELECT qv.question_id, sw.sector, sw.weight FROM sector_weights sw
--   JOIN question_versions qv ON qv.id = sw.question_version_id
--   WHERE qv.question_id LIKE 'Q_RES_%' ORDER BY qv.question_id, sw.sector;
