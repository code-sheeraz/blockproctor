-- 014_remove_plaintext_password.sql
-- Stop relying on plaintext passwords:
-- 1. Drop NOT NULL so the plaintext values can be cleared
-- 2. migrate.js backfills password_hash (bcrypt) from any remaining
--    plaintext `password` values and clears them automatically
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
ALTER TABLE instructors ALTER COLUMN password DROP NOT NULL;
ALTER TABLE admins ALTER COLUMN password DROP NOT NULL;
