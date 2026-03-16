-- =============================================================================
-- INDULGE ATLAS — Drop custom_responses (consolidate into form_data)
-- =============================================================================
--
-- We use form_data as the single JSONB vault for all dynamic fields. Dropping
-- custom_responses to avoid redundancy.
--
-- Quick snippet (run in Supabase SQL Editor if needed):
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS custom_responses;
--
-- =============================================================================

ALTER TABLE public.leads DROP COLUMN IF EXISTS custom_responses;
