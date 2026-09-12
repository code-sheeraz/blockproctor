-- 003_audit_tables.sql
-- Audit tables that preserve a copy of records before soft deletion, so that
-- deleted data can still be verified against the blockchain.

CREATE TABLE IF NOT EXISTS audit_classes (
    audit_id SERIAL PRIMARY KEY,
    original_id INTEGER NOT NULL,
    name VARCHAR(255),
    code VARCHAR(50),
    description TEXT,
    instructor_id INTEGER,
    instructor_name VARCHAR(255),
    department_id INTEGER,
    department_name VARCHAR(255),
    student_count INTEGER DEFAULT 0,
    is_active BOOLEAN,
    created_at TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NOW(),
    deleted_by INTEGER,
    deleted_by_name VARCHAR(255),
    deletion_reason TEXT
);

CREATE TABLE IF NOT EXISTS audit_exams (
    audit_id SERIAL PRIMARY KEY,
    original_id INTEGER NOT NULL,
    title VARCHAR(255),
    description TEXT,
    class_id INTEGER,
    class_name VARCHAR(255),
    instructor_id INTEGER,
    instructor_name VARCHAR(255),
    duration_minutes INTEGER,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    is_active BOOLEAN,
    questions JSONB,
    total_attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NOW(),
    deleted_by INTEGER,
    deleted_by_name VARCHAR(255),
    deletion_reason TEXT
);

CREATE TABLE IF NOT EXISTS audit_attempts (
    audit_id SERIAL PRIMARY KEY,
    original_id INTEGER NOT NULL,
    exam_id INTEGER,
    exam_title VARCHAR(255),
    student_id INTEGER,
    student_name VARCHAR(255),
    student_identifier VARCHAR(100),
    score DECIMAL(5,2),
    total_questions INTEGER,
    correct_answers INTEGER,
    answers JSONB,
    started_at TIMESTAMP,
    submitted_at TIMESTAMP,
    blockchain_hash VARCHAR(255),
    blockchain_tx VARCHAR(255),
    session_id INTEGER,
    created_at TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NOW(),
    deleted_by INTEGER,
    deleted_by_name VARCHAR(255),
    deletion_reason TEXT,
    related_exam_audit_id INTEGER
);

CREATE TABLE IF NOT EXISTS audit_proctor_logs (
    audit_id SERIAL PRIMARY KEY,
    original_id INTEGER NOT NULL,
    attempt_id INTEGER,
    exam_title VARCHAR(255),
    student_id INTEGER,
    student_name VARCHAR(255),
    event_type VARCHAR(100),
    event_data JSONB,
    confidence_score DECIMAL(5,4),
    face_count INTEGER,
    screenshot_url TEXT,
    timestamp TIMESTAMP,
    created_at TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NOW(),
    deleted_by INTEGER,
    deleted_by_name VARCHAR(255),
    deletion_reason TEXT,
    related_attempt_audit_id INTEGER
);

CREATE TABLE IF NOT EXISTS audit_exam_sessions (
    audit_id SERIAL PRIMARY KEY,
    original_id INTEGER NOT NULL,
    exam_id INTEGER,
    exam_title VARCHAR(255),
    student_id INTEGER,
    student_name VARCHAR(255),
    status VARCHAR(50),
    started_at TIMESTAMP,
    submitted_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NOW(),
    deleted_by INTEGER,
    deleted_by_name VARCHAR(255),
    deletion_reason TEXT,
    related_exam_audit_id INTEGER
);

CREATE TABLE IF NOT EXISTS audit_class_enrollments (
    audit_id SERIAL PRIMARY KEY,
    original_id INTEGER,
    class_id INTEGER,
    class_name VARCHAR(255),
    student_id INTEGER,
    student_name VARCHAR(255),
    student_identifier VARCHAR(100),
    status VARCHAR(50),
    enrolled_at TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NOW(),
    deleted_by INTEGER,
    deleted_by_name VARCHAR(255),
    deletion_reason TEXT,
    related_class_audit_id INTEGER
);

CREATE TABLE IF NOT EXISTS audit_heartbeat_logs (
    audit_id SERIAL PRIMARY KEY,
    original_id INTEGER NOT NULL,
    session_id INTEGER,
    exam_title VARCHAR(255),
    student_name VARCHAR(255),
    event_type VARCHAR(100),
    event_data JSONB,
    timestamp TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NOW(),
    deletion_reason TEXT
);

CREATE TABLE IF NOT EXISTS audit_deletion_log (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id INTEGER NOT NULL,
    deleted_by_id INTEGER,
    deleted_by_role VARCHAR(50),
    deleted_by_name VARCHAR(255),
    deletion_reason TEXT,
    metadata JSONB,
    deleted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_classes_original_id ON audit_classes(original_id);
CREATE INDEX IF NOT EXISTS idx_audit_classes_deleted_at ON audit_classes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_audit_exams_original_id ON audit_exams(original_id);
CREATE INDEX IF NOT EXISTS idx_audit_exams_deleted_at ON audit_exams(deleted_at);
CREATE INDEX IF NOT EXISTS idx_audit_attempts_original_id ON audit_attempts(original_id);
CREATE INDEX IF NOT EXISTS idx_audit_attempts_exam_id ON audit_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_audit_proctor_logs_attempt_id ON audit_proctor_logs(attempt_id);
CREATE INDEX IF NOT EXISTS idx_audit_deletion_log_table ON audit_deletion_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_deletion_log_deleted_at ON audit_deletion_log(deleted_at);
