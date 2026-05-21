-- Migration 091: Add elia_profile JSONB column and analysis metadata to client_profiles.
-- Stores the structured intelligence profile derived from WhatsApp chat history by Elia AI.

ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS elia_profile    jsonb     NULL,
  ADD COLUMN IF NOT EXISTS elia_version    integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elia_analyzed_at   timestamptz NULL,
  ADD COLUMN IF NOT EXISTS elia_messages_through text NULL;

COMMENT ON COLUMN public.client_profiles.elia_profile IS
  'Structured intelligence profile derived from WhatsApp chat analysis by Elia AI. JSONB matching the EliaProfile TypeScript type.';

COMMENT ON COLUMN public.client_profiles.elia_version IS
  'Monotonically increasing version counter incremented on every analysis run.';

COMMENT ON COLUMN public.client_profiles.elia_analyzed_at IS
  'Timestamp of the most recent successful Elia WhatsApp analysis run.';

COMMENT ON COLUMN public.client_profiles.elia_messages_through IS
  'ISO timestamp of the most recent message included in the last analysis batch. Used as sinceTimestamp on subsequent runs to avoid re-processing.';

CREATE INDEX IF NOT EXISTS idx_client_profiles_elia_analyzed_at
  ON public.client_profiles (elia_analyzed_at)
  WHERE elia_analyzed_at IS NOT NULL;
