-- ============================================================
-- Indulge Atlas — Task System v2.0
-- Migration 076: Group Tasks + Personal Task Privacy
-- (067 already used — this extends unified_task_type + RLS.)
-- ============================================================

-- ── 1. Extend unified_task_type CHECK (TEXT column from 067) ─────────────────

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_unified_task_type_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_unified_task_type_check
  CHECK (unified_task_type IN ('master', 'subtask', 'personal', 'group'));

-- ── 2. New columns on tasks ─────────────────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS parent_group_task_id uuid
    REFERENCES public.tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'personal'
    CHECK (visibility IN ('personal', 'group', 'org')),
  ADD COLUMN IF NOT EXISTS is_daily boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_date date;

-- Backfill visibility for existing Atlas rows (master/subtask → org scope)
UPDATE public.tasks
SET visibility = 'org'
WHERE unified_task_type IN ('master', 'subtask')
  AND visibility = 'personal';

-- ── 3. group_task_members ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.group_task_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'contributor'
              CHECK (role IN ('owner', 'contributor', 'reviewer')),
  added_by    uuid REFERENCES public.profiles(id),
  added_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

ALTER TABLE public.group_task_members ENABLE ROW LEVEL SECURITY;

-- ── 4. Helpers (SECURITY DEFINER) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_group_task_member(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_task_members gtm
    WHERE gtm.task_id = p_task_id AND gtm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_reports_to(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT reports_to FROM public.profiles WHERE id = p_user_id;
$$;

-- ── 5. Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tasks_parent_group_task_id
  ON public.tasks(parent_group_task_id)
  WHERE parent_group_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_visibility ON public.tasks(visibility);

CREATE INDEX IF NOT EXISTS idx_tasks_is_daily
  ON public.tasks(is_daily, daily_date)
  WHERE is_daily = true;

CREATE INDEX IF NOT EXISTS idx_group_task_members_user_id
  ON public.group_task_members(user_id);

CREATE INDEX IF NOT EXISTS idx_group_task_members_task_id
  ON public.group_task_members(task_id);

CREATE INDEX IF NOT EXISTS idx_tasks_unified_type_dept
  ON public.tasks(unified_task_type, department)
  WHERE archived_at IS NULL;

-- ── 6. RLS — group_task_members ──────────────────────────────────────────────

DROP POLICY IF EXISTS "gtm_select" ON public.group_task_members;
CREATE POLICY "gtm_select" ON public.group_task_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR get_user_role() IN ('manager', 'founder', 'admin', 'super_admin')
  );

DROP POLICY IF EXISTS "gtm_insert" ON public.group_task_members;
CREATE POLICY "gtm_insert" ON public.group_task_members
  FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() IN ('founder', 'admin', 'manager', 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.group_task_members gtm2
      WHERE gtm2.task_id = group_task_members.task_id
        AND gtm2.user_id = auth.uid()
        AND gtm2.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "gtm_delete" ON public.group_task_members;
CREATE POLICY "gtm_delete" ON public.group_task_members
  FOR DELETE TO authenticated
  USING (
    get_user_role() IN ('founder', 'admin', 'manager', 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.group_task_members gtm2
      WHERE gtm2.task_id = group_task_members.task_id
        AND gtm2.user_id = auth.uid()
        AND gtm2.role = 'owner'
    )
  );

-- ── 7. Replace tasks SELECT policy — merged v3 (master/subtask/personal/group) ─

DROP POLICY IF EXISTS "tasks_select_v2" ON public.tasks;

CREATE POLICY "tasks_select_v3" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    get_user_role() IN ('admin', 'founder', 'super_admin')
    OR
    (
      unified_task_type = 'master'
      AND (
        domain = get_user_domain()
        OR get_user_domain() = 'indulge_global'
        OR domain IS NULL
        OR get_user_role() = 'manager'
      )
    )
    OR
    (
      unified_task_type = 'subtask'
      AND (
        (
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
        )
        OR (
          parent_group_task_id IS NOT NULL
          AND (
            assigned_to_users @> ARRAY[auth.uid()]
            OR public.is_group_task_member(parent_group_task_id)
            OR get_user_role() IN ('founder', 'admin', 'manager', 'super_admin')
          )
        )
      )
    )
    OR
    (
      unified_task_type = 'personal'
      AND (
        assigned_to_users @> ARRAY[auth.uid()]
        OR created_by = auth.uid()
        OR auth.uid() = public.get_reports_to(created_by)
        OR get_user_role() IN ('founder', 'admin', 'super_admin')
        OR (
          get_user_role() = 'manager'
          AND auth.uid() = public.get_reports_to(created_by)
        )
      )
    )
    OR
    (
      unified_task_type = 'group'
      AND (
        public.is_group_task_member(id)
        OR get_user_role() IN ('founder', 'admin', 'manager', 'super_admin')
      )
    )
    OR
    assigned_to_users @> ARRAY[auth.uid()]
  );

-- ── 8. Realtime ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_task_members;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
