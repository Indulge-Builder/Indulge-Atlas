-- =============================================================================
-- INDULGE ATLAS — Waterfall Routing: pick_next_agent_for_domain with allowed UUIDs
-- =============================================================================
--
-- Extends pick_next_agent_for_domain to accept an optional p_allowed_uuids array.
-- When provided, only agents whose id is in the array are eligible for round-robin.
-- When NULL, behavior is unchanged (full domain pool).
--
-- Used by the Waterfall Routing Engine in leadIngestion.ts to dynamically
-- filter the agent pool based on time-of-day (IST) and daily lead caps.
--
-- =============================================================================

-- Drop the old single-arg version before creating the new overloaded signature
DROP FUNCTION IF EXISTS public.pick_next_agent_for_domain(public.indulge_domain);

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
  'Returns the UUID of the agent who should receive the next lead for the given domain. Domain-aware round-robin. When p_allowed_uuids is provided, only those agents are eligible. Returns NULL if no eligible agents.';
