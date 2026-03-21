-- =============================================================================
-- INDULGE ATLAS — Agent Leave Status + Routing Guard
-- =============================================================================
--
-- Adds an explicit leave toggle to profiles and ensures the assignment RPC
-- never returns an agent who is currently on leave.
--
-- =============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_on_leave boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.pick_next_agent_for_domain(
  p_domain public.indulge_domain,
  p_allowed_uuids uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agent_lead_counts AS (
    SELECT
      p.id,
      p.email,
      COUNT(l.id) FILTER (WHERE l.status = 'new')::int AS new_lead_count
    FROM public.profiles p
    LEFT JOIN public.leads l ON l.assigned_to = p.id AND l.domain = p_domain
    WHERE p.role = 'agent'
      AND p.is_active = true
      AND p.is_on_leave = false
      AND p.domain = p_domain
      AND (p_allowed_uuids IS NULL OR p.id = ANY(p_allowed_uuids))
    GROUP BY p.id, p.email
  ),
  eligible_agents AS (
    SELECT id, new_lead_count
    FROM agent_lead_counts
    WHERE NOT (
      email = 'samson@indulge.global' AND new_lead_count >= 15
    )
  )
  SELECT id
  FROM eligible_agents
  ORDER BY new_lead_count ASC, id ASC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.pick_next_agent_for_domain(public.indulge_domain, uuid[]) IS
  'Returns the UUID of the agent who should receive the next lead for the given domain. Domain-aware round-robin. Excludes inactive and on-leave agents. When p_allowed_uuids is provided, only those agents are eligible. Returns NULL if no eligible agents.';
