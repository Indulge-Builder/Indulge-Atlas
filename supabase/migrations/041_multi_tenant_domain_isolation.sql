-- =============================================================================
-- INDULGE ATLAS — Multi-Tenant Domain Isolation
-- =============================================================================
--
-- Phase 1: Domain-based data isolation for agents.
-- - Agents see ONLY leads/tasks in their assigned domain.
-- - Scouts/Admins retain full cross-domain visibility (filtered client-side).
-- - Lead assignment engine filters agents by incoming lead's domain.
--
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. HELPER: get_my_domain()
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_domain()
RETURNS public.indulge_domain
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT domain FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    'indulge_global'::public.indulge_domain
  );
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS: LEADS — Agents restricted to their domain
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "leads_select" ON public.leads;

CREATE POLICY "leads_select" ON public.leads
  FOR SELECT USING (
    -- Scouts, admins, finance: see all
    public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
    OR
    -- Agents: only their assigned leads in their domain
    (
      assigned_to = auth.uid()
      AND domain = public.get_my_domain()
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS: TASKS — Agents restricted to tasks for leads in their domain
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (
    -- Scouts, admins, finance: see all
    public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
    OR
    -- Agents: tasks assigned to them where (no lead) OR (lead in their domain)
    (
      auth.uid() = ANY(assigned_to_users)
      AND (
        lead_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = tasks.lead_id
            AND l.domain = public.get_my_domain()
        )
      )
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. LEAD ASSIGNMENT: pick_next_agent_for_domain(domain)
-- ─────────────────────────────────────────────────────────────────────────────
-- Domain-aware round-robin. Only considers agents in the given domain.

CREATE OR REPLACE FUNCTION public.pick_next_agent_for_domain(p_domain public.indulge_domain)
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

COMMENT ON FUNCTION public.pick_next_agent_for_domain(public.indulge_domain) IS
  'Returns the UUID of the agent who should receive the next lead for the given domain. Domain-aware round-robin. Returns NULL if no eligible agents.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ADD indulge_house to enum (user spec)
-- ─────────────────────────────────────────────────────────────────────────────
-- Run once. Re-running may fail with "already exists" — safe to ignore.

ALTER TYPE public.indulge_domain ADD VALUE IF NOT EXISTS 'indulge_house';
