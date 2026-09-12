-- 001_initial_schema.sql
-- Base schema for BlockProctor (PostgreSQL 15).
-- This file is the authoritative schema snapshot; the later migrations are
-- idempotent deltas and no-ops on a fresh install.

DO $$ BEGIN
    CREATE TYPE enrollment_status_type AS ENUM (
    'NOT_ENROLLED',
    'PENDING',
    'APPROVED',
    'REJECTED',
    'pending_admin',
    'pending_face',
    'pending_instructor',
    'enrolled'
);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS admins (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255),
    is_super_admin boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    last_login timestamp without time zone,
    password_hash character varying(255)
);

CREATE TABLE IF NOT EXISTS ai_events (
    id integer NOT NULL,
    attempt_id integer,
    event_type character varying(100),
    confidence numeric,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attempts (
    id integer NOT NULL,
    exam_id integer,
    student_id integer,
    answers_json jsonb NOT NULL,
    score numeric DEFAULT 0,
    correct_count integer DEFAULT 0,
    started_at timestamp with time zone DEFAULT now(),
    submitted_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    total_questions integer,
    blockchain_hash text,
    blockchain_tx text,
    session_id integer
);

CREATE TABLE IF NOT EXISTS batches (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    year integer NOT NULL,
    semester character varying(20),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_enrollments (
    id integer NOT NULL,
    class_id integer,
    student_id integer,
    enrolled_at timestamp without time zone DEFAULT now(),
    enrolled_by integer,
    status character varying(20) DEFAULT 'active'::character varying
);

CREATE TABLE IF NOT EXISTS classes (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(20) NOT NULL,
    description text,
    instructor_id integer,
    department_id integer,
    batch_id integer,
    max_students integer DEFAULT 50,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(10) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_access_requests (
    id integer NOT NULL,
    session_id integer,
    student_id integer,
    exam_id integer,
    request_type character varying(50) NOT NULL,
    reason text,
    evidence_data jsonb,
    status character varying(20) DEFAULT 'pending'::character varying,
    admin_notes text,
    reviewed_by integer,
    reviewed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT exam_access_requests_request_type_check CHECK (((request_type)::text = ANY ((ARRAY['technical_issue'::character varying, 'network_failure'::character varying, 'system_crash'::character varying, 'browser_crash'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT exam_access_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'denied'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS exam_sessions (
    id integer NOT NULL,
    exam_id integer NOT NULL,
    student_id integer NOT NULL,
    started_at timestamp without time zone DEFAULT now(),
    finished_at timestamp without time zone,
    status text DEFAULT 'in_progress'::text,
    result jsonb,
    is_locked boolean DEFAULT false,
    lock_reason text,
    locked_at timestamp without time zone,
    warning_count integer DEFAULT 0,
    violation_count integer DEFAULT 0,
    last_heartbeat timestamp without time zone,
    time_remaining integer,
    ended_at timestamp without time zone,
    attempt_id integer,
    session_start timestamp without time zone,
    session_end timestamp without time zone,
    initial_trust_score integer DEFAULT 100,
    final_trust_score integer,
    total_violations integer DEFAULT 0,
    blockchain_tx_hash character varying(66),
    verification_status character varying(20),
    metadata jsonb,
    submitted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    question_order jsonb
);

CREATE TABLE IF NOT EXISTS exams (
    id integer NOT NULL,
    title text NOT NULL,
    description text,
    instructor_id integer NOT NULL,
    duration_minutes integer DEFAULT 60,
    questions_json jsonb,
    created_at timestamp without time zone DEFAULT now(),
    starts_at timestamp without time zone,
    ends_at timestamp without time zone,
    class_id integer,
    is_published boolean DEFAULT false,
    start_time timestamp without time zone,
    end_time timestamp without time zone,
    max_warnings integer DEFAULT 3,
    max_violations integer DEFAULT 5,
    auto_lock_enabled boolean DEFAULT true,
    allow_tab_switch boolean DEFAULT false,
    proctoring_enabled boolean DEFAULT true,
    grace_period_seconds integer DEFAULT 30,
    randomize_questions boolean DEFAULT false,
    blockchain_hash character varying(255),
    blockchain_tx character varying(255)
);

CREATE TABLE IF NOT EXISTS heartbeat_logs (
    id integer NOT NULL,
    session_id integer,
    student_id integer,
    exam_id integer,
    "timestamp" timestamp without time zone DEFAULT now(),
    status character varying(20) DEFAULT 'active'::character varying,
    ip_address character varying(45),
    user_agent text,
    CONSTRAINT heartbeat_logs_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'reconnected'::character varying, 'timeout'::character varying, 'disconnected'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS instructors (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255),
    department_id integer,
    employee_id character varying(50),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    last_login timestamp without time zone,
    password_hash character varying(255)
);

CREATE TABLE IF NOT EXISTS proctor_logs (
    id integer NOT NULL,
    exam_id integer,
    student_id integer,
    events_json jsonb,
    created_at timestamp with time zone DEFAULT now(),
    violation_type character varying(50),
    description text,
    trust_score integer DEFAULT 100,
    metadata jsonb DEFAULT '{}'::jsonb,
    attempt_id integer,
    severity character varying(20) DEFAULT 'warning'::character varying,
    tab_title text,
    session_id integer,
    confidence_score numeric DEFAULT 0,
    face_count integer DEFAULT 1,
    CONSTRAINT proctor_logs_severity_check CHECK (((severity)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'critical'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS users (
    id integer NOT NULL,
    email character varying(100),
    password character varying(100),
    full_name character varying(100),
    role character varying(20) DEFAULT 'student'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    face_descriptor jsonb,
    profile_photo text,
    enrollment_status enrollment_status_type DEFAULT 'NOT_ENROLLED'::enrollment_status_type,
    profile_photo_url text,
    updated_at timestamp without time zone DEFAULT now(),
    department_id integer,
    batch_id integer,
    student_id character varying(50),
    face_verification_photo text,
    face_verification_hash character varying(255),
    password_hash character varying(255),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['student'::character varying, 'instructor'::character varying, 'admin'::character varying])::text[])))
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admins' AND column_name = 'id' AND column_default IS NOT NULL) THEN
        ALTER TABLE admins ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_events' AND column_name = 'id' AND column_default IS NOT NULL) THEN
        ALTER TABLE ai_events ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attempts' AND column_name = 'id' AND column_default IS NOT NULL) THEN
        ALTER TABLE attempts ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batches' AND column_name = 'id' AND column_default IS NOT NULL) THEN
        ALTER TABLE batches ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'class_enrollments' AND column_name = 'id' AND column_default IS NOT NULL) THEN
        ALTER TABLE class_enrollments ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classes' AND column_name = 'id' AND column_default IS NOT NULL) THEN
        ALTER TABLE classes ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'departments' AND column_name = 'id' AND column_default IS NOT NULL) THEN
        ALTER TABLE departments ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exam_access_requests' AND column_name = 'id' AND column_default IS NOT NULL) THEN
        ALTER TABLE exam_access_requests ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exam_sessions' AND column_name = 'id' AND column_default IS NOT NULL) THEN
        ALTER TABLE exam_sessions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exams' AND column_name = 'id' AND column_default IS NOT NULL) THEN
        ALTER TABLE exams ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'heartbeat_logs' AND column_name = 'id' AND column_default IS NOT NULL) THEN
        ALTER TABLE heartbeat_logs ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instructors' AND column_name = 'id' AND column_default IS NOT NULL) THEN
        ALTER TABLE instructors ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proctor_logs' AND column_name = 'id' AND column_default IS NOT NULL) THEN
        ALTER TABLE proctor_logs ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'id' AND column_default IS NOT NULL) THEN
        ALTER TABLE users ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admins_email_key') THEN
        ALTER TABLE admins ADD CONSTRAINT admins_email_key UNIQUE (email);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admins_pkey') THEN
        ALTER TABLE admins ADD CONSTRAINT admins_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_events_pkey') THEN
        ALTER TABLE ai_events ADD CONSTRAINT ai_events_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attempts_exam_id_student_id_key') THEN
        ALTER TABLE attempts ADD CONSTRAINT attempts_exam_id_student_id_key UNIQUE (exam_id, student_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attempts_pkey') THEN
        ALTER TABLE attempts ADD CONSTRAINT attempts_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_pkey') THEN
        ALTER TABLE batches ADD CONSTRAINT batches_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_year_semester_key') THEN
        ALTER TABLE batches ADD CONSTRAINT batches_year_semester_key UNIQUE (year, semester);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_enrollments_class_id_student_id_key') THEN
        ALTER TABLE class_enrollments ADD CONSTRAINT class_enrollments_class_id_student_id_key UNIQUE (class_id, student_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_enrollments_pkey') THEN
        ALTER TABLE class_enrollments ADD CONSTRAINT class_enrollments_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_code_batch_id_key') THEN
        ALTER TABLE classes ADD CONSTRAINT classes_code_batch_id_key UNIQUE (code, batch_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_pkey') THEN
        ALTER TABLE classes ADD CONSTRAINT classes_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_code_key') THEN
        ALTER TABLE departments ADD CONSTRAINT departments_code_key UNIQUE (code);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_name_key') THEN
        ALTER TABLE departments ADD CONSTRAINT departments_name_key UNIQUE (name);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_pkey') THEN
        ALTER TABLE departments ADD CONSTRAINT departments_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_access_requests_pkey') THEN
        ALTER TABLE exam_access_requests ADD CONSTRAINT exam_access_requests_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_sessions_pkey') THEN
        ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exams_pkey') THEN
        ALTER TABLE exams ADD CONSTRAINT exams_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heartbeat_logs_pkey') THEN
        ALTER TABLE heartbeat_logs ADD CONSTRAINT heartbeat_logs_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructors_email_key') THEN
        ALTER TABLE instructors ADD CONSTRAINT instructors_email_key UNIQUE (email);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructors_pkey') THEN
        ALTER TABLE instructors ADD CONSTRAINT instructors_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proctor_logs_pkey') THEN
        ALTER TABLE proctor_logs ADD CONSTRAINT proctor_logs_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_exam_session') THEN
        ALTER TABLE exam_sessions ADD CONSTRAINT unique_exam_session UNIQUE (exam_id, student_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key') THEN
        ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_pkey') THEN
        ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_events_attempt_id_fkey') THEN
        ALTER TABLE ai_events ADD CONSTRAINT ai_events_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attempts_exam_id_fkey') THEN
        ALTER TABLE attempts ADD CONSTRAINT attempts_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attempts_session_id_fkey') THEN
        ALTER TABLE attempts ADD CONSTRAINT attempts_session_id_fkey FOREIGN KEY (session_id) REFERENCES exam_sessions(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attempts_student_id_fkey') THEN
        ALTER TABLE attempts ADD CONSTRAINT attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_enrollments_class_id_fkey') THEN
        ALTER TABLE class_enrollments ADD CONSTRAINT class_enrollments_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_enrollments_enrolled_by_fkey') THEN
        ALTER TABLE class_enrollments ADD CONSTRAINT class_enrollments_enrolled_by_fkey FOREIGN KEY (enrolled_by) REFERENCES instructors(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_enrollments_student_id_fkey') THEN
        ALTER TABLE class_enrollments ADD CONSTRAINT class_enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_batch_id_fkey') THEN
        ALTER TABLE classes ADD CONSTRAINT classes_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES batches(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_department_id_fkey') THEN
        ALTER TABLE classes ADD CONSTRAINT classes_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_instructor_id_fkey') THEN
        ALTER TABLE classes ADD CONSTRAINT classes_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES instructors(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_access_requests_exam_id_fkey') THEN
        ALTER TABLE exam_access_requests ADD CONSTRAINT exam_access_requests_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES exams(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_access_requests_reviewed_by_fkey') THEN
        ALTER TABLE exam_access_requests ADD CONSTRAINT exam_access_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_access_requests_session_id_fkey') THEN
        ALTER TABLE exam_access_requests ADD CONSTRAINT exam_access_requests_session_id_fkey FOREIGN KEY (session_id) REFERENCES exam_sessions(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_access_requests_student_id_fkey') THEN
        ALTER TABLE exam_access_requests ADD CONSTRAINT exam_access_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_sessions_attempt_id_fkey') THEN
        ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES attempts(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_sessions_exam_id_fkey') THEN
        ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exams_class_id_fkey') THEN
        ALTER TABLE exams ADD CONSTRAINT exams_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heartbeat_logs_exam_id_fkey') THEN
        ALTER TABLE heartbeat_logs ADD CONSTRAINT heartbeat_logs_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES exams(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heartbeat_logs_session_id_fkey') THEN
        ALTER TABLE heartbeat_logs ADD CONSTRAINT heartbeat_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heartbeat_logs_student_id_fkey') THEN
        ALTER TABLE heartbeat_logs ADD CONSTRAINT heartbeat_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructors_department_id_fkey') THEN
        ALTER TABLE instructors ADD CONSTRAINT instructors_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proctor_logs_attempt_id_fkey') THEN
        ALTER TABLE proctor_logs ADD CONSTRAINT proctor_logs_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES attempts(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proctor_logs_exam_id_fkey') THEN
        ALTER TABLE proctor_logs ADD CONSTRAINT proctor_logs_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES exams(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proctor_logs_session_id_fkey') THEN
        ALTER TABLE proctor_logs ADD CONSTRAINT proctor_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES exam_sessions(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proctor_logs_student_id_fkey') THEN
        ALTER TABLE proctor_logs ADD CONSTRAINT proctor_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_batch_id_fkey') THEN
        ALTER TABLE users ADD CONSTRAINT users_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES batches(id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_department_id_fkey') THEN
        ALTER TABLE users ADD CONSTRAINT users_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id);
    END IF;
END $$;

-- PostgreSQL database dump complete
