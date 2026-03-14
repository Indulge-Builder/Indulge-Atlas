-- =============================================================================
-- INDULGE ATLAS — Drop Redundant Lead Columns
-- =============================================================================
--
-- Drops columns that are redundant or consolidated elsewhere:
--   message  — Website form message lives in form_data; messaging is in conversations
--   hobbies  — Consolidated into personal_details (birthday, hobbies, etc.)
--   source   — Already dropped in 025; attribution uses utm_source
--   channel  — Already dropped in 025; attribution uses utm_medium
--
-- Attribution hierarchy (campaign_id, utm_source, utm_medium, utm_campaign):
--   utm_source  — Top level: meta, google, referrals, events, website/organic
--   utm_medium  — Platform: instagram, facebook, whatsapp, youtube, search, etc.
--   utm_campaign — Ad campaign name
-- =============================================================================

ALTER TABLE public.leads
  DROP COLUMN IF EXISTS message,
  DROP COLUMN IF EXISTS hobbies;
