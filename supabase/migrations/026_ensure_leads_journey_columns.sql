-- =============================================================================
-- INDULGE ATLAS — Ensure Leads Journey Columns
-- =============================================================================
--
-- Idempotent migration that ensures all columns required for the leads journey
-- exist on public.leads. Uses ADD COLUMN IF NOT EXISTS — safe to run multiple
-- times. Handles form_data/form_responses rename for DBs that never ran 025.
--
-- Columns ensured (aligned with lib/types/database.ts Lead interface):
--   Core: first_name, last_name, phone_number, secondary_phone, email, city, address
--   Attribution: utm_source, utm_medium, utm_campaign, campaign_id
--   Intake: message, form_data
--   Deal: deal_value, deal_duration
--   Pipeline: domain, status, assigned_to, assigned_at
--   Notes: notes, lost_reason_tag, lost_reason_notes, private_scratchpad
--   Persona: personal_details, company, hobbies
--   Timestamps: created_at, updated_at
--
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. form_data: handle rename from form_responses (025 logic, for DBs that skipped it)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'form_responses'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'form_data'
  )
  THEN
    ALTER TABLE public.leads RENAME COLUMN form_responses TO form_data;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add all journey columns if not present
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_name       text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_name        text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone_number     text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS secondary_phone  text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email            text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS city             text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS address          text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS campaign_id       text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS message          text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS form_data         jsonb;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_source       text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_medium       text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_campaign     text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deal_value       numeric(14, 2);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deal_duration    text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS domain           public.indulge_domain;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS status           public.lead_status;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_at      timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS notes            text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lost_reason_tag  text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lost_reason_notes text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS private_scratchpad text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS personal_details text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company          text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS hobbies          text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS created_at       timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS updated_at       timestamptz;

-- assigned_to: add with FK if missing (base schema usually has it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'assigned_to'
  )
  THEN
    ALTER TABLE public.leads
      ADD COLUMN assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Ensure key indexes exist (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS leads_assigned_to_idx       ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS leads_status_idx            ON public.leads(status);
CREATE INDEX IF NOT EXISTS leads_assigned_status_idx   ON public.leads(assigned_to, status) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_domain_idx            ON public.leads(domain);
CREATE INDEX IF NOT EXISTS leads_campaign_id_idx       ON public.leads(campaign_id);
CREATE INDEX IF NOT EXISTS leads_utm_campaign_idx      ON public.leads(utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_created_at_idx         ON public.leads(created_at DESC);

COMMENT ON COLUMN public.leads.form_data IS
  'Raw JSONB from Meta Lead Ad, Pabbly webhook passthrough, website form, WA chatbot.';
COMMENT ON COLUMN public.leads.message IS
  'Raw message text from WhatsApp, chatbot, or lead capture (e.g. first touchpoint).';
