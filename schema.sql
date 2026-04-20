-- ============================================================================
-- ABOL.ai Benchmark Platform - PostgreSQL Schema
-- ============================================================================
-- Hybrid versioning: stable question_id + version history for wording/weights
-- Sector-specific weights: SMB / Corporate / Financial Services
-- Dimensions: readiness, security_measures, dependencies, cost_efficiency,
--             compliance, governance
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
CREATE TYPE sector_type AS ENUM (
    'smb',              -- 50M-500M revenue
    'corporate',        -- 500M+ revenue
    'financial_services' -- Banks, insurance, pension funds
);

CREATE TYPE dimension_type AS ENUM (
    'readiness',         -- AI + Quantum threat readiness
    'security_measures', -- Controls in place
    'dependencies',      -- Supply chain, vendors, open source
    'cost_efficiency',   -- Cyber spend effectiveness
    'compliance',        -- NIS2, DORA, EU AI Act, GDPR
    'governance'         -- Board oversight, policies, accountability
);

CREATE TYPE question_type AS ENUM (
    'single_choice',  -- Radio buttons, one answer
    'multi_choice',   -- Checkboxes, multiple answers
    'scale',          -- 1-5 or 1-10 Likert
    'numeric',        -- Raw number (e.g., % of budget)
    'boolean'         -- Yes/No
);

CREATE TYPE assessment_status AS ENUM (
    'in_progress',
    'completed',
    'abandoned'
);

-- ----------------------------------------------------------------------------
-- QUESTION CATALOG (stable IDs, versioned content)
-- ----------------------------------------------------------------------------
-- question_id is STABLE FOREVER. Content/weights change via versions.
-- Answers always reference BOTH question_id AND version_id for comparability.

CREATE TABLE questions (
    question_id VARCHAR(20) PRIMARY KEY,  -- e.g., "Q_AI_001", "Q_QTM_012"
    dimension dimension_type NOT NULL,
    subcategory VARCHAR(100),              -- e.g., "ai_red_teaming", "pqc_migration"
    is_core BOOLEAN NOT NULL DEFAULT true, -- true = always asked, false = adaptive branch
    parent_question_id VARCHAR(20) REFERENCES questions(question_id),
    branch_condition JSONB,                -- {"answer_in": ["yes", "partial"]}
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deprecated_at TIMESTAMPTZ              -- NULL = still active
);

CREATE INDEX idx_questions_dimension ON questions(dimension) WHERE deprecated_at IS NULL;
CREATE INDEX idx_questions_core ON questions(is_core) WHERE deprecated_at IS NULL;

-- ----------------------------------------------------------------------------
-- QUESTION VERSIONS (content, wording, options change here)
-- ----------------------------------------------------------------------------
CREATE TABLE question_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id VARCHAR(20) NOT NULL REFERENCES questions(question_id),
    version_number INT NOT NULL,           -- 1, 2, 3...
    question_text TEXT NOT NULL,
    help_text TEXT,                        -- Explanation for IT staff
    question_type question_type NOT NULL,
    options JSONB,                         -- [{"value": "yes", "label": "Yes", "score": 100}, ...]
    max_score DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    is_future_proofing BOOLEAN DEFAULT false, -- true = anticipates Mythos/AGI/quantum, nearly impossible today
    introduced_at TIMESTAMPTZ DEFAULT NOW(),
    retired_at TIMESTAMPTZ,                -- when this version was replaced
    UNIQUE(question_id, version_number)
);

CREATE INDEX idx_qv_question_id ON question_versions(question_id);
CREATE INDEX idx_qv_active ON question_versions(question_id) WHERE retired_at IS NULL;

-- ----------------------------------------------------------------------------
-- SECTOR WEIGHTS (per question version, per sector)
-- ----------------------------------------------------------------------------
-- Each question version can have different weights per sector.
-- Example: Q_QTM_001 might be weight 3.0 for Financial Services but 1.0 for SMB.

CREATE TABLE sector_weights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
    sector sector_type NOT NULL,
    weight DECIMAL(4,2) NOT NULL DEFAULT 1.00,  -- 1.0 = normal, 3.0 = triple weight
    rationale TEXT,
    UNIQUE(question_version_id, sector)
);

CREATE INDEX idx_sw_sector ON sector_weights(sector);
CREATE INDEX idx_sw_qv ON sector_weights(question_version_id);

-- ----------------------------------------------------------------------------
-- ORGANIZATIONS (who is being benchmarked)
-- ----------------------------------------------------------------------------
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255),                     -- Optional, can be anonymous
    sector sector_type NOT NULL,
    employee_count_bucket VARCHAR(20),     -- "50-100", "100-500", "500-1000", "1000+"
    country VARCHAR(2),                    -- ISO code, e.g., "NL"
    email_hash VARCHAR(64),                -- SHA-256 of email for privacy
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_org_sector ON organizations(sector);
CREATE INDEX idx_org_email_hash ON organizations(email_hash);

