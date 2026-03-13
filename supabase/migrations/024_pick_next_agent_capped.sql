-- =============================================================================
-- INDULGE ATLAS — pick_next_agent_capped RPC
-- =============================================================================
--
-- Returns the UUID of the agent who should receive the next lead.
-- Load-balanced round-robin: picks the agent with the lowest active 'new' lead
-- count among eligible agents.
--
-- Logic:
--   1. Fetches all profiles where role = 'agent' and is_active = true
--   2. Counts each agent's leads with status = 'new'
--   3. Samson Exception: Excludes samson@indulge.global if their new lead count >= 15
--   4. Returns the agent with the LOWEST count (tiebreaker: id ASC)
--   5. Returns NULL if no eligible agents
--
-- Optimized as a single SQL query.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pick_next_agent_capped()
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
    LEFT JOIN public.leads l ON l.assigned_to = p.id
    WHERE p.role = 'agent' AND p.is_active = true
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

COMMENT ON FUNCTION public.pick_next_agent_capped() IS
  'Returns the UUID of the agent who should receive the next lead (load-balanced round-robin). Excludes samson@indulge.global when they have 15+ new leads. Returns NULL if no eligible agents.';
