-- Migration 117: One concierge agent can belong to MANY groups.
--
-- Today profiles.concierge_group is a single enum value that drives ticket RLS
-- visibility, edit rights, and agent assignment. Agents actually handle several
-- groups, so this adds a many-to-many join `concierge_agent_groups` (keyed by the
-- concierge_group enum — the same value tickets.org_group uses, so RLS stays a
-- direct enum match with no slug bridge).
--
-- profiles.concierge_group is KEPT as the agent's "primary" group (used to default
-- the group when they create a ticket). The join table is the full membership set.
--
-- RLS is extended ADDITIVELY: the existing `org_group = your primary` clause is
-- kept and OR-ed with membership, so no one loses access they had before.

-- ── join table ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.concierge_agent_groups (
  profile_id uuid              NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_group  public.concierge_group NOT NULL,
  created_at timestamptz       NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, org_group)
);

CREATE INDEX IF NOT EXISTS idx_concierge_agent_groups_group
  ON public.concierge_agent_groups (org_group);

ALTER TABLE public.concierge_agent_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "concierge_agent_groups_select"
  ON public.concierge_agent_groups FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

CREATE POLICY "concierge_agent_groups_write"
  ON public.concierge_agent_groups FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder', 'super_admin'))
  WITH CHECK (public.get_user_role() IN ('admin', 'founder', 'super_admin'));

CREATE POLICY "concierge_agent_groups_service_role"
  ON public.concierge_agent_groups
  USING (auth.role() = 'service_role');

-- Backfill each agent's current single group as their first membership.
INSERT INTO public.concierge_agent_groups (profile_id, org_group)
SELECT id, concierge_group FROM public.profiles WHERE concierge_group IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── membership helper (SECURITY DEFINER, mirrors get_user_role pattern) ───────

CREATE OR REPLACE FUNCTION public.user_in_concierge_group(g public.concierge_group)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.concierge_agent_groups cag
    WHERE cag.profile_id = auth.uid() AND cag.org_group = g
  );
$function$;

-- ── extend the RLS helper functions (additive OR membership) ─────────────────

CREATE OR REPLACE FUNCTION public.can_view_concierge_ticket(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.concierge_tickets t
    WHERE t.id = p_ticket_id
      AND (
        public.get_user_role() IN ('admin','founder','super_admin')
        OR public.get_user_department() = 'finance'
        OR (
          public.get_user_department() = 'concierge'
          AND (
            t.org_group::text = (SELECT p.concierge_group::text FROM public.profiles p WHERE p.id = auth.uid())
            OR public.user_in_concierge_group(t.org_group)
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_edit_concierge_ticket(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.concierge_tickets t
    WHERE t.id = p_ticket_id
      AND (
        public.get_user_role() IN ('admin','founder','super_admin')
        OR (
          public.get_user_department() = 'concierge'
          AND (
            t.org_group::text = (SELECT p.concierge_group::text FROM public.profiles p WHERE p.id = auth.uid())
            OR public.user_in_concierge_group(t.org_group)
          )
          AND (t.assigned_to = auth.uid() OR public.get_user_role() = 'manager')
        )
      )
  );
$function$;

-- ── extend the concierge_tickets table policies (additive OR membership) ─────

DROP POLICY IF EXISTS "concierge_tickets_select" ON public.concierge_tickets;
CREATE POLICY "concierge_tickets_select"
  ON public.concierge_tickets FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin','founder','super_admin')
    OR public.get_user_department() = 'finance'
    OR (
      public.get_user_department() = 'concierge'
      AND (
        org_group::text = (SELECT p.concierge_group::text FROM public.profiles p WHERE p.id = auth.uid())
        OR public.user_in_concierge_group(org_group)
      )
    )
  );

DROP POLICY IF EXISTS "concierge_tickets_insert" ON public.concierge_tickets;
CREATE POLICY "concierge_tickets_insert"
  ON public.concierge_tickets FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('admin','founder','super_admin')
    OR (
      public.get_user_role() = 'manager'
      AND public.get_user_department() = 'concierge'
      AND (
        org_group::text = (SELECT p.concierge_group::text FROM public.profiles p WHERE p.id = auth.uid())
        OR public.user_in_concierge_group(org_group)
      )
    )
  );

DROP POLICY IF EXISTS "concierge_tickets_update" ON public.concierge_tickets;
CREATE POLICY "concierge_tickets_update"
  ON public.concierge_tickets FOR UPDATE TO authenticated
  USING (
    public.get_user_role() IN ('admin','founder','super_admin')
    OR (
      public.get_user_department() = 'concierge'
      AND (
        org_group::text = (SELECT p.concierge_group::text FROM public.profiles p WHERE p.id = auth.uid())
        OR public.user_in_concierge_group(org_group)
      )
      AND (assigned_to = auth.uid() OR public.get_user_role() = 'manager')
    )
  )
  WITH CHECK (
    public.get_user_role() IN ('admin','founder','super_admin')
    OR (
      public.get_user_department() = 'concierge'
      AND (
        org_group::text = (SELECT p.concierge_group::text FROM public.profiles p WHERE p.id = auth.uid())
        OR public.user_in_concierge_group(org_group)
      )
      AND (assigned_to = auth.uid() OR public.get_user_role() = 'manager')
    )
  );
