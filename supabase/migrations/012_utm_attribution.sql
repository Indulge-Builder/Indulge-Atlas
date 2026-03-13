-- =============================================================================
-- INDULGE ATLAS — UTM Attribution & Ad Metrics Upgrade
-- =============================================================================
--
-- Adds full UTM tracking to leads and a CPC column to campaign_metrics,
-- enabling the Closed-Loop Attribution System:
--
--   leads.utm_campaign ──FK-by-value──> campaign_metrics.campaign_id
--
-- Safe to run on any database already using 011_indulge_atlas_fresh_schema.sql.
-- Idempotent: uses IF NOT EXISTS / IF NOT EXISTS guards throughout.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LEADS — Add UTM attribution columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS utm_source   text,   -- e.g. 'meta', 'google', 'organic'
  ADD COLUMN IF NOT EXISTS utm_medium   text,   -- e.g. 'cpc', 'social', 'email'
  ADD COLUMN IF NOT EXISTS utm_campaign text;   -- JOIN key → campaign_metrics.campaign_id

-- Partial index — most queries filter on a specific campaign; NULL rows can be skipped.
CREATE INDEX IF NOT EXISTS leads_utm_campaign_idx
  ON public.leads(utm_campaign)
  WHERE utm_campaign IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CAMPAIGN_METRICS — Add CPC (Cost Per Click)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.campaign_metrics
  ADD COLUMN IF NOT EXISTS cpc numeric(10, 4) NOT NULL DEFAULT 0;

-- Composite index to speed up the attribution join
CREATE INDEX IF NOT EXISTS campaign_metrics_campaign_id_idx
  ON public.campaign_metrics(campaign_id);
