-- 009_face_verification_photo.sql
-- Rename the stored profile photo to face_verification_photo for privacy.
-- The captured face photo is used for identity verification only.
-- No-op on fresh installs.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'face_verification_photo') THEN
        ALTER TABLE users ADD COLUMN face_verification_photo TEXT;
    END IF;
END $$;

UPDATE users
SET face_verification_photo = profile_photo
WHERE profile_photo IS NOT NULL AND face_verification_photo IS NULL;

UPDATE users SET profile_photo = NULL WHERE profile_photo IS NOT NULL;

COMMENT ON COLUMN users.face_verification_photo IS 'Private face photo for identity verification - used by admin approval and proctoring system only';
