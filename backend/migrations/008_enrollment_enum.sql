-- 008_enrollment_enum.sql
-- Extend the enrollment_status_type enum with the LMS workflow states.
-- No-op on fresh installs (enum already contains all values from 001).

ALTER TYPE enrollment_status_type ADD VALUE IF NOT EXISTS 'pending_admin';
ALTER TYPE enrollment_status_type ADD VALUE IF NOT EXISTS 'pending_face';
ALTER TYPE enrollment_status_type ADD VALUE IF NOT EXISTS 'pending_instructor';
ALTER TYPE enrollment_status_type ADD VALUE IF NOT EXISTS 'enrolled';
