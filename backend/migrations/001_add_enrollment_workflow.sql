-- Migration: Add Admin-Verification Workflow
-- Date: 2025-01-XX
-- Description: Adds enrollment_status, profile_photo_url to users table and status to exam_sessions

-- 1. Add enrollment_status enum type
DO $$ BEGIN
    CREATE TYPE enrollment_status_type AS ENUM ('NOT_ENROLLED', 'PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS enrollment_status enrollment_status_type DEFAULT 'NOT_ENROLLED',
ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- 3. Update existing users: if they have face_descriptor, set to APPROVED (for existing data)
UPDATE users 
SET enrollment_status = 'APPROVED' 
WHERE face_descriptor IS NOT NULL AND enrollment_status = 'NOT_ENROLLED';

-- 4. Create exam_sessions table if it doesn't exist (for tracking exam attempts)
CREATE TABLE IF NOT EXISTS exam_sessions (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'TERMINATED')),
    started_at TIMESTAMP DEFAULT NOW(),
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(exam_id, student_id) -- One session per student per exam
);

-- 5. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_exam_sessions_student ON exam_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_exam ON exam_sessions(exam_id);
CREATE INDEX IF NOT EXISTS idx_users_enrollment_status ON users(enrollment_status);

-- 6. Migrate existing attempts to exam_sessions (if attempts table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attempts') THEN
        INSERT INTO exam_sessions (exam_id, student_id, status, started_at, submitted_at)
        SELECT exam_id, student_id, 'SUBMITTED', COALESCE(started_at, NOW()), COALESCE(submitted_at, NOW())
        FROM attempts
        ON CONFLICT (exam_id, student_id) DO NOTHING;
    END IF;
END $$;