-- ----------------------------------------------------------------------------
-- ASSESSMENTS (each questionnaire attempt)
-- ----------------------------------------------------------------------------
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    status assessment_status NOT NULL DEFAULT 'in_progress',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INT,
    -- Freemium: free users see summary, paid users see everything
    is_paid BOOLEAN DEFAULT false,
    payment_reference VARCHAR(100),
    -- Store sector at assessment time (org sector may change)
    sector_snapshot sector_type NOT NULL,
    -- Client metadata for fraud detection
    ip_hash VARCHAR(64),
    user_agent_hash VARCHAR(64)
);

CREATE INDEX idx_assessments_org ON assessments(organization_id);
CREATE INDEX idx_assessments_status ON assessments(status);
CREATE INDEX idx_assessments_sector ON assessments(sector_snapshot);
CREATE INDEX idx_assessments_completed ON assessments(completed_at) WHERE status = 'completed';

-- ----------------------------------------------------------------------------
-- ANSWERS (the actual responses, linked to specific question version)
-- ----------------------------------------------------------------------------
CREATE TABLE answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    question_id VARCHAR(20) NOT NULL REFERENCES questions(question_id),
    question_version_id UUID NOT NULL REFERENCES question_versions(id),
    -- The raw answer (flexible format)
    answer_value JSONB NOT NULL,           -- {"selected": "yes"} or {"selected": ["a","b"]} or {"value": 7}
    -- Score computed at time of answering (for historical comparability)
    raw_score DECIMAL(5,2) NOT NULL,       -- Out of max_score
    weighted_score DECIMAL(6,2) NOT NULL,  -- raw_score * sector_weight
    sector_weight_applied DECIMAL(4,2) NOT NULL,
    answered_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(assessment_id, question_id)
);

CREATE INDEX idx_answers_assessment ON answers(assessment_id);
CREATE INDEX idx_answers_question ON answers(question_id);
CREATE INDEX idx_answers_qv ON answers(question_version_id);

-- ----------------------------------------------------------------------------
-- SCORES (computed dimension scores per assessment)
-- ----------------------------------------------------------------------------
CREATE TABLE assessment_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    dimension dimension_type NOT NULL,
    raw_score DECIMAL(6,2) NOT NULL,       -- Sum of weighted scores
    max_possible_score DECIMAL(6,2) NOT NULL, -- Sum of max * weights
    percentage DECIMAL(5,2) NOT NULL,      -- raw/max * 100
    -- Percentile vs same sector & size bucket
    peer_percentile DECIMAL(5,2),          -- e.g., 73.5 = better than 73.5% of peers
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(assessment_id, dimension)
);

CREATE INDEX idx_scores_assessment ON assessment_scores(assessment_id);
CREATE INDEX idx_scores_dimension ON assessment_scores(dimension);

-- ----------------------------------------------------------------------------
-- OVERALL SCORE (the headline number)
-- ----------------------------------------------------------------------------
CREATE TABLE overall_scores (
    assessment_id UUID PRIMARY KEY REFERENCES assessments(id) ON DELETE CASCADE,
    overall_percentage DECIMAL(5,2) NOT NULL,
    overall_percentile DECIMAL(5,2),       -- vs same sector
    rating VARCHAR(20),                    -- "Critical", "At Risk", "Fair", "Strong", "Leader"
    computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- BENCHMARKS CACHE (for fast peer comparison)
-- ----------------------------------------------------------------------------
-- Pre-computed aggregates per sector + dimension + time window
CREATE TABLE benchmark_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sector sector_type NOT NULL,
    dimension dimension_type NOT NULL,
    employee_bucket VARCHAR(20),
    sample_size INT NOT NULL,
    p10 DECIMAL(5,2),
    p25 DECIMAL(5,2),
    p50 DECIMAL(5,2),                      -- median
    p75 DECIMAL(5,2),
    p90 DECIMAL(5,2),
    mean DECIMAL(5,2),
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sector, dimension, employee_bucket)
);

CREATE INDEX idx_benchmark_lookup ON benchmark_cache(sector, dimension, employee_bucket);

-- ----------------------------------------------------------------------------
-- VIEWS for analytics
-- ----------------------------------------------------------------------------

-- Active (non-deprecated) questions with their latest version
CREATE VIEW active_questions AS
SELECT
    q.question_id,
    q.dimension,
    q.subcategory,
    q.is_core,
    q.parent_question_id,
    q.branch_condition,
    qv.id AS version_id,
    qv.version_number,
    qv.question_text,
    qv.help_text,
    qv.question_type,
    qv.options,
    qv.max_score,
    qv.is_future_proofing
FROM questions q
JOIN question_versions qv ON qv.question_id = q.question_id
WHERE q.deprecated_at IS NULL
  AND qv.retired_at IS NULL;

-- Completed assessments with overall scores
CREATE VIEW completed_assessments AS
SELECT
    a.id AS assessment_id,
    a.organization_id,
    o.sector,
    o.employee_count_bucket,
    o.country,
    a.completed_at,
    a.duration_seconds,
    a.is_paid,
    os.overall_percentage,
    os.overall_percentile,
    os.rating
FROM assessments a
JOIN organizations o ON o.id = a.organization_id
LEFT JOIN overall_scores os ON os.assessment_id = a.id
WHERE a.status = 'completed';

COMMENT ON SCHEMA public IS 'ABOL.ai benchmark platform - AI + Quantum cyber readiness';
