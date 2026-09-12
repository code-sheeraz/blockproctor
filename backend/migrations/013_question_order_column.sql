-- 013_question_order_column.sql
-- Store the presented question order separately from the exam result.
-- No-op on fresh installs (question_order already exists from 001_initial_schema).

ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS question_order JSONB;

UPDATE exam_sessions
SET question_order = result
WHERE jsonb_typeof(result) = 'object';

UPDATE exam_sessions
SET result = NULL
WHERE jsonb_typeof(result) = 'object';
