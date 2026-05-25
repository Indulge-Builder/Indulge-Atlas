-- =============================================================================
-- Migration 100: Restore pick_next_agent_for_domain with p_allowed_uuids support
-- =============================================================================
--
-- Migration 060 replaced the two-argument function (domain, uuids[]) with a
-- single-argument TEXT version, silently dropping p_allowed_uuids. This broke
-- the waterfall routing in leadIngestion.ts — the shift/cap pool computed by
-- resolveAssignedAgent was being ignored, and ALL agents were in the pool.
--
-- This migration drops the single-arg TEXT version and recreates the function
-- with both arguments, preserving the advisory lock from migration 060 and the
-- is_on_leave guard from migration 049. The Samson-only cap is removed — daily
-- caps are now managed entirely by the application-layer waterfall in
-- leadIngestion.ts via agent_routing_config.
--
-- =============================================================================

-- Drop the broken single-arg version installed by migration 060.
DROP FUNCTION IF EXISTS public.pick_next_agent_for_domain(TEXT);

-- Recreate with both args: domain (TEXT, with indulge_global normalisation)
-- and optional uuids filter array.
CREATE OR REPLACE FUNCTION public.pick_next_agent_for_domain(
  p_domain       TEXT,
  p_allowed_uuids UUID[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id UUID;
  v_domain   TEXT;
BEGIN
  -- Legacy domain name normalisation.
  v_domain := CASE WHEN p_domain = 'indulge_global' THEN 'indulge_concierge' ELSE p_domain END;

  -- Advisory lock serialises concurrent webhook calls for the same domain so
  -- two simultaneous leads never pick the same agent.
  PERFORM pg_advisory_xact_lock(hashtext('agent_assignment_' || COALESCE(v_domain, '')));

  SELECT p.id INTO v_agent_id
  FROM public.profiles p
  LEFT JOIN (
    SELECT assigned_to, COUNT(*) AS new_lead_count
    FROM   public.leads
    WHERE  status = 'new'
    GROUP  BY assigned_to
  ) lc ON lc.assigned_to = p.id
  WHERE p.role          = 'agent'
    AND p.domain::TEXT  = v_domain
    AND p.is_active     = true
    AND (p.is_on_leave IS NULL OR p.is_on_leave = false)
    -- When the application passes an eligible UUID pool (shift + cap filtered),
    -- restrict to that pool. NULL means full domain pool (fallback path).
    AND (p_allowed_uuids IS NULL OR p.id = ANY(p_allowed_uuids))
  ORDER BY COALESCE(lc.new_lead_count, 0) ASC, p.created_at ASC
  LIMIT 1;

  RETURN v_agent_id;
END;
$$;

COMMENT ON FUNCTION public.pick_next_agent_for_domain(TEXT, UUID[]) IS
  'Returns the UUID of the next agent for round-robin assignment. Advisory-locked per domain to prevent duplicate assignment under concurrent webhook calls. When p_allowed_uuids is supplied (shift/cap pool from leadIngestion waterfall), only those agents are eligible. Returns NULL when no active, available agent exists.';
