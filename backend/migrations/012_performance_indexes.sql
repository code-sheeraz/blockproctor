-- 012_performance_indexes.sql
-- Performance indexes for the concurrent student workload.

CREATE INDEX IF NOT EXISTS idx_attempts_student_exam ON attempts(student_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_proctor_logs_session_time ON proctor_logs(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_heartbeat_logs_session_time ON heartbeat_logs(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_student_exam ON exam_sessions(student_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_status ON exam_sessions(status);
CREATE INDEX IF NOT EXISTS idx_users_enrollment_status ON users(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_proctor_logs_student_exam ON proctor_logs(student_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_locked ON exam_sessions(is_locked) WHERE is_locked = true;
