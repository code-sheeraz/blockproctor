-- 007_seed_data.sql
-- Reference data for a fresh installation. Idempotent (upserts).
-- Seed accounts use the legacy plaintext `password` column; migrate.js
-- backfills password_hash (bcrypt) and clears the plaintext value afterwards.

INSERT INTO departments (name, code) VALUES
    ('Information Technology', 'IT'),
    ('Computer Science', 'CS')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO batches (name, year, semester, is_active) VALUES
    ('First Year', 1, 'First', true),
    ('Second Year', 2, 'Second', true),
    ('Third Year', 3, 'Third', true),
    ('Fourth Year', 4, 'Fourth', true)
ON CONFLICT (year, semester) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active;

INSERT INTO admins (name, email, password, is_super_admin, is_active) VALUES
    ('Super Admin', 'admin@blockproctor.com', 'admin123', true, true)
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password;

INSERT INTO instructors (name, email, password, department_id, employee_id, is_active) VALUES
    ('Dr. John Smith', 'instructor@cs.edu', 'instructor123',
     (SELECT id FROM departments WHERE code = 'CS'), 'EMP001', true)
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password;
