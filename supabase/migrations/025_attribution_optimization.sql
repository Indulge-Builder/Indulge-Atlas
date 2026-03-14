-- =============================================================================
-- INDULGE ATLAS — Attribution Schema Optimization
-- =============================================================================
--
-- Eliminates data duplication. We track attribution using ONLY:
--   utm_source, utm_medium, utm_campaign, campaign_id, message, form_data
--
-- Drops: channel, source
-- Renames: form_responses → form_data (preserves existing data)
-- Adds: message (if not exists)
-- =============================================================================

-- Add message column for raw intake message (e.g. WhatsApp, chatbot)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS message text;

-- Rename form_responses to form_data (preserves all existing JSONB data)
-- Only if form_responses exists and form_data does not yet exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'form_responses')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'form_data')
  THEN
    ALTER TABLE public.leads RENAME COLUMN form_responses TO form_data;
  END IF;
END $$;

-- Drop deprecated columns
ALTER TABLE public.leads
  DROP COLUMN IF EXISTS channel,
  DROP COLUMN IF EXISTS source;

-- Drop obsolete index on source
DROP INDEX IF EXISTS public.leads_source_idx;

COMMENT ON COLUMN public.leads.form_data IS
  'Raw JSONB from Meta Lead Ad, Pabbly webhook passthrough, website form, WA chatbot. All dynamic fields not in standard columns.';
COMMENT ON COLUMN public.leads.message IS
  'Raw message text from WhatsApp, chatbot, or lead capture (e.g. first touchpoint).';
