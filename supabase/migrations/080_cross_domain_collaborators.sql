-- =============================================================================
-- INDULGE ATLAS — Cross-domain lead collaboration (explicit row grants)
-- Migration 080: lead_collaborators + RLS extensions (base silo + explicit grant)
-- =============================================================================
-- Mirrors the philosophy of project_members for Omni-Tasks: default isolation,
-- access widened only per-row via an auditable junction table.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABLE: lead_collaborators
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_collaborators (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by   uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, user_id)
);

CREATE INDEX IF NOT EXISTS lead_collaborators_lead_id_idx
  ON public.lead_collaborators (lead_id);
CREATE INDEX IF NOT EXISTS lead_collaborators_user_id_idx
  ON public.lead_collaborators (user_id);

COMMENT ON TABLE public.lead_collaborators IS
  'Explicit per-lead access grants for users outside the lead''s domain (cross-BU collaboration). RLS on leads still denies by default; a row here opens SELECT for that user only.';
COMMENT ON COLUMN public.lead_collaborators.added_by IS
  'Profile that granted access (nullable if removed from auth).';

COMMENT ON TABLE public.project_members IS
  'Omni-Task / project ACL — same explicit-grant model as lead_collaborators: membership rows widen access beyond domain defaults.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. STABLE HELPER (used by policies; SECURITY DEFINER bypasses RLS safely)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_lead_collaborator(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lead_collaborators lc
    WHERE lc.lead_id = p_lead_id
      AND lc.user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_lead_collaborator(uuid) IS
  'True when the current user has an explicit lead_collaborators grant for p_lead_id. Used by RLS; reads junction under definer to avoid policy recursion.';

GRANT EXECUTE ON FUNCTION public.is_lead_collaborator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_lead_collaborator(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS: lead_collaborators
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.lead_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_collaborators_service_all" ON public.lead_collaborators
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- SELECT: grantee, who added them, admins, or anyone who may manage the lead
-- (subquery on leads uses non-collaborator predicates only — no recursion)
CREATE POLICY "lead_collaborators_select" ON public.lead_collaborators
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder')
    OR user_id = auth.uid()
    OR added_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_collaborators.lead_id
        AND (
          public.get_user_domain() = 'indulge_global'
          OR (
            public.get_user_role() = 'manager'
            AND l.domain::TEXT = public.get_user_domain()
          )
          OR (
            public.get_user_role() = 'agent'
            AND l.assigned_to = auth.uid()
            AND l.domain::TEXT = public.get_user_domain()
          )
          OR (
            public.get_user_role() = 'guest'
            AND l.domain::TEXT = public.get_user_domain()
          )
        )
    )
  );

-- INSERT: same gate as leads_update (owner-agent or domain manager; admin/founder)
CREATE POLICY "lead_collaborators_insert" ON public.lead_collaborators
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('admin', 'founder')
    OR (
      public.get_user_role() = 'manager'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_collaborators.lead_id
          AND l.domain::TEXT = public.get_user_domain()
      )
    )
    OR (
      public.get_user_role() = 'agent'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_collaborators.lead_id
          AND l.assigned_to = auth.uid()
          AND l.domain::TEXT = public.get_user_domain()
      )
    )
  );

-- DELETE: same managers / owners as insert
CREATE POLICY "lead_collaborators_delete" ON public.lead_collaborators
  FOR DELETE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder')
    OR (
      public.get_user_role() = 'manager'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_collaborators.lead_id
          AND l.domain::TEXT = public.get_user_domain()
      )
    )
    OR (
      public.get_user_role() = 'agent'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_collaborators.lead_id
          AND l.assigned_to = auth.uid()
          AND l.domain::TEXT = public.get_user_domain()
      )
    )
  );

GRANT SELECT, INSERT, DELETE ON public.lead_collaborators TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. leads: extend SELECT (collaborator grant)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "leads_select" ON public.leads;

CREATE POLICY "leads_select" ON public.leads
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder')
    OR public.get_user_domain() = 'indulge_global'
    OR (
      public.get_user_role() = 'manager'
      AND domain::TEXT = public.get_user_domain()
    )
    OR (
      public.get_user_role() = 'agent'
      AND (
        assigned_to = auth.uid()
        OR domain::TEXT = public.get_user_domain()
      )
    )
    OR (
      public.get_user_role() = 'guest'
      AND domain::TEXT = public.get_user_domain()
    )
    OR public.is_lead_collaborator(id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. lead_activities: collaborator read + append timeline
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "lead_activities_select" ON public.lead_activities;
DROP POLICY IF EXISTS "lead_activities_insert" ON public.lead_activities;

CREATE POLICY "lead_activities_select" ON public.lead_activities
  FOR SELECT USING (
    public.get_user_role() IN ('admin', 'founder')
    OR public.get_user_domain() = 'indulge_global'
    OR (
      public.get_user_role() IN ('manager', 'guest')
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id AND l.domain::TEXT = public.get_user_domain()
      )
    )
    OR (
      public.get_user_role() = 'agent'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id
          AND l.assigned_to = auth.uid()
          AND l.domain::TEXT = public.get_user_domain()
      )
    )
    OR public.is_lead_collaborator(lead_id)
  );

