-- 011_exam_sessions_schema_fix.sql
-- Reconciliation: ensures both historical column sets on exam_sessions exist
-- regardless of which migration created the table first.
-- No-op on fresh installs (all columns already exist from 001_initial_schema).

ALTER TABLE exam_sessions
    ADD COLUMN IF NOT EXISTS attempt_id INTEGER REFERENCES attempts(id),
    ADD COLUMN IF NOT EXISTS session_start TIMESTAMP,
    ADD COLUMN IF NOT EXISTS session_end TIMESTAMP,
    ADD COLUMN IF NOT EXISTS initial_trust_score INTEGER DEFAULT 100,
    ADD COLUMN IF NOT EXISTS final_trust_score INTEGER,
    ADD COLUMN IF NOT EXISTS total_violations INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS blockchain_tx_hash VARCHAR(66),
    ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS metadata JSONB;

ALTER TABLE exam_sessions
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
