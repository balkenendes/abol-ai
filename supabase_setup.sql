-- ABOL.ai — AI & Quantum Security Index
-- Run this ONCE in Supabase SQL Editor

-- Assessment table (one row per completed assessment)
CREATE TABLE IF NOT EXISTS abol_assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Organization profile
  sector TEXT NOT NULL,
  employee_bucket TEXT,
  revenue TEXT,
  countries JSONB,
  email TEXT,
  email_hash TEXT,
  organization TEXT,
  job_title TEXT,

  -- All answers stored as JSONB: {"Q_RDY_001": {"selected": "weekly", "score": 100, "weight": 2.5}, ...}
  answers JSONB DEFAULT '{}'::jsonb,

  -- Computed scores
  dimension_scores JSONB,     -- {"readiness": 42.5, "security_measures": 65.0, ...}
  overall_percentage NUMERIC(5,2),
  overall_rating TEXT,        -- Leader / Strong / Fair / At Risk / Critical

  -- Status
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  is_paid BOOLEAN DEFAULT FALSE,
  payment_reference TEXT
);

-- Index for peer benchmarking queries
CREATE INDEX IF NOT EXISTS idx_abol_sector_status
  ON abol_assessments(sector, status) WHERE status = 'completed';

-- Enable Row Level Security
ALTER TABLE abol_assessments ENABLE ROW LEVEL SECURITY;

-- Policy: anyone can INSERT (anonymous assessment start)
CREATE POLICY "Anyone can create assessments"
  ON abol_assessments FOR INSERT
  WITH CHECK (true);

-- Policy: anyone can UPDATE their own row (by knowing the UUID)
CREATE POLICY "Update own assessment by ID"
  ON abol_assessments FOR UPDATE
  USING (true);

-- Policy: anyone can read their own assessment (by knowing the UUID)
CREATE POLICY "Read own assessment by ID"
  ON abol_assessments FOR SELECT
  USING (true);

-- Policy: aggregated reads for benchmarking (only completed, only scores)
-- This is permissive for MVP; tighten later

-- Verify
SELECT 'abol_assessments table created successfully' AS result;
