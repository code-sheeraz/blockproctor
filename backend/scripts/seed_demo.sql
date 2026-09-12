-- seed_demo.sql - Optional demo data for a fresh database.
--
-- Creates one demo student, one class, one exam, and a class enrollment
-- so the app is not empty after a reset. Run via seed_demo.bat or:
--   docker exec -i blockproctor-db psql -U postgres -d blockproctor < seed_demo.sql
--
-- Demo student login:  demo.student@blockproctor.com / student123

BEGIN;

-- Demo student (enrolled, ready to take exams)
INSERT INTO users (full_name, email, password_hash, student_id, role, enrollment_status, department_id, batch_id)
SELECT 'Demo Student', 'demo.student@blockproctor.com',
    '$2b$10$RaxdRoGrgxskwyQCt1zdke35mO8wt98Se0XeyXhfEyHfSjBZmC3su',
    'DEMO0001', 'student', 'enrolled', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'demo.student@blockproctor.com');

-- Demo class taught by the seeded instructor (id 1)
INSERT INTO classes (name, code, description, instructor_id, department_id, batch_id)
SELECT 'Demo Class - Intro to Databases', 'DB101',
    'Demo class for testing the full exam workflow.', 1, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM classes WHERE code = 'DB101');

-- Enroll the demo student into the demo class
INSERT INTO class_enrollments (class_id, student_id, enrolled_by)
SELECT c.id, u.id, 1
FROM classes c, users u
WHERE c.code = 'DB101'
  AND u.email = 'demo.student@blockproctor.com'
  AND NOT EXISTS (
      SELECT 1 FROM class_enrollments ce
      JOIN classes c2 ON c2.id = ce.class_id
      JOIN users u2 ON u2.id = ce.student_id
      WHERE c2.code = 'DB101' AND u2.email = 'demo.student@blockproctor.com'
  );

-- Demo exam with sample questions
INSERT INTO exams (title, description, class_id, instructor_id, duration_minutes, starts_at, ends_at, is_published, questions_json, randomize_questions)
SELECT 'Demo Midterm - DB101',
    'Demo exam for testing the proctored workflow.',
    c.id, 1, 30,
    NOW() - INTERVAL '1 hour',
    NOW() + INTERVAL '7 days',
    true,
    '[
        {"id": 1, "question": "What does SQL stand for?", "options": ["Structured Query Language", "Simple Query Language", "Standard Query List", "None of the above"], "answer": 0},
        {"id": 2, "question": "Which SQL clause filters rows?", "options": ["ORDER BY", "WHERE", "GROUP BY", "SELECT"], "answer": 1},
        {"id": 3, "question": "A primary key must be:", "options": ["Nullable", "Unique", "A string", "Optional"], "answer": 1}
    ]'::jsonb,
    true
FROM classes c
WHERE c.code = 'DB101'
  AND NOT EXISTS (SELECT 1 FROM exams WHERE title = 'Demo Midterm - DB101');

COMMIT;

\echo Demo data inserted. Login with demo.student@blockproctor.com / student123