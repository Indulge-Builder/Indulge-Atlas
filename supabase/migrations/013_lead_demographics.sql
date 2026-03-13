-- =============================================================================
-- INDULGE ATLAS — Lead Demographics Expansion
-- =============================================================================
-- Adds address and secondary_phone to the leads table for the Client
-- Demographics section of the Lead Dossier page.
-- Safe to run on any database using 011 + 012 migrations.
-- =============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS address          text,
  ADD COLUMN IF NOT EXISTS secondary_phone  text;
