-- 005_lms_schema.sql
-- LMS workflow columns on users and exams.
-- Tables (departments, batches, admins, instructors, classes, class_enrollments)
-- are created by 001_initial_schema.sql; this file only keeps the ALTERs as a
-- historical delta. No-op on fresh installs.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'department_id') THEN
        ALTER TABLE users ADD COLUMN department_id INTEGER REFERENCES departments(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'batch_id') THEN
        ALTER TABLE users ADD COLUMN batch_id INTEGER REFERENCES batches(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'student';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'enrollment_status') THEN
        ALTER TABLE users ADD COLUMN enrollment_status VARCHAR(30) DEFAULT 'pending_admin';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'student_id') THEN
        ALTER TABLE users ADD COLUMN student_id VARCHAR(50);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'profile_photo') THEN
        ALTER TABLE users ADD COLUMN profile_photo TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'updated_at') THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'exams' AND column_name = 'class_id') THEN
        ALTER TABLE exams ADD COLUMN class_id INTEGER REFERENCES classes(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'exams' AND column_name = 'instructor_id') THEN
        ALTER TABLE exams ADD COLUMN instructor_id INTEGER REFERENCES instructors(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'exams' AND column_name = 'is_published') THEN
        ALTER TABLE exams ADD COLUMN is_published BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'exams' AND column_name = 'start_time') THEN
        ALTER TABLE exams ADD COLUMN start_time TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'exams' AND column_name = 'end_time') THEN
        ALTER TABLE exams ADD COLUMN end_time TIMESTAMP;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_batch ON users(batch_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_instructors_department ON instructors(department_id);
CREATE INDEX IF NOT EXISTS idx_classes_instructor ON classes(instructor_id);
CREATE INDEX IF NOT EXISTS idx_classes_department ON classes(department_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_class ON class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_student ON class_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_exams_class ON exams(class_id);
CREATE INDEX IF NOT EXISTS idx_exams_instructor ON exams(instructor_id);

COMMENT ON COLUMN users.enrollment_status IS 'Status flow: pending_admin -> pending_face -> pending_instructor -> enrolled';
