-- =============================================================================
-- INDULGE ATLAS — Executive Dossier Upgrade (Phase 5)
-- =============================================================================
-- Adds two new lead profile fields for the Executive Dossier section:
--   company  — the prospect's company or organisation
--   hobbies  — lifestyle, hobbies, and interests (rich text)
--
-- Safe to run on any database using migrations 011–015.
-- =============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS hobbies text;
