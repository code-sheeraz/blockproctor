-- 010_password_hash_columns.sql
-- bcrypt hash columns for all login roles.
-- No-op on fresh installs (columns already exist from 001_initial_schema).

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
