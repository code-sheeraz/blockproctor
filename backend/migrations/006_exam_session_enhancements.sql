-- 006_exam_session_enhancements.sql
-- Exam session locking, heartbeat tracking, violation thresholds, grace period.
-- No-op on fresh installs (columns/tables already exist from 001_initial_schema).

ALTER TABLE exam_sessions
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS lock_reason TEXT,
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP,
ADD COLUMN IF NOT EXISTS time_remaining INTEGER,
ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS result VARCHAR(20);

ALTER TABLE proctor_logs
ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
ADD COLUMN IF NOT EXISTS tab_title TEXT,
ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES exam_sessions(id);

ALTER TABLE exams
ADD COLUMN IF NOT EXISTS max_warnings INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS max_violations INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS auto_lock_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS allow_tab_switch BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS proctoring_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS grace_period_seconds INTEGER DEFAULT 30;

CREATE INDEX IF NOT EXISTS idx_exam_sessions_locked ON exam_sessions(is_locked);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_heartbeat ON exam_sessions(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_heartbeat_logs_session ON heartbeat_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_logs_timestamp ON heartbeat_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_proctor_logs_session ON proctor_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_proctor_logs_severity ON proctor_logs(severity);
CREATE INDEX IF NOT EXISTS idx_exam_access_requests_status ON exam_access_requests(status);

UPDATE exam_sessions SET
    is_locked = FALSE,
    warning_count = 0,
    violation_count = 0
WHERE is_locked IS NULL;

COMMENT ON COLUMN exam_sessions.is_locked IS 'Whether the student is locked out of this exam due to violations';
COMMENT ON COLUMN exam_sessions.lock_reason IS 'Reason for locking (auto-locked, admin-locked, too many violations, etc.)';
COMMENT ON COLUMN exam_sessions.last_heartbeat IS 'Last time we received a heartbeat from the student client';
COMMENT ON COLUMN exam_sessions.time_remaining IS 'Seconds remaining on timer when session was paused (for recovery)';
COMMENT ON COLUMN exams.grace_period_seconds IS 'Time in seconds to wait before marking disconnection as violation';
