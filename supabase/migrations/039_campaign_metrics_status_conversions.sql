-- =============================================================================
-- INDULGE ATLAS — Campaign Metrics: status + conversions for On-Demand Sync
-- =============================================================================
--
-- Adds columns required for the Performance Marketing Command Center sync:
--   status      — Campaign lifecycle: active, paused (from Meta/Google APIs)
--   conversions — Lead form submissions / conversions (from ad platform APIs)
--
-- Maps to Meta Ads "campaign_status" and Google Ads "conversions" metrics.
--
-- RLS: Consistent with 031_enable_rls_comprehensive — authenticated SELECT,
--      scout/admin INSERT/UPDATE (sync), admin DELETE.
--
-- =============================================================================

-- status: active | paused — from Meta/Google campaign status
ALTER TABLE public.campaign_metrics
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

COMMENT ON COLUMN public.campaign_metrics.status IS 'Campaign status from ad platform: active, paused';

-- conversions: form submissions / lead gen events from ad platform
ALTER TABLE public.campaign_metrics
  ADD COLUMN IF NOT EXISTS conversions bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.campaign_metrics.conversions IS 'Lead form submissions / conversions from Meta/Google Ads API';


-- ── RLS Policies for campaign_metrics ─────────────────────────────────────────
-- Public/Shared table (dropdown-style data). Scouts trigger sync; admins manage.
-- Idempotent: drops existing policies before create.

DROP POLICY IF EXISTS "campaign_metrics_select" ON public.campaign_metrics;
DROP POLICY IF EXISTS "campaign_metrics_write" ON public.campaign_metrics;
DROP POLICY IF EXISTS "campaign_metrics_insert" ON public.campaign_metrics;
DROP POLICY IF EXISTS "campaign_metrics_update" ON public.campaign_metrics;
DROP POLICY IF EXISTS "campaign_metrics_delete" ON public.campaign_metrics;

-- SELECT: Any authenticated user (agents, scouts, admins, finance)
CREATE POLICY "campaign_metrics_select" ON public.campaign_metrics
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT: Scout or Admin (sync API uses service role; this covers direct client writes)
CREATE POLICY "campaign_metrics_insert" ON public.campaign_metrics
  FOR INSERT WITH CHECK (public.get_role_from_jwt() IN ('scout', 'admin'));

-- UPDATE: Scout or Admin (sync overwrites metrics)
CREATE POLICY "campaign_metrics_update" ON public.campaign_metrics
  FOR UPDATE USING (public.get_role_from_jwt() IN ('scout', 'admin'))
  WITH CHECK (public.get_role_from_jwt() IN ('scout', 'admin'));

-- DELETE: Admin only (destructive; scouts cannot remove campaigns)
CREATE POLICY "campaign_metrics_delete" ON public.campaign_metrics
  FOR DELETE USING (public.get_role_from_jwt() = 'admin');
