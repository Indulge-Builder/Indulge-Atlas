-- =============================================================================
-- INDULGE ATLAS — Leads Marketing Attribution (Pabbly / Facebook Lead Ads)
-- =============================================================================
--
-- Adds columns to support marketing attribution and dynamic ad questions from
-- Pabbly Connect → Facebook Lead Ads integration.
--
-- Columns:
--   campaign_name — Meta campaign display name
--   ad_name       — Meta ad set / ad name
--   platform      — Acquisition platform (meta, facebook, instagram, etc.)
--
-- Dynamic ad questions go into the existing form_data JSONB column.
--
-- =============================================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS campaign_name text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ad_name       text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS platform      text;

COMMENT ON COLUMN public.leads.campaign_name IS 'Meta campaign display name from Lead Ad';
COMMENT ON COLUMN public.leads.ad_name       IS 'Meta ad set / ad name from Lead Ad';
COMMENT ON COLUMN public.leads.platform      IS 'Acquisition platform: meta, facebook, instagram, etc.';
