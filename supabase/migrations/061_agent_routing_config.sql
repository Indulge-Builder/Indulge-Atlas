-- =============================================================================
-- INDULGE ATLAS — Agent Routing Config
-- =============================================================================
-- Moves hardcoded agent emails, shift windows, and daily lead caps out of
-- leadIngestion.ts source code and into a DB table that admins can edit
-- without a code deploy.
--
-- Replaces:
--   WATERFALL_AGENT_EMAILS[]  →  agent_routing_config.email
--   cachedAgentIds            →  agent_routing_config.user_id  (always-fresh)
--   hardcoded SAMSON_DAILY_CAP (15) →  agent_routing_config.daily_cap
--   hardcoded shift logic     →  agent_routing_config.shift_start / shift_end
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.agent_routing_config (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  email       text        NOT NULL UNIQUE,
  domain      text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  -- NULL = no cap; if set, agent won't receive more leads than this per IST day
  daily_cap   integer     NULL CHECK (daily_cap IS NULL OR daily_cap > 0),
  -- lower number = higher priority in the waterfall; 10 / 20 / 30 / 40 for existing agents
  priority    integer     NOT NULL DEFAULT 100,
  -- IST shift window (TIME stored as-is; interpreted in Asia/Kolkata by the app).
  -- Both NULL = always available (eligible day + night).
  -- Both NOT NULL = eligible only when current IST hour is within [shift_start, shift_end].
  shift_start time        NULL,
  shift_end   time        NULL,
  notes       text        NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT agent_routing_config_shift_both_or_neither
    CHECK (
      (shift_start IS NULL AND shift_end IS NULL)
      OR (shift_start IS NOT NULL AND shift_end IS NOT NULL)
    )
);

COMMENT ON TABLE public.agent_routing_config IS
  'Per-agent routing configuration: shift windows, daily lead caps, and waterfall priority.';
COMMENT ON COLUMN public.agent_routing_config.daily_cap IS
  'Max new leads assignable per calendar day (IST). NULL = no cap.';
COMMENT ON COLUMN public.agent_routing_config.shift_start IS
  'IST shift start time. NULL = always available. Must be set together with shift_end.';
COMMENT ON COLUMN public.agent_routing_config.shift_end IS
  'IST shift end time. NULL = always available. Must be set together with shift_start.';
COMMENT ON COLUMN public.agent_routing_config.priority IS
  'Waterfall order: lower = higher priority. Determines pool ordering for pickNextAgentForDomain.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX agent_routing_config_domain_active_idx
  ON public.agent_routing_config (domain, is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. UPDATED_AT TRIGGER (reuse/replace the existing set_updated_at helper)
-- ─────────────────────────────────────────────────────────────────────────────

-- set_updated_at() was first introduced in migration 057.
-- CREATE OR REPLACE is idempotent; no change to existing triggers.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_routing_config_updated_at
  BEFORE UPDATE ON public.agent_routing_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.agent_routing_config ENABLE ROW LEVEL SECURITY;

-- Admins can read and write all rows via the authenticated role.
-- Uses get_user_role() (post-058: profiles-only, no JWT trust).
CREATE POLICY "agent_routing_config_admin_all"
  ON public.agent_routing_config
  FOR ALL
  TO authenticated
  USING  (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- Service role has unrestricted SELECT — used by the ingestion engine
-- (getServiceSupabaseClient bypasses RLS, but an explicit policy is cleaner).
CREATE POLICY "agent_routing_config_service_select"
  ON public.agent_routing_config
  FOR SELECT
  TO service_role
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. SEED — preserve existing waterfall behaviour exactly
-- ─────────────────────────────────────────────────────────────────────────────
--
-- shift_start / shift_end are IST times (stored as TIME, applied as Asia/Kolkata).
--
-- Meghana + Amit: shift_start/end = NULL → always eligible (night + day shift).
-- Samson + Kaniisha: day-shift only (11:00–19:59 IST) → excluded during night hours.
-- Samson: daily_cap = 15 matches the previously hardcoded SAMSON_DAILY_CAP.
--
-- The JOIN against profiles resolves emails → user_id UUIDs.
-- If a profile row for an email does not yet exist, that agent is silently skipped;
-- the ingestion engine will fall back to the unfiltered domain pool.
-- ON CONFLICT (email) DO NOTHING makes this idempotent on re-run.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.agent_routing_config
  (user_id, email, domain, is_active, daily_cap, priority, shift_start, shift_end, notes)
SELECT
  p.id,
  p.email,
  'indulge_concierge',
  true,
  caps.daily_cap,
  caps.priority,
  caps.shift_start::time,
  caps.shift_end::time,
  caps.notes
FROM public.profiles p
JOIN (
  VALUES
    ('meghana@indulge.global',  NULL::integer, 10,  NULL::text, NULL::text, 'Night + day shift; always available'),
    ('amit@indulge.global',     NULL,          20,  NULL,       NULL,       'Night + day shift; always available'),
    ('samson@indulge.global',   15,            30,  '11:00',    '19:59',    'Day shift only; daily cap 15'),
    ('kaniisha@indulge.global', NULL,          40,  '11:00',    '19:59',    'Day shift only; no cap')
) AS caps (email, daily_cap, priority, shift_start, shift_end, notes)
  ON p.email = caps.email
ON CONFLICT (email) DO NOTHING;
