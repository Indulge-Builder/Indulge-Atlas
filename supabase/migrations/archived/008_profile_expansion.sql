-- Expand the profiles table to hold personal contact details.
-- IF NOT EXISTS guards make this safe to re-run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS dob   date;

COMMENT ON COLUMN profiles.phone IS 'Primary contact phone number (international format preferred)';
COMMENT ON COLUMN profiles.dob   IS 'Date of birth — used for personalised dashboard greetings and CRM context';
