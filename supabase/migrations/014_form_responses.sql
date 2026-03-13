-- =============================================================================
-- INDULGE ATLAS — Lead Form Responses (JSONB)
-- =============================================================================
-- Adds a form_responses JSONB column to store raw key-value pairs captured
-- from Meta Lead Ads forms, website intake questionnaires, or WhatsApp chatbot
-- flows. Stored as-is so the UI can render them dynamically without schema
-- changes when lead forms evolve.
-- =============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS form_responses jsonb DEFAULT NULL;

-- Also add an explicit source field to distinguish the acquisition channel
-- (website | whatsapp | meta_lead_form | facebook | instagram | …)
-- distinct from the UTM tracking parameters.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS channel text DEFAULT NULL;

COMMENT ON COLUMN public.leads.form_responses IS
  'Raw JSONB from the lead capture form (Meta Lead Ad, website, WA chatbot, etc.)';
COMMENT ON COLUMN public.leads.channel IS
  'Acquisition channel: website | whatsapp | meta_lead_form | facebook | instagram';