CREATE POLICY "lead_activities_insert" ON public.lead_activities
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'manager')
    OR (
      public.get_user_role() = 'agent'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id
          AND l.assigned_to = auth.uid()
          AND l.domain::TEXT = public.get_user_domain()
      )
    )
    OR public.is_lead_collaborator(lead_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. whatsapp_messages: collaborator parity with lead channel
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "whatsapp_messages_select" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_insert" ON public.whatsapp_messages;

CREATE POLICY "whatsapp_messages_select" ON public.whatsapp_messages
  FOR SELECT USING (
    public.get_user_role() IN ('admin', 'founder')
    OR (
      public.get_user_role() IN ('manager', 'guest')
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id AND l.domain::TEXT = public.get_user_domain()
      )
    )
    OR (
      public.get_user_role() = 'agent'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id
          AND l.assigned_to = auth.uid()
          AND l.domain::TEXT = public.get_user_domain()
      )
    )
    OR public.is_lead_collaborator(lead_id)
  );

CREATE POLICY "whatsapp_messages_insert" ON public.whatsapp_messages
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'manager')
    OR (
      public.get_user_role() = 'agent'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id
          AND l.assigned_to = auth.uid()
          AND l.domain::TEXT = public.get_user_domain()
      )
    )
    OR public.is_lead_collaborator(lead_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. shop_orders: read/write when user is lead collaborator (sourcing)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "shop_orders_select" ON public.shop_orders;
DROP POLICY IF EXISTS "shop_orders_insert" ON public.shop_orders;
DROP POLICY IF EXISTS "shop_orders_update" ON public.shop_orders;

CREATE POLICY "shop_orders_select" ON public.shop_orders
  FOR SELECT USING (
    public.get_user_role() IN ('admin', 'founder')
    OR (
      public.get_user_role() IN ('manager', 'guest')
      AND (
        assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = lead_id AND l.domain::TEXT = public.get_user_domain()
        )
        OR EXISTS (
          SELECT 1 FROM public.tasks t
          JOIN public.leads l ON l.id = t.lead_id
          WHERE t.id = task_id AND l.domain::TEXT = public.get_user_domain()
        )
      )
    )
    OR (
      public.get_user_role() = 'agent'
      AND assigned_to = auth.uid()
    )
    OR public.is_lead_collaborator(lead_id)
  );

CREATE POLICY "shop_orders_insert" ON public.shop_orders
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'manager')
    OR (
      public.get_user_role() = 'agent'
      AND assigned_to = auth.uid()
    )
    OR public.is_lead_collaborator(lead_id)
  );

CREATE POLICY "shop_orders_update" ON public.shop_orders
  FOR UPDATE USING (
    public.get_user_role() IN ('admin', 'founder', 'manager')
    OR (
      public.get_user_role() = 'agent'
      AND assigned_to = auth.uid()
    )
    OR public.is_lead_collaborator(lead_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. tasks: SELECT when linked lead has collaborator grant
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tasks_select_v2" ON public.tasks;

CREATE POLICY "tasks_select_v2" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    get_user_role() IN ('admin', 'founder')
    OR (
      unified_task_type = 'master'
      AND (
        domain = get_user_domain()
        OR get_user_domain() = 'indulge_global'
        OR domain IS NULL
        OR get_user_role() = 'manager'
      )
    )
    OR (
      unified_task_type = 'subtask'
      AND (
        domain = get_user_domain()
        OR get_user_domain() = 'indulge_global'
        OR get_user_role() = 'manager'
        OR assigned_to_users @> ARRAY[auth.uid()]
        OR created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = tasks.project_id
            AND pm.user_id = auth.uid()
        )
        OR (
          tasks.lead_id IS NOT NULL
          AND public.is_lead_collaborator(tasks.lead_id)
        )
      )
    )
    OR (
      unified_task_type = 'personal'
      AND (
        assigned_to_users @> ARRAY[auth.uid()]
        OR created_by = auth.uid()
        OR get_user_role() = 'manager'
      )
    )
    OR assigned_to_users @> ARRAY[auth.uid()]
    OR (
      tasks.lead_id IS NOT NULL
      AND public.is_lead_collaborator(tasks.lead_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 9b. task_remarks: read when parent task is visible via lead collaboration
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "task_remarks_select" ON public.task_remarks;

CREATE POLICY "task_remarks_select" ON public.task_remarks
  FOR SELECT TO authenticated
  USING (
    get_user_role() IN ('admin', 'founder', 'manager')
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_remarks.task_id
        AND (
          t.domain = (SELECT domain::text FROM public.profiles WHERE id = auth.uid())
          OR (SELECT domain::text FROM public.profiles WHERE id = auth.uid()) = 'indulge_global'
          OR (
            t.lead_id IS NOT NULL
            AND public.is_lead_collaborator(t.lead_id)
          )
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. clients: collaborator may view client row tied to granted lead
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "clients_select" ON public.clients;

CREATE POLICY "clients_select" ON public.clients
  FOR SELECT USING (
    closed_by = auth.uid()
    OR public.get_user_role() IN ('admin', 'founder', 'manager')
    OR EXISTS (
      SELECT 1 FROM public.lead_collaborators lc
      WHERE lc.lead_id = clients.lead_origin_id
        AND lc.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Realtime: collaborator changes push to dossier / invitee clients
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.lead_collaborators REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lead_collaborators'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_collaborators;
  END IF;
END $$;
