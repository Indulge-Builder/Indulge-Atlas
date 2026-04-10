-- =============================================================================
-- Migration 060: Advisory lock for agent assignment + WhatsApp thread view
-- =============================================================================
-- 2.5 — Serialize pick_next_agent_for_domain per domain under burst traffic.
-- 2.1 — vw_latest_whatsapp_threads: latest message per lead (no O(n) JS dedupe).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pick_next_agent_for_domain(p_domain TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id UUID;
  v_domain   TEXT;
BEGIN
  v_domain := CASE WHEN p_domain = 'indulge_global' THEN 'indulge_concierge' ELSE p_domain END;

  PERFORM pg_advisory_xact_lock(hashtext('agent_assignment_' || COALESCE(v_domain, '')));

  SELECT p.id INTO v_agent_id
  FROM public.profiles p
  LEFT JOIN (
    SELECT assigned_to, COUNT(*) AS new_lead_count
    FROM   public.leads
    WHERE  status = 'new'
    GROUP  BY assigned_to
  ) lc ON lc.assigned_to = p.id
  WHERE p.role      = 'agent'
    AND p.domain::TEXT = v_domain
    AND p.is_active = true
    AND (p.is_on_leave IS NULL OR p.is_on_leave = false)
    AND COALESCE(lc.new_lead_count, 0) < 15
  ORDER BY COALESCE(lc.new_lead_count, 0) ASC, p.created_at ASC
  LIMIT 1;

  RETURN v_agent_id;
END;
$$;

CREATE OR REPLACE VIEW public.vw_latest_whatsapp_threads AS
SELECT DISTINCT ON (lead_id) *
FROM public.whatsapp_messages
ORDER BY lead_id, created_at DESC;

COMMENT ON VIEW public.vw_latest_whatsapp_threads IS
  'One row per lead: the most recent whatsapp_messages row (hub thread list).';

GRANT SELECT ON public.vw_latest_whatsapp_threads TO authenticated;
GRANT SELECT ON public.vw_latest_whatsapp_threads TO service_role;
