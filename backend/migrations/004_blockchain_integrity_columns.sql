-- 004_blockchain_integrity_columns.sql
-- Blockchain hash columns on exams and users.
-- No-op on fresh installs (columns already exist from 001_initial_schema).

ALTER TABLE exams ADD COLUMN IF NOT EXISTS blockchain_hash VARCHAR(255);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS blockchain_tx VARCHAR(255);

ALTER TABLE users ADD COLUMN IF NOT EXISTS face_verification_hash VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_exams_blockchain_hash ON exams(blockchain_hash);
CREATE INDEX IF NOT EXISTS idx_users_face_verification_hash ON users(face_verification_hash);
