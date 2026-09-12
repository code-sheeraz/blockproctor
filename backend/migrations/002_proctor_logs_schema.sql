-- 002_proctor_logs_schema.sql
-- Historical delta: proctor logging schema for research metrics.
-- No-op on fresh installs (tables/columns already exist from 001_initial_schema).

-- Migrate legacy proctor_logs rows (old events_json schema) to the current
-- column layout. Runs only when the legacy column still exists.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'proctor_logs' AND column_name = 'events_json') THEN

        ALTER TABLE proctor_logs ADD COLUMN IF NOT EXISTS violation_type VARCHAR(50);
        ALTER TABLE proctor_logs ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE proctor_logs ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 100;
        ALTER TABLE proctor_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
        ALTER TABLE proctor_logs ADD COLUMN IF NOT EXISTS attempt_id INTEGER REFERENCES attempts(id);

        UPDATE proctor_logs
        SET violation_type = COALESCE((events_json::json->>'type')::VARCHAR, 'UNKNOWN'),
            description = COALESCE(events_json::json->>'description', ''),
            metadata = COALESCE((events_json::json->'metadata')::JSONB, '{}'::JSONB)
        WHERE violation_type IS NULL AND events_json IS NOT NULL;

        RAISE NOTICE 'Migrated legacy proctor_logs rows to the current schema';
    END IF;
END $$;

-- Historical data migration: mark users with a stored face descriptor as
-- approved, and backfill exam_sessions from legacy attempts.
UPDATE users
SET enrollment_status = 'APPROVED'
WHERE face_descriptor IS NOT NULL AND enrollment_status = 'NOT_ENROLLED';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attempts') THEN
        INSERT INTO exam_sessions (exam_id, student_id, status, started_at, submitted_at)
        SELECT exam_id, student_id, 'SUBMITTED', COALESCE(started_at, NOW()), COALESCE(submitted_at, NOW())
        FROM attempts
        ON CONFLICT (exam_id, student_id) DO NOTHING;
    END IF;
END $$;

-- Indexes for research queries
CREATE INDEX IF NOT EXISTS idx_proctor_logs_student ON proctor_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_proctor_logs_exam ON proctor_logs(exam_id);
CREATE INDEX IF NOT EXISTS idx_proctor_logs_attempt ON proctor_logs(attempt_id);
CREATE INDEX IF NOT EXISTS idx_proctor_logs_type ON proctor_logs(violation_type);
CREATE INDEX IF NOT EXISTS idx_proctor_logs_created ON proctor_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_student ON exam_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_exam ON exam_sessions(exam_id);

-- Violation type reference
COMMENT ON COLUMN proctor_logs.violation_type IS 'Types: HEAD_TURN_LEFT, HEAD_TURN_RIGHT, HEAD_TURN_UP, HEAD_TURN_DOWN, MULTI_FACE, ABSENCE_CRITICAL, IMPERSONATION, BLOCKED';
